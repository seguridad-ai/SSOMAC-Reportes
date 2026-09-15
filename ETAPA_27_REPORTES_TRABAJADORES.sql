-- ============================================================
-- ETAPA 27
-- FORMULARIO PUBLICO DE TRABAJADORES + BANDEJA DE REVISION
-- ============================================================

-- ------------------------------------------------------------
-- 1. CAMPOS DE CONTROL DEL REPORTE PUBLICO
-- ------------------------------------------------------------
alter table public.reportes_trabajadores
add column if not exists token_publico uuid not null default gen_random_uuid();

alter table public.reportes_trabajadores
add column if not exists actualizado_en timestamptz;

create unique index if not exists uq_reportes_trabajadores_token_publico
on public.reportes_trabajadores(token_publico);

create unique index if not exists uq_reportes_trabajadores_ocurrencia
on public.reportes_trabajadores(ocurrencia_id)
where ocurrencia_id is not null;

-- La ocurrencia formal conserva quién reportó realmente si fue un trabajador.
alter table public.ocurrencias
add column if not exists reportado_por_externo text;

alter table public.ocurrencias
add column if not exists reporte_trabajador_id uuid
references public.reportes_trabajadores(id)
on delete set null;

create unique index if not exists uq_ocurrencia_reporte_trabajador
on public.ocurrencias(reporte_trabajador_id)
where reporte_trabajador_id is not null;

-- Una sola asignación activa por ocurrencia.
create unique index if not exists uq_asignacion_activa_por_ocurrencia
on public.asignaciones_levantamiento(ocurrencia_id)
where activo = true;


-- ------------------------------------------------------------
-- 2. FUNCIONES PUBLICAS DE SOLO LECTURA
-- No exponen correos ni datos sensibles.
-- ------------------------------------------------------------
create or replace function public.public_listar_proyectos_reporte()
returns table (
    id uuid,
    codigo text,
    nombre text,
    cliente text
)
language sql
security definer
set search_path = public, pg_temp
as $$
    select p.id, p.codigo, p.nombre, p.cliente
    from public.proyectos p
    where p.activo = true
    order by p.nombre;
$$;

revoke all on function public.public_listar_proyectos_reporte() from public;
grant execute on function public.public_listar_proyectos_reporte() to anon, authenticated;


create or replace function public.public_listar_tipos_reporte()
returns table (
    id uuid,
    codigo text,
    nombre text
)
language sql
security definer
set search_path = public, pg_temp
as $$
    select th.id, th.codigo, th.nombre
    from public.tipos_hallazgo th
    where th.activo = true
      and th.codigo in ('ACTO', 'CONDICION')
    order by th.orden;
$$;

revoke all on function public.public_listar_tipos_reporte() from public;
grant execute on function public.public_listar_tipos_reporte() to anon, authenticated;


create or replace function public.public_listar_responsables_reporte(
    p_proyecto_id uuid
)
returns table (
    id uuid,
    nombre_completo text,
    cargo text,
    area text,
    sede text,
    alcance text
)
language sql
security definer
set search_path = public, pg_temp
as $$
    select
        r.id,
        btrim(coalesce(r.nombres, '') || ' ' || coalesce(r.apellidos, '')) as nombre_completo,
        r.cargo,
        r.area_nombre as area,
        r.sede,
        case when r.aplica_todos_proyectos then 'TODOS LOS PROYECTOS' else 'PROYECTO' end as alcance
    from public.responsables_correccion r
    where r.activo = true
      and (
            r.aplica_todos_proyectos = true
            or r.proyecto_id = p_proyecto_id
          )
    order by r.apellidos, r.nombres;
$$;

revoke all on function public.public_listar_responsables_reporte(uuid) from public;
grant execute on function public.public_listar_responsables_reporte(uuid) to anon, authenticated;


-- ------------------------------------------------------------
-- 3. REGISTRAR REPORTE DEL TRABAJADOR SIN LOGIN
-- ------------------------------------------------------------
create or replace function public.registrar_reporte_trabajador_publico(
    p_proyecto_id uuid,
    p_fecha date,
    p_reportado_por_nombre text,
    p_tipo_hallazgo_id uuid,
    p_lugar_hallazgo text,
    p_descripcion text,
    p_responsable_id uuid
)
returns table (
    reporte_id uuid,
    numero bigint,
    token_publico uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_numero bigint;
    v_token uuid;
begin
    if p_proyecto_id is null
       or not exists (
            select 1
            from public.proyectos p
            where p.id = p_proyecto_id
              and p.activo = true
       ) then
        raise exception 'Proyecto no válido';
    end if;

    if p_tipo_hallazgo_id is null
       or not exists (
            select 1
            from public.tipos_hallazgo th
            where th.id = p_tipo_hallazgo_id
              and th.activo = true
              and th.codigo in ('ACTO', 'CONDICION')
       ) then
        raise exception 'Debe seleccionar ACTO o CONDICION';
    end if;

    if p_responsable_id is null
       or not exists (
            select 1
            from public.responsables_correccion r
            where r.id = p_responsable_id
              and r.activo = true
              and (
                    r.aplica_todos_proyectos = true
                    or r.proyecto_id = p_proyecto_id
                  )
       ) then
        raise exception 'Responsable no válido para el proyecto';
    end if;

    if char_length(btrim(coalesce(p_reportado_por_nombre, ''))) < 5 then
        raise exception 'Ingrese nombres y apellidos del trabajador';
    end if;

    if char_length(btrim(coalesce(p_lugar_hallazgo, ''))) < 2 then
        raise exception 'Ingrese el lugar del hallazgo';
    end if;

    if char_length(btrim(coalesce(p_descripcion, ''))) < 5 then
        raise exception 'Describa el hallazgo';
    end if;

    if p_fecha is null then
        p_fecha := current_date;
    end if;

    insert into public.reportes_trabajadores (
        proyecto_id,
        fecha,
        reportado_por_nombre,
        lugar_hallazgo,
        tipo_hallazgo_id,
        descripcion,
        responsable_propuesto_id,
        estado_revision
    ) values (
        p_proyecto_id,
        p_fecha,
        btrim(p_reportado_por_nombre),
        btrim(p_lugar_hallazgo),
        p_tipo_hallazgo_id,
        btrim(p_descripcion),
        p_responsable_id,
        'NUEVO'
    )
    returning id, reportes_trabajadores.numero, reportes_trabajadores.token_publico
    into v_id, v_numero, v_token;

    return query select v_id, v_numero, v_token;
end;
$$;

revoke all on function public.registrar_reporte_trabajador_publico(uuid,date,text,uuid,text,text,uuid) from public;
grant execute on function public.registrar_reporte_trabajador_publico(uuid,date,text,uuid,text,text,uuid) to anon, authenticated;


-- ------------------------------------------------------------
-- 4. VINCULAR LA FOTO DESPUES DE SUBIRLA A STORAGE
-- ------------------------------------------------------------
create or replace function public.adjuntar_foto_reporte_trabajador_publico(
    p_reporte_id uuid,
    p_token_publico uuid,
    p_ruta_foto text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if p_ruta_foto is null
       or p_ruta_foto not like ('reportes-trabajadores/' || p_reporte_id::text || '/hallazgo/%')
       or position('..' in p_ruta_foto) > 0 then
        raise exception 'Ruta de fotografía no válida';
    end if;

    update public.reportes_trabajadores
    set ruta_foto = p_ruta_foto,
        actualizado_en = now()
    where id = p_reporte_id
      and token_publico = p_token_publico
      and ruta_foto is null
      and estado_revision = 'NUEVO';

    if not found then
        raise exception 'No fue posible asociar la fotografía';
    end if;

    return true;
end;
$$;

revoke all on function public.adjuntar_foto_reporte_trabajador_publico(uuid,uuid,text) from public;
grant execute on function public.adjuntar_foto_reporte_trabajador_publico(uuid,uuid,text) to anon, authenticated;


-- ------------------------------------------------------------
-- 5. HELPERS PARA STORAGE
-- ------------------------------------------------------------
create or replace function public.puede_subir_foto_reporte_publico(
    p_reporte_id_text text
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.reportes_trabajadores rt
        where rt.id::text = p_reporte_id_text
          and rt.estado_revision = 'NUEVO'
          and rt.ruta_foto is null
          and rt.creado_en >= now() - interval '2 hours'
    );
$$;

revoke all on function public.puede_subir_foto_reporte_publico(text) from public;
grant execute on function public.puede_subir_foto_reporte_publico(text) to anon, authenticated;


create or replace function public.puede_ver_foto_reporte_trabajador(
    p_reporte_id_text text
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
    select auth.uid() is not null
       and exists (
            select 1
            from public.reportes_trabajadores rt
            where rt.id::text = p_reporte_id_text
              and public.puede_gestionar_proyecto(rt.proyecto_id)
       );
$$;

revoke all on function public.puede_ver_foto_reporte_trabajador(text) from public;
grant execute on function public.puede_ver_foto_reporte_trabajador(text) to authenticated;


-- ------------------------------------------------------------
-- 6. STORAGE: SUBIDA PUBLICA CONTROLADA Y LECTURA INTERNA
-- Bucket privado existente: evidencias-ssomac
-- Ruta: reportes-trabajadores/<UUID>/hallazgo/foto.webp
-- ------------------------------------------------------------
grant insert on storage.objects to anon, authenticated;

drop policy if exists "subir foto reporte trabajador publico"
on storage.objects;

create policy "subir foto reporte trabajador publico"
on storage.objects
for insert
to anon, authenticated
with check (
    bucket_id = 'evidencias-ssomac'
    and (storage.foldername(name))[1] = 'reportes-trabajadores'
    and (storage.foldername(name))[3] = 'hallazgo'
    and public.puede_subir_foto_reporte_publico(
        (storage.foldername(name))[2]
    )
);


drop policy if exists "ver foto reporte trabajador autorizado"
on storage.objects;

create policy "ver foto reporte trabajador autorizado"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'evidencias-ssomac'
    and (storage.foldername(name))[1] = 'reportes-trabajadores'
    and public.puede_ver_foto_reporte_trabajador(
        (storage.foldername(name))[2]
    )
);


-- ------------------------------------------------------------
-- 7. CREAR ASIGNACION DE LEVANTAMIENTO
-- Esto se usará tanto en reportes creados por Seguridad como en
-- reportes de trabajadores validados por Seguridad.
-- ------------------------------------------------------------
create or replace function public.crear_asignacion_levantamiento(
    p_ocurrencia_id uuid,
    p_responsable_id uuid,
    p_fecha_limite date default null
)
returns table (
    asignacion_id uuid,
    token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_proyecto_id uuid;
    v_resp record;
    v_asignacion_id uuid;
    v_token uuid;
begin
    if auth.uid() is null then
        raise exception 'Debe iniciar sesión';
    end if;

    select o.proyecto_id
    into v_proyecto_id
    from public.ocurrencias o
    where o.id = p_ocurrencia_id;

    if v_proyecto_id is null
       or not public.puede_gestionar_proyecto(v_proyecto_id) then
        raise exception 'No tiene autorización para esta ocurrencia';
    end if;

    select r.*
    into v_resp
    from public.responsables_correccion r
    where r.id = p_responsable_id
      and r.activo = true
      and (
            r.aplica_todos_proyectos = true
            or r.proyecto_id = v_proyecto_id
          );

    if not found then
        raise exception 'Responsable no válido';
    end if;

    select a.id, a.token
    into v_asignacion_id, v_token
    from public.asignaciones_levantamiento a
    where a.ocurrencia_id = p_ocurrencia_id
      and a.activo = true
    limit 1;

    if found then
        return query select v_asignacion_id, v_token;
        return;
    end if;

    insert into public.asignaciones_levantamiento (
        ocurrencia_id,
        responsable_id,
        nombre_responsable,
        email_responsable,
        fecha_limite,
        estado,
        activo
    ) values (
        p_ocurrencia_id,
        p_responsable_id,
        btrim(coalesce(v_resp.nombres, '') || ' ' || coalesce(v_resp.apellidos, '')),
        v_resp.email,
        p_fecha_limite,
        'PENDIENTE',
        true
    )
    returning id, asignaciones_levantamiento.token
    into v_asignacion_id, v_token;

    return query select v_asignacion_id, v_token;
end;
$$;

revoke all on function public.crear_asignacion_levantamiento(uuid,uuid,date) from public;
grant execute on function public.crear_asignacion_levantamiento(uuid,uuid,date) to authenticated;


-- ------------------------------------------------------------
-- 8. VALIDAR REPORTE DE TRABAJADOR Y CONVERTIRLO EN OCURRENCIA
-- ------------------------------------------------------------
create or replace function public.validar_reporte_trabajador(
    p_reporte_id uuid,
    p_proyecto_id uuid,
    p_fecha date,
    p_reportado_por_nombre text,
    p_tipo_hallazgo_id uuid,
    p_lugar_hallazgo text,
    p_descripcion text,
    p_responsable_id uuid,
    p_acciones text,
    p_potencial_id uuid,
    p_area_id uuid,
    p_fecha_levantamiento date,
    p_causas_inmediatas uuid[] default '{}'::uuid[],
    p_causas_basicas uuid[] default '{}'::uuid[]
)
returns table (
    ocurrencia_id uuid,
    numero_ocurrencia bigint,
    asignacion_id uuid,
    token_levantamiento uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_reporte record;
    v_origen_id uuid;
    v_resp record;
    v_occ_id uuid;
    v_occ_num bigint;
    v_asig_id uuid;
    v_asig_token uuid;
    v_count integer;
begin
    if auth.uid() is null then
        raise exception 'Debe iniciar sesión';
    end if;

    select rt.*
    into v_reporte
    from public.reportes_trabajadores rt
    where rt.id = p_reporte_id
    for update;

    if not found then
        raise exception 'Reporte no encontrado';
    end if;

    if v_reporte.estado_revision in ('VALIDADO', 'DESCARTADO') then
        raise exception 'El reporte ya fue procesado';
    end if;

    if not public.puede_gestionar_proyecto(p_proyecto_id) then
        raise exception 'No tiene autorización para el proyecto seleccionado';
    end if;

    if not exists (
        select 1 from public.proyectos p
        where p.id = p_proyecto_id and p.activo = true
    ) then
        raise exception 'Proyecto no válido';
    end if;

    if not exists (
        select 1 from public.tipos_hallazgo th
        where th.id = p_tipo_hallazgo_id
          and th.activo = true
          and th.codigo in ('ACTO', 'CONDICION')
    ) then
        raise exception 'Tipo de hallazgo no válido';
    end if;

    select r.*
    into v_resp
    from public.responsables_correccion r
    where r.id = p_responsable_id
      and r.activo = true
      and (
            r.aplica_todos_proyectos = true
            or r.proyecto_id = p_proyecto_id
          );

    if not found then
        raise exception 'Responsable no válido';
    end if;

    select oh.id
    into v_origen_id
    from public.origenes_hallazgo oh
    where upper(oh.nombre) = 'REPORTE DE ACTO Y CONDICION'
      and oh.activo = true
    limit 1;

    if v_origen_id is null then
        raise exception 'No existe el origen REPORTE DE ACTO Y CONDICION';
    end if;

    insert into public.ocurrencias (
        proyecto_id,
        fecha,
        origen_hallazgo_id,
        tipo_hallazgo_id,
        lugar_hallazgo,
        descripcion,
        acciones_implementar,
        potencial_perdida_id,
        responsable_correccion_id,
        responsable_correccion,
        area_responsable_id,
        fecha_levantamiento,
        reportado_por_externo,
        reporte_trabajador_id
    ) values (
        p_proyecto_id,
        coalesce(p_fecha, v_reporte.fecha),
        v_origen_id,
        p_tipo_hallazgo_id,
        btrim(p_lugar_hallazgo),
        btrim(p_descripcion),
        nullif(btrim(coalesce(p_acciones, '')), ''),
        p_potencial_id,
        p_responsable_id,
        btrim(coalesce(v_resp.nombres, '') || ' ' || coalesce(v_resp.apellidos, '')),
        p_area_id,
        p_fecha_levantamiento,
        btrim(p_reportado_por_nombre),
        p_reporte_id
    )
    returning id, numero
    into v_occ_id, v_occ_num;

    -- Causas inmediatas válidas para el tipo seleccionado.
    if coalesce(array_length(p_causas_inmediatas, 1), 0) > 0 then
        select count(*) into v_count
        from public.causas_inmediatas ci
        where ci.id = any(p_causas_inmediatas)
          and ci.tipo_hallazgo_id = p_tipo_hallazgo_id
          and ci.activo = true;

        if v_count <> array_length(p_causas_inmediatas, 1) then
            raise exception 'Una o más causas inmediatas no corresponden al tipo seleccionado';
        end if;

        insert into public.ocurrencia_causas_inmediatas (
            ocurrencia_id,
            causa_inmediata_id
        )
        select v_occ_id, unnest(p_causas_inmediatas);
    end if;

    -- Causas básicas válidas para el tipo seleccionado.
    if coalesce(array_length(p_causas_basicas, 1), 0) > 0 then
        select count(*) into v_count
        from public.causas_basicas cb
        where cb.id = any(p_causas_basicas)
          and cb.tipo_hallazgo_id = p_tipo_hallazgo_id
          and cb.activo = true;

        if v_count <> array_length(p_causas_basicas, 1) then
            raise exception 'Una o más causas básicas no corresponden al tipo seleccionado';
        end if;

        insert into public.ocurrencia_causas_basicas (
            ocurrencia_id,
            causa_basica_id
        )
        select v_occ_id, unnest(p_causas_basicas);
    end if;

    -- La foto enviada por el trabajador pasa a ser evidencia del hallazgo.
    if v_reporte.ruta_foto is not null then
        insert into public.evidencias (
            ocurrencia_id,
            tipo_evidencia,
            ruta_archivo,
            creado_por_id
        ) values (
            v_occ_id,
            'HALLAZGO',
            v_reporte.ruta_foto,
            auth.uid()
        );
    end if;

    select ca.asignacion_id, ca.token
    into v_asig_id, v_asig_token
    from public.crear_asignacion_levantamiento(
        v_occ_id,
        p_responsable_id,
        p_fecha_levantamiento
    ) ca;

    update public.reportes_trabajadores
    set proyecto_id = p_proyecto_id,
        fecha = coalesce(p_fecha, v_reporte.fecha),
        reportado_por_nombre = btrim(p_reportado_por_nombre),
        lugar_hallazgo = btrim(p_lugar_hallazgo),
        tipo_hallazgo_id = p_tipo_hallazgo_id,
        descripcion = btrim(p_descripcion),
        responsable_propuesto_id = p_responsable_id,
        estado_revision = 'VALIDADO',
        revisado_por_id = auth.uid(),
        fecha_revision = now(),
        ocurrencia_id = v_occ_id,
        actualizado_en = now()
    where id = p_reporte_id;

    return query select v_occ_id, v_occ_num, v_asig_id, v_asig_token;
end;
$$;

revoke all on function public.validar_reporte_trabajador(uuid,uuid,date,text,uuid,text,text,uuid,text,uuid,uuid,date,uuid[],uuid[]) from public;
grant execute on function public.validar_reporte_trabajador(uuid,uuid,date,text,uuid,text,text,uuid,text,uuid,uuid,date,uuid[],uuid[]) to authenticated;


-- ------------------------------------------------------------
-- 9. VERIFICACION
-- ------------------------------------------------------------
select
    routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
      'public_listar_proyectos_reporte',
      'public_listar_tipos_reporte',
      'public_listar_responsables_reporte',
      'registrar_reporte_trabajador_publico',
      'adjuntar_foto_reporte_trabajador_publico',
      'crear_asignacion_levantamiento',
      'validar_reporte_trabajador'
  )
order by routine_name;
