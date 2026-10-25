-- ============================================================
-- V11.8.2 · AJUSTE ETAPA 47
-- 1) ÁREAS POR PROYECTO / SEDE
-- 2) FLUJO ACTO-CONDICIÓN EN INSPECCIÓN GENERAL
-- 3) LEVANTAMIENTO POSTERIOR POR RESPONSABLE + CORREO
-- ============================================================
-- Ejecutar DESPUÉS de ETAPA_47_REVISADA_INSPECCIONES_GENERALES.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. ÁREAS POR PROYECTO / SEDE
-- ------------------------------------------------------------
create table if not exists public.areas_proyecto (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  creado_por_id uuid default auth.uid() references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists ux_areas_proyecto_nombre
  on public.areas_proyecto(proyecto_id, upper(btrim(nombre)));

create or replace function public.e472_set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en=now();
  return new;
end;
$$;

drop trigger if exists trg_e472_areas_actualizado on public.areas_proyecto;
create trigger trg_e472_areas_actualizado
before update on public.areas_proyecto
for each row execute function public.e472_set_actualizado_en();

create or replace function public.e472_puede_administrar_area(p_proyecto_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    public.es_admin_sistema()
    or (
      public.rol_actual() in ('PROYECTO','ING_SEGURIDAD')
      and exists (
        select 1
        from public.usuario_proyectos up
        where up.usuario_id=auth.uid()
          and up.proyecto_id=p_proyecto_id
      )
    );
$$;

revoke all on function public.e472_puede_administrar_area(uuid) from public;
grant execute on function public.e472_puede_administrar_area(uuid) to authenticated;

alter table public.areas_proyecto enable row level security;

drop policy if exists "e472 areas select" on public.areas_proyecto;
drop policy if exists "e472 areas insert" on public.areas_proyecto;
drop policy if exists "e472 areas update" on public.areas_proyecto;
drop policy if exists "e472 areas delete" on public.areas_proyecto;

create policy "e472 areas select"
on public.areas_proyecto for select to authenticated
using (public.puede_acceder_proyecto(proyecto_id));

create policy "e472 areas insert"
on public.areas_proyecto for insert to authenticated
with check (
  public.e472_puede_administrar_area(proyecto_id)
  and (creado_por_id is null or creado_por_id=auth.uid())
);

create policy "e472 areas update"
on public.areas_proyecto for update to authenticated
using (public.e472_puede_administrar_area(proyecto_id))
with check (public.e472_puede_administrar_area(proyecto_id));

create policy "e472 areas delete"
on public.areas_proyecto for delete to authenticated
using (public.es_admin_sistema());

grant select,insert,update,delete on public.areas_proyecto to authenticated;

-- Mantiene compatibilidad con el catálogo histórico public.areas usado por
-- Ocurrencias. Cuando se crea un área de proyecto, se asegura que exista
-- también el nombre en el catálogo histórico.
create or replace function public.e472_sincronizar_area_legacy()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if to_regclass('public.areas') is not null then
    if not exists (
      select 1 from public.areas a
      where upper(btrim(a.nombre))=upper(btrim(new.nombre))
    ) then
      insert into public.areas(nombre,activo)
      values (upper(btrim(new.nombre)),true);
    else
      update public.areas
      set activo=true
      where upper(btrim(nombre))=upper(btrim(new.nombre));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_e472_sincronizar_area_legacy on public.areas_proyecto;
create trigger trg_e472_sincronizar_area_legacy
after insert or update of nombre,activo on public.areas_proyecto
for each row
when (new.activo=true)
execute function public.e472_sincronizar_area_legacy();

-- ------------------------------------------------------------
-- 2. RELACIÓN DE ÁREA DE PROYECTO CON MÓDULOS EXISTENTES
-- ------------------------------------------------------------
alter table public.inspecciones_generales
  add column if not exists area_proyecto_id uuid references public.areas_proyecto(id);

alter table public.ocurrencias
  add column if not exists area_proyecto_id uuid references public.areas_proyecto(id);

alter table public.reportes_trabajadores
  add column if not exists area_proyecto_id uuid references public.areas_proyecto(id);

-- Migra las áreas escritas en inspecciones generales existentes.
insert into public.areas_proyecto(proyecto_id,nombre,activo,creado_por_id)
select distinct
  i.proyecto_id,
  upper(btrim(i.area_inspeccionada)),
  true,
  i.creado_por_id
from public.inspecciones_generales i
where nullif(btrim(i.area_inspeccionada),'') is not null
  and not exists (
    select 1 from public.areas_proyecto ap
    where ap.proyecto_id=i.proyecto_id
      and upper(btrim(ap.nombre))=upper(btrim(i.area_inspeccionada))
  );

update public.inspecciones_generales i
set area_proyecto_id=ap.id
from public.areas_proyecto ap
where i.area_proyecto_id is null
  and ap.proyecto_id=i.proyecto_id
  and upper(btrim(ap.nombre))=upper(btrim(i.area_inspeccionada));

-- Migra el área histórica de ocurrencias cuando sea posible.
insert into public.areas_proyecto(proyecto_id,nombre,activo,creado_por_id)
select distinct
  o.proyecto_id,
  upper(btrim(a.nombre)),
  true,
  o.reportado_por_id
from public.ocurrencias o
join public.areas a on a.id=o.area_responsable_id
where o.area_responsable_id is not null
  and not exists (
    select 1 from public.areas_proyecto ap
    where ap.proyecto_id=o.proyecto_id
      and upper(btrim(ap.nombre))=upper(btrim(a.nombre))
  );

update public.ocurrencias o
set area_proyecto_id=ap.id
from public.areas a, public.areas_proyecto ap
where o.area_proyecto_id is null
  and a.id=o.area_responsable_id
  and ap.proyecto_id=o.proyecto_id
  and upper(btrim(ap.nombre))=upper(btrim(a.nombre));

-- ------------------------------------------------------------
-- 3. INSPECCIÓN GENERAL: SEGUIMIENTO POSTERIOR
-- ------------------------------------------------------------
alter table public.inspeccion_general_items
  add column if not exists responsable_id uuid references public.responsables_correccion(id),
  add column if not exists fecha_limite date,
  add column if not exists estado_levantamiento text not null default 'PENDIENTE',
  add column if not exists levantamiento_comentario text,
  add column if not exists levantamiento_firmante text,
  add column if not exists levantamiento_firma_ruta text,
  add column if not exists levantamiento_en timestamptz,
  add column if not exists validado_por_id uuid references public.perfiles(id),
  add column if not exists validado_en timestamptz,
  add column if not exists observacion_validacion text;

alter table public.inspeccion_general_items
  drop constraint if exists inspeccion_general_items_estado_levantamiento_check;

alter table public.inspeccion_general_items
  add constraint inspeccion_general_items_estado_levantamiento_check
  check (estado_levantamiento in (
    'PENDIENTE','ASIGNADO','CORREO_ENVIADO',
    'PENDIENTE_VALIDACION','CORRECCION_REQUERIDA','CERRADO'
  ));

-- Las inspecciones ya cerradas conservan su estado histórico.
update public.inspeccion_general_items
set estado_levantamiento=case
  when correccion_foto_ruta is not null and fecha_correccion is not null then 'CERRADO'
  else 'PENDIENTE'
end
where estado_levantamiento is null
   or estado_levantamiento='PENDIENTE';

alter table public.inspecciones_generales
  drop constraint if exists inspecciones_generales_estado_check;

alter table public.inspecciones_generales
  add constraint inspecciones_generales_estado_check
  check (estado in ('PENDIENTE_CORRECCION','PENDIENTE_VALIDACION','COMPLETADA'));

create table if not exists public.inspeccion_general_asignaciones (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique
    references public.inspeccion_general_items(id) on delete cascade,
  responsable_id uuid not null references public.responsables_correccion(id),
  token uuid not null default gen_random_uuid() unique,
  fecha_limite date not null,
  estado text not null default 'ASIGNADO'
    check (estado in ('ASIGNADO','CORREO_ENVIADO','PENDIENTE_VALIDACION','CORRECCION_REQUERIDA','CERRADO')),
  correo_enviado_en timestamptz,
  url_foto_observacion_firmada text,
  foto_observacion_url_expira_en timestamptz,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

drop trigger if exists trg_e472_asignaciones_actualizado on public.inspeccion_general_asignaciones;
create trigger trg_e472_asignaciones_actualizado
before update on public.inspeccion_general_asignaciones
for each row execute function public.e472_set_actualizado_en();

alter table public.inspeccion_general_asignaciones enable row level security;

drop policy if exists "e472 asignaciones select" on public.inspeccion_general_asignaciones;
drop policy if exists "e472 asignaciones insert" on public.inspeccion_general_asignaciones;
drop policy if exists "e472 asignaciones update" on public.inspeccion_general_asignaciones;
drop policy if exists "e472 asignaciones delete" on public.inspeccion_general_asignaciones;

create policy "e472 asignaciones select"
on public.inspeccion_general_asignaciones for select to authenticated
using (
  exists (
    select 1
    from public.inspeccion_general_items it
    join public.inspecciones_generales ig on ig.id=it.inspeccion_id
    where it.id=item_id
      and public.puede_acceder_proyecto(ig.proyecto_id)
  )
);

create policy "e472 asignaciones insert"
on public.inspeccion_general_asignaciones for insert to authenticated
with check (
  exists (
    select 1
    from public.inspeccion_general_items it
    join public.inspecciones_generales ig on ig.id=it.inspeccion_id
    where it.id=item_id
      and public.puede_gestionar_proyecto(ig.proyecto_id)
  )
);

create policy "e472 asignaciones update"
on public.inspeccion_general_asignaciones for update to authenticated
using (
  exists (
    select 1
    from public.inspeccion_general_items it
    join public.inspecciones_generales ig on ig.id=it.inspeccion_id
    where it.id=item_id
      and public.puede_gestionar_proyecto(ig.proyecto_id)
  )
)
with check (
  exists (
    select 1
    from public.inspeccion_general_items it
    join public.inspecciones_generales ig on ig.id=it.inspeccion_id
    where it.id=item_id
      and public.puede_gestionar_proyecto(ig.proyecto_id)
  )
);

create policy "e472 asignaciones delete"
on public.inspeccion_general_asignaciones for delete to authenticated
using (public.es_admin_sistema());

grant select,insert,update,delete on public.inspeccion_general_asignaciones to authenticated;

-- ------------------------------------------------------------
-- 4. ESTADO GENERAL DE LA INSPECCIÓN
-- ------------------------------------------------------------
create or replace function public.e472_actualizar_estado_inspeccion(p_inspeccion_id uuid)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_total integer;
  v_cerrados integer;
  v_validacion integer;
  v_estado text;
begin
  select
    count(*),
    count(*) filter (where estado_levantamiento='CERRADO'),
    count(*) filter (where estado_levantamiento='PENDIENTE_VALIDACION')
  into v_total,v_cerrados,v_validacion
  from public.inspeccion_general_items
  where inspeccion_id=p_inspeccion_id;

  if v_total>0 and v_cerrados=v_total then
    v_estado:='COMPLETADA';
  elsif v_validacion>0 then
    v_estado:='PENDIENTE_VALIDACION';
  else
    v_estado:='PENDIENTE_CORRECCION';
  end if;

  update public.inspecciones_generales
  set estado=v_estado
  where id=p_inspeccion_id;

  return v_estado;
end;
$$;

revoke all on function public.e472_actualizar_estado_inspeccion(uuid) from public;
grant execute on function public.e472_actualizar_estado_inspeccion(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. CREAR ASIGNACIÓN DE LEVANTAMIENTO DE ITEM DE INSPECCIÓN
-- ------------------------------------------------------------
drop function if exists public.crear_asignacion_inspeccion_general(uuid,uuid,date);

create function public.crear_asignacion_inspeccion_general(
  p_item_id uuid,
  p_responsable_id uuid,
  p_fecha_limite date
)
returns table(
  asignacion_id uuid,
  token uuid,
  estado text
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_item record;
  v_resp record;
  v_asig record;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión.';
  end if;

  select it.*,ig.proyecto_id
  into v_item
  from public.inspeccion_general_items it
  join public.inspecciones_generales ig on ig.id=it.inspeccion_id
  where it.id=p_item_id;

  if not found then raise exception 'Ítem de inspección no encontrado.'; end if;
  if not public.puede_gestionar_proyecto(v_item.proyecto_id) then
    raise exception 'No tiene permisos para gestionar este proyecto.';
  end if;
  if p_fecha_limite is null then raise exception 'Debe indicar la fecha límite.'; end if;

  select * into v_resp
  from public.responsables_correccion
  where id=p_responsable_id and activo=true;
  if not found then raise exception 'Responsable no válido o inactivo.'; end if;

  select * into v_asig
  from public.inspeccion_general_asignaciones
  where item_id=p_item_id
  for update;

  if found then
    if v_asig.estado='CERRADO' then
      return query select v_asig.id,v_asig.token,v_asig.estado;
      return;
    end if;
    update public.inspeccion_general_asignaciones
    set responsable_id=p_responsable_id,
        fecha_limite=p_fecha_limite,
        estado=case when estado='CORRECCION_REQUERIDA' then estado else 'ASIGNADO' end,
        activo=true
    where id=v_asig.id
    returning * into v_asig;
  else
    insert into public.inspeccion_general_asignaciones(item_id,responsable_id,fecha_limite)
    values (p_item_id,p_responsable_id,p_fecha_limite)
    returning * into v_asig;
  end if;

  update public.inspeccion_general_items
  set responsable_id=p_responsable_id,
      responsable=btrim(concat_ws(' ',v_resp.nombres,v_resp.apellidos)),
      fecha_limite=p_fecha_limite,
      estado_levantamiento=case
        when estado_levantamiento='CORRECCION_REQUERIDA' then estado_levantamiento
        else 'ASIGNADO'
      end
  where id=p_item_id;

  perform public.e472_actualizar_estado_inspeccion(v_item.inspeccion_id);

  return query select v_asig.id,v_asig.token,v_asig.estado;
end;
$$;

revoke all on function public.crear_asignacion_inspeccion_general(uuid,uuid,date) from public;
grant execute on function public.crear_asignacion_inspeccion_general(uuid,uuid,date) to authenticated;

create or replace function public.marcar_correo_inspeccion_general(p_asignacion_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_item_id uuid; v_project uuid;
begin
  select a.item_id,ig.proyecto_id into v_item_id,v_project
  from public.inspeccion_general_asignaciones a
  join public.inspeccion_general_items it on it.id=a.item_id
  join public.inspecciones_generales ig on ig.id=it.inspeccion_id
  where a.id=p_asignacion_id;
  if not found then return false; end if;
  if not public.puede_gestionar_proyecto(v_project) then raise exception 'Sin autorización.'; end if;
  update public.inspeccion_general_asignaciones
  set estado='CORREO_ENVIADO',correo_enviado_en=now()
  where id=p_asignacion_id and estado='ASIGNADO';
  update public.inspeccion_general_items
  set estado_levantamiento='CORREO_ENVIADO'
  where id=v_item_id and estado_levantamiento='ASIGNADO';
  return true;
end;
$$;

revoke all on function public.marcar_correo_inspeccion_general(uuid) from public;
grant execute on function public.marcar_correo_inspeccion_general(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. ENLACE PÚBLICO DE LEVANTAMIENTO
-- ------------------------------------------------------------
drop function if exists public.public_obtener_levantamiento_inspeccion(uuid);

create function public.public_obtener_levantamiento_inspeccion(p_token uuid)
returns table(
  codigo text,
  proyecto text,
  area text,
  fecha date,
  item_no smallint,
  descripcion text,
  causa_tipo text,
  accion text,
  responsable text,
  fecha_limite date,
  estado_asignacion text,
  url_foto_observacion text,
  puede_levantar boolean
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    'IG-'||lpad(ig.numero::text,6,'0')||' / Ítem '||it.item_no::text,
    p.nombre,
    coalesce(ap.nombre,ig.area_inspeccionada),
    ig.fecha_inspeccion,
    it.item_no,
    it.descripcion,
    case when it.causa_acto is not null then 'ACTO SUBESTÁNDAR' else 'CONDICIÓN SUBESTÁNDAR' end,
    it.accion_correctiva,
    btrim(concat_ws(' ',r.nombres,r.apellidos)),
    a.fecha_limite,
    a.estado,
    case
      when a.foto_observacion_url_expira_en is not null
       and a.foto_observacion_url_expira_en>now()
      then a.url_foto_observacion_firmada
      else null
    end,
    a.estado in ('ASIGNADO','CORREO_ENVIADO','CORRECCION_REQUERIDA')
  from public.inspeccion_general_asignaciones a
  join public.inspeccion_general_items it on it.id=a.item_id
  join public.inspecciones_generales ig on ig.id=it.inspeccion_id
  join public.proyectos p on p.id=ig.proyecto_id
  left join public.areas_proyecto ap on ap.id=ig.area_proyecto_id
  join public.responsables_correccion r on r.id=a.responsable_id
  where a.token=p_token
    and a.activo=true
  limit 1;
$$;

revoke all on function public.public_obtener_levantamiento_inspeccion(uuid) from public;
grant execute on function public.public_obtener_levantamiento_inspeccion(uuid) to anon,authenticated;

drop function if exists public.public_registrar_levantamiento_inspeccion(uuid,text,text,text,text);

create function public.public_registrar_levantamiento_inspeccion(
  p_token uuid,
  p_comentario text,
  p_ruta_foto text,
  p_ruta_firma text,
  p_firmante_nombre text
)
returns table(ok boolean, estado text)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_asig record;
  v_inspeccion_id uuid;
begin
  if char_length(btrim(coalesce(p_comentario,'')))<5 then
    raise exception 'Describe la acción correctiva realizada.';
  end if;
  if nullif(btrim(coalesce(p_ruta_foto,'')),'') is null then
    raise exception 'Debe adjuntar fotografía del levantamiento.';
  end if;
  if nullif(btrim(coalesce(p_ruta_firma,'')),'') is null then
    raise exception 'Debe registrar la firma.';
  end if;
  if nullif(btrim(coalesce(p_firmante_nombre,'')),'') is null then
    raise exception 'Debe indicar quién realiza el levantamiento.';
  end if;

  select a.*,it.inspeccion_id into v_asig
  from public.inspeccion_general_asignaciones a
  join public.inspeccion_general_items it on it.id=a.item_id
  where a.token=p_token and a.activo=true
  for update of a;

  if not found then raise exception 'El enlace no existe o ya no está disponible.'; end if;
  if v_asig.estado not in ('ASIGNADO','CORREO_ENVIADO','CORRECCION_REQUERIDA') then
    raise exception 'Este levantamiento ya fue enviado o cerrado.';
  end if;

  v_inspeccion_id:=v_asig.inspeccion_id;

  update public.inspeccion_general_items
  set levantamiento_comentario=btrim(p_comentario),
      correccion_foto_ruta=p_ruta_foto,
      levantamiento_firma_ruta=p_ruta_firma,
      levantamiento_firmante=btrim(p_firmante_nombre),
      levantamiento_en=now(),
      fecha_correccion=current_date,
      estado_levantamiento='PENDIENTE_VALIDACION'
  where id=v_asig.item_id;

  update public.inspeccion_general_asignaciones
  set estado='PENDIENTE_VALIDACION'
  where id=v_asig.id;

  perform public.e472_actualizar_estado_inspeccion(v_inspeccion_id);

  return query select true,'PENDIENTE_VALIDACION'::text;
end;
$$;

revoke all on function public.public_registrar_levantamiento_inspeccion(uuid,text,text,text,text) from public;
grant execute on function public.public_registrar_levantamiento_inspeccion(uuid,text,text,text,text) to anon,authenticated;

-- ------------------------------------------------------------
-- 7. VALIDACIÓN INTERNA DEL LEVANTAMIENTO
-- ------------------------------------------------------------
drop function if exists public.validar_levantamiento_inspeccion_general(uuid,boolean,text);

create function public.validar_levantamiento_inspeccion_general(
  p_item_id uuid,
  p_aprobar boolean,
  p_observacion text default null
)
returns table(estado_item text,estado_inspeccion text)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_item record;
  v_estado_inspeccion text;
begin
  if auth.uid() is null then raise exception 'Debe iniciar sesión.'; end if;

  select it.*,ig.proyecto_id into v_item
  from public.inspeccion_general_items it
  join public.inspecciones_generales ig on ig.id=it.inspeccion_id
  where it.id=p_item_id
  for update of it;

  if not found then raise exception 'Ítem no encontrado.'; end if;
  if not public.puede_gestionar_proyecto(v_item.proyecto_id) then raise exception 'Sin autorización.'; end if;
  if v_item.estado_levantamiento<>'PENDIENTE_VALIDACION' then
    raise exception 'El ítem no está pendiente de validación.';
  end if;

  if p_aprobar then
    update public.inspeccion_general_items
    set estado_levantamiento='CERRADO',
        validado_por_id=auth.uid(),
        validado_en=now(),
        observacion_validacion=nullif(btrim(coalesce(p_observacion,'')),'')
    where id=p_item_id;

    update public.inspeccion_general_asignaciones
    set estado='CERRADO'
    where item_id=p_item_id;
  else
    if char_length(btrim(coalesce(p_observacion,'')))<5 then
      raise exception 'Indique el motivo de devolución.';
    end if;

    update public.inspeccion_general_items
    set estado_levantamiento='CORRECCION_REQUERIDA',
        observacion_validacion=btrim(p_observacion),
        validado_por_id=auth.uid(),
        validado_en=now()
    where id=p_item_id;

    update public.inspeccion_general_asignaciones
    set estado='CORRECCION_REQUERIDA'
    where item_id=p_item_id;
  end if;

  v_estado_inspeccion:=public.e472_actualizar_estado_inspeccion(v_item.inspeccion_id);

  return query
  select
    case when p_aprobar then 'CERRADO' else 'CORRECCION_REQUERIDA' end,
    v_estado_inspeccion;
end;
$$;

revoke all on function public.validar_levantamiento_inspeccion_general(uuid,boolean,text) from public;
grant execute on function public.validar_levantamiento_inspeccion_general(uuid,boolean,text) to authenticated;

-- ------------------------------------------------------------
-- 8. VERIFICACIÓN
-- ------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('areas_proyecto','inspeccion_general_asignaciones')
order by table_name;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'crear_asignacion_inspeccion_general',
    'public_obtener_levantamiento_inspeccion',
    'public_registrar_levantamiento_inspeccion',
    'validar_levantamiento_inspeccion_general'
  )
order by routine_name;

commit;
