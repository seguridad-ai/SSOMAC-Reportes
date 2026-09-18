-- ============================================================
-- ETAPA 31
-- LEVANTAMIENTO INMEDIATO SIN ENVIO DE CORREO
-- ============================================================

-- 1. Registrar modalidad de levantamiento en la ocurrencia.
alter table public.ocurrencias
add column if not exists modalidad_levantamiento text;

update public.ocurrencias
set modalidad_levantamiento = 'ASIGNADO'
where modalidad_levantamiento is null;

alter table public.ocurrencias
alter column modalidad_levantamiento set default 'ASIGNADO';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ocurrencias_modalidad_levantamiento_check'
      and conrelid = 'public.ocurrencias'::regclass
  ) then
    alter table public.ocurrencias
    add constraint ocurrencias_modalidad_levantamiento_check
    check (modalidad_levantamiento in ('ASIGNADO','INMEDIATO'));
  end if;
end $$;

-- 2. Nueva version de la validacion de reportes de trabajadores.
--    Si p_levantamiento_inmediato = true, NO crea asignacion ni token.
create or replace function public.validar_reporte_trabajador_v2(
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
    p_causas_basicas uuid[] default '{}'::uuid[],
    p_levantamiento_inmediato boolean default false
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

    select rt.* into v_reporte
    from public.reportes_trabajadores rt
    where rt.id = p_reporte_id
    for update;

    if not found then raise exception 'Reporte no encontrado'; end if;
    if v_reporte.estado_revision in ('VALIDADO','DESCARTADO') then
        raise exception 'El reporte ya fue procesado';
    end if;

    if not public.puede_gestionar_proyecto(p_proyecto_id) then
        raise exception 'No tiene autorización para el proyecto seleccionado';
    end if;

    if not exists (select 1 from public.proyectos p where p.id=p_proyecto_id and p.activo=true) then
        raise exception 'Proyecto no válido';
    end if;

    if not exists (
        select 1 from public.tipos_hallazgo th
        where th.id=p_tipo_hallazgo_id and th.activo=true and th.codigo in ('ACTO','CONDICION')
    ) then
        raise exception 'Tipo de hallazgo no válido';
    end if;

    select r.* into v_resp
    from public.responsables_correccion r
    where r.id=p_responsable_id
      and r.activo=true
      and (r.aplica_todos_proyectos=true or r.proyecto_id=p_proyecto_id);

    if not found then raise exception 'Responsable no válido'; end if;

    select oh.id into v_origen_id
    from public.origenes_hallazgo oh
    where upper(oh.nombre)='REPORTE DE ACTO Y CONDICION'
      and oh.activo=true
    limit 1;

    if v_origen_id is null then
        raise exception 'No existe el origen REPORTE DE ACTO Y CONDICION';
    end if;

    insert into public.ocurrencias (
        proyecto_id,fecha,origen_hallazgo_id,tipo_hallazgo_id,lugar_hallazgo,descripcion,
        acciones_implementar,potencial_perdida_id,responsable_correccion_id,responsable_correccion,
        area_responsable_id,fecha_levantamiento,reportado_por_externo,reporte_trabajador_id,
        modalidad_levantamiento
    ) values (
        p_proyecto_id,coalesce(p_fecha,v_reporte.fecha),v_origen_id,p_tipo_hallazgo_id,btrim(p_lugar_hallazgo),btrim(p_descripcion),
        nullif(btrim(coalesce(p_acciones,'')),''),p_potencial_id,p_responsable_id,
        btrim(coalesce(v_resp.nombres,'')||' '||coalesce(v_resp.apellidos,'')),
        p_area_id,p_fecha_levantamiento,btrim(p_reportado_por_nombre),p_reporte_id,
        case when p_levantamiento_inmediato then 'INMEDIATO' else 'ASIGNADO' end
    ) returning id,numero into v_occ_id,v_occ_num;

    if coalesce(array_length(p_causas_inmediatas,1),0)>0 then
        select count(*) into v_count
        from public.causas_inmediatas ci
        where ci.id=any(p_causas_inmediatas)
          and ci.tipo_hallazgo_id=p_tipo_hallazgo_id
          and ci.activo=true;
        if v_count<>array_length(p_causas_inmediatas,1) then
            raise exception 'Una o más causas inmediatas no corresponden al tipo seleccionado';
        end if;
        insert into public.ocurrencia_causas_inmediatas(ocurrencia_id,causa_inmediata_id)
        select v_occ_id,unnest(p_causas_inmediatas);
    end if;

    if coalesce(array_length(p_causas_basicas,1),0)>0 then
        select count(*) into v_count
        from public.causas_basicas cb
        where cb.id=any(p_causas_basicas)
          and cb.tipo_hallazgo_id=p_tipo_hallazgo_id
          and cb.activo=true;
        if v_count<>array_length(p_causas_basicas,1) then
            raise exception 'Una o más causas básicas no corresponden al tipo seleccionado';
        end if;
        insert into public.ocurrencia_causas_basicas(ocurrencia_id,causa_basica_id)
        select v_occ_id,unnest(p_causas_basicas);
    end if;

    if v_reporte.ruta_foto is not null then
        insert into public.evidencias(ocurrencia_id,tipo_evidencia,ruta_archivo,creado_por_id)
        values(v_occ_id,'HALLAZGO',v_reporte.ruta_foto,auth.uid());
    end if;

    if not p_levantamiento_inmediato then
        select ca.asignacion_id,ca.token
        into v_asig_id,v_asig_token
        from public.crear_asignacion_levantamiento(v_occ_id,p_responsable_id,p_fecha_levantamiento) ca;
    else
        v_asig_id:=null;
        v_asig_token:=null;
    end if;

    update public.reportes_trabajadores
    set proyecto_id=p_proyecto_id,
        fecha=coalesce(p_fecha,v_reporte.fecha),
        reportado_por_nombre=btrim(p_reportado_por_nombre),
        lugar_hallazgo=btrim(p_lugar_hallazgo),
        tipo_hallazgo_id=p_tipo_hallazgo_id,
        descripcion=btrim(p_descripcion),
        responsable_propuesto_id=p_responsable_id,
        estado_revision='VALIDADO',
        revisado_por_id=auth.uid(),
        fecha_revision=now(),
        ocurrencia_id=v_occ_id,
        actualizado_en=now()
    where id=p_reporte_id;

    return query select v_occ_id,v_occ_num,v_asig_id,v_asig_token;
end;
$$;

revoke all on function public.validar_reporte_trabajador_v2(uuid,uuid,date,text,uuid,text,text,uuid,text,uuid,uuid,date,uuid[],uuid[],boolean) from public;
grant execute on function public.validar_reporte_trabajador_v2(uuid,uuid,date,text,uuid,text,text,uuid,text,uuid,uuid,date,uuid[],uuid[],boolean) to authenticated;

-- 3. Verificacion
select column_name,data_type,column_default
from information_schema.columns
where table_schema='public'
  and table_name='ocurrencias'
  and column_name='modalidad_levantamiento';

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name='validar_reporte_trabajador_v2';
