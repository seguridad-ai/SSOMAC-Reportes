-- ============================================================
-- ETAPA 29
-- CORREO + LINK PUBLICO DE LEVANTAMIENTO + EVIDENCIA
-- ============================================================

-- ------------------------------------------------------------
-- 1. IDENTIFICAR LEVANTAMIENTOS REALIZADOS SIN USUARIO INTERNO
-- ------------------------------------------------------------
alter table public.ocurrencias
add column if not exists levantado_por_externo text;

-- ------------------------------------------------------------
-- 2. AJUSTAR VALIDACION DEL FLUJO
-- Permite levantamiento por usuario interno O por responsable externo.
-- ------------------------------------------------------------
create or replace function public.validar_flujo_estado_ocurrencia()
returns trigger
language plpgsql
as $$
declare
    v_old text;
    v_new text;
    v_origen text;
begin
    if old.estado_id is not distinct from new.estado_id then
        return new;
    end if;

    select codigo into v_old
    from public.estados_ocurrencia
    where id = old.estado_id;

    select codigo into v_new
    from public.estados_ocurrencia
    where id = new.estado_id;

    select oh.nombre into v_origen
    from public.origenes_hallazgo oh
    where oh.id = new.origen_hallazgo_id;

    if v_origen = 'BUENA PRACTICA' then
        if v_new <> 'CERRADO' then
            raise exception 'Una BUENA PRACTICA debe permanecer CERRADA';
        end if;
        return new;
    end if;

    if not (
        (v_old = 'ABIERTO' and v_new in ('EN_PROCESO','PENDIENTE_VALIDACION'))
        or (v_old = 'EN_PROCESO' and v_new = 'PENDIENTE_VALIDACION')
        or (v_old = 'PENDIENTE_VALIDACION' and v_new in ('CERRADO','EN_PROCESO'))
    ) then
        raise exception 'Transición de estado no permitida: % -> %', v_old, v_new;
    end if;

    if v_new = 'PENDIENTE_VALIDACION' then
        if new.fecha_ejecutada is null
           or (
                new.levantado_por_id is null
                and char_length(btrim(coalesce(new.levantado_por_externo,''))) = 0
              ) then
            raise exception 'Debe registrar fecha y responsable del levantamiento';
        end if;

        if not exists (
            select 1
            from public.evidencias e
            where e.ocurrencia_id = new.id
              and e.tipo_evidencia = 'LEVANTAMIENTO'
        ) then
            raise exception 'Debe existir una evidencia de LEVANTAMIENTO';
        end if;
    end if;

    if v_new = 'CERRADO' then
        if new.validado_por_id is null or new.fecha_validacion is null then
            raise exception 'Debe registrar el usuario y fecha de validación';
        end if;
    end if;

    if v_new = 'EN_PROCESO' then
        new.validado_por_id := null;
        new.fecha_validacion := null;
    end if;

    return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. CONSULTAR ASIGNACION MEDIANTE TOKEN PUBLICO
-- No expone correo ni UUID internos innecesarios.
-- ------------------------------------------------------------
create or replace function public.public_obtener_levantamiento(
    p_token uuid
)
returns table (
    codigo_reporte text,
    proyecto text,
    fecha date,
    reportado_por text,
    lugar text,
    tipo_hallazgo text,
    descripcion text,
    accion text,
    fecha_limite date,
    nombre_responsable text,
    estado_asignacion text,
    estado_ocurrencia text,
    puede_levantar boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
    select
        case
            when rt.numero is not null then 'REP-' || lpad(rt.numero::text, 6, '0')
            else 'OC-' || lpad(o.numero::text, 6, '0')
        end as codigo_reporte,
        p.nombre as proyecto,
        o.fecha,
        coalesce(
            nullif(btrim(o.reportado_por_externo), ''),
            nullif(btrim(coalesce(pf.nombres,'') || ' ' || coalesce(pf.apellidos,'')), ''),
            'N.A.'
        ) as reportado_por,
        o.lugar_hallazgo as lugar,
        th.nombre as tipo_hallazgo,
        o.descripcion,
        coalesce(nullif(btrim(o.acciones_implementar),''), 'Por definir') as accion,
        a.fecha_limite,
        a.nombre_responsable,
        a.estado as estado_asignacion,
        eo.codigo as estado_ocurrencia,
        (
            a.activo = true
            and a.estado in ('PENDIENTE','CORREO_ENVIADO','DEVUELTO')
            and eo.codigo not in ('CERRADO','PENDIENTE_VALIDACION')
        ) as puede_levantar
    from public.asignaciones_levantamiento a
    join public.ocurrencias o on o.id = a.ocurrencia_id
    join public.proyectos p on p.id = o.proyecto_id
    left join public.tipos_hallazgo th on th.id = o.tipo_hallazgo_id
    left join public.estados_ocurrencia eo on eo.id = o.estado_id
    left join public.perfiles pf on pf.id = o.reportado_por_id
    left join public.reportes_trabajadores rt on rt.id = o.reporte_trabajador_id
    where a.token = p_token
      and a.activo = true
    limit 1;
$$;

revoke all on function public.public_obtener_levantamiento(uuid) from public;
grant execute on function public.public_obtener_levantamiento(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. AUTORIZAR SUBIDA DE FOTO CON EL TOKEN COMO CARPETA
-- Ruta esperada: levantamientos/<TOKEN>/evidencia/foto.webp
-- ------------------------------------------------------------
create or replace function public.puede_subir_evidencia_levantamiento_publico(
    p_token_text text
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
    v_token uuid;
begin
    begin
        v_token := p_token_text::uuid;
    exception when others then
        return false;
    end;

    return exists (
        select 1
        from public.asignaciones_levantamiento a
        join public.ocurrencias o on o.id = a.ocurrencia_id
        left join public.estados_ocurrencia eo on eo.id = o.estado_id
        where a.token = v_token
          and a.activo = true
          and a.estado in ('PENDIENTE','CORREO_ENVIADO','DEVUELTO')
          and coalesce(eo.codigo,'') not in ('CERRADO','PENDIENTE_VALIDACION')
          and not exists (
              select 1
              from public.evidencias e
              where e.ocurrencia_id = a.ocurrencia_id
                and e.tipo_evidencia = 'LEVANTAMIENTO'
          )
    );
end;
$$;

revoke all on function public.puede_subir_evidencia_levantamiento_publico(text) from public;
grant execute on function public.puede_subir_evidencia_levantamiento_publico(text) to anon, authenticated;

grant insert on storage.objects to anon, authenticated;

drop policy if exists "subir evidencia levantamiento publico"
on storage.objects;

create policy "subir evidencia levantamiento publico"
on storage.objects
for insert
to anon, authenticated
with check (
    bucket_id = 'evidencias-ssomac'
    and (storage.foldername(name))[1] = 'levantamientos'
    and (storage.foldername(name))[3] = 'evidencia'
    and public.puede_subir_evidencia_levantamiento_publico(
        (storage.foldername(name))[2]
    )
);

-- ------------------------------------------------------------
-- 5. REGISTRAR LEVANTAMIENTO SIN LOGIN
-- ------------------------------------------------------------
create or replace function public.public_registrar_levantamiento(
    p_token uuid,
    p_comentario text,
    p_ruta_foto text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_asig record;
    v_estado_pendiente uuid;
begin
    if char_length(btrim(coalesce(p_comentario,''))) < 5 then
        raise exception 'Describe la acción correctiva realizada';
    end if;

    if p_ruta_foto is null
       or p_ruta_foto not like ('levantamientos/' || p_token::text || '/evidencia/%')
       or position('..' in p_ruta_foto) > 0 then
        raise exception 'Ruta de evidencia no válida';
    end if;

    select a.*, o.estado_id
    into v_asig
    from public.asignaciones_levantamiento a
    join public.ocurrencias o on o.id = a.ocurrencia_id
    where a.token = p_token
      and a.activo = true
    for update of a;

    if not found then
        raise exception 'Asignación no encontrada';
    end if;

    if v_asig.estado not in ('PENDIENTE','CORREO_ENVIADO','DEVUELTO') then
        raise exception 'El levantamiento ya fue procesado';
    end if;

    if exists (
        select 1 from public.evidencias e
        where e.ocurrencia_id = v_asig.ocurrencia_id
          and e.tipo_evidencia = 'LEVANTAMIENTO'
    ) then
        raise exception 'Ya existe una evidencia de levantamiento';
    end if;

    insert into public.evidencias (
        ocurrencia_id,
        tipo_evidencia,
        ruta_archivo,
        comentario,
        creado_por_id
    ) values (
        v_asig.ocurrencia_id,
        'LEVANTAMIENTO',
        p_ruta_foto,
        btrim(p_comentario),
        null
    );

    select eo.id
    into v_estado_pendiente
    from public.estados_ocurrencia eo
    where eo.codigo = 'PENDIENTE_VALIDACION'
      and eo.activo = true
    limit 1;

    if v_estado_pendiente is null then
        raise exception 'No existe el estado PENDIENTE_VALIDACION';
    end if;

    update public.ocurrencias
    set fecha_ejecutada = current_date,
        levantado_por_id = null,
        levantado_por_externo = v_asig.nombre_responsable,
        observacion_validacion = null,
        estado_id = v_estado_pendiente
    where id = v_asig.ocurrencia_id;

    update public.asignaciones_levantamiento
    set estado = 'LEVANTADO',
        levantado_en = now()
    where id = v_asig.id;

    return true;
end;
$$;

revoke all on function public.public_registrar_levantamiento(uuid,text,text) from public;
grant execute on function public.public_registrar_levantamiento(uuid,text,text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. VERIFICACION
-- ------------------------------------------------------------
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
      'public_obtener_levantamiento',
      'puede_subir_evidencia_levantamiento_publico',
      'public_registrar_levantamiento'
  )
order by routine_name;
