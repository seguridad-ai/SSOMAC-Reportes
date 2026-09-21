-- ============================================================
-- ETAPA 43 - USUARIOS, ROLES Y ACCESO POR PROYECTO
-- SSOMAC Digital - Explo Drilling Peru
-- ============================================================
-- Roles operativos nuevos:
--   ADMIN     : acceso total + administracion del sistema
--   GERENCIA  : operacion/consulta de todos los proyectos, sin administrar sistema
--   PROYECTO  : operacion/consulta solo de proyectos vinculados en usuario_proyectos
--
-- Compatibilidad temporal:
--   SIG             : alcance corporativo operativo, sin administracion de sistema
--   ING_SEGURIDAD   : alcance por proyectos vinculados
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. NORMALIZAR ROLES PERMITIDOS EN PERFILES
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid='public.perfiles'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%rol%'
  loop
    execute format('alter table public.perfiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.perfiles
  add constraint perfiles_rol_check
  check (upper(rol) in ('ADMIN','GERENCIA','PROYECTO','SIG','ING_SEGURIDAD'));

-- ------------------------------------------------------------
-- 2. HELPERS DE SEGURIDAD
-- ------------------------------------------------------------
create or replace function public.rol_actual()
returns text
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select upper(p.rol)
  from public.perfiles p
  where p.id=auth.uid()
    and p.activo=true
  limit 1;
$$;

revoke all on function public.rol_actual() from public;
grant execute on function public.rol_actual() to authenticated;

create or replace function public.es_admin_sistema()
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select coalesce(public.rol_actual()='ADMIN',false);
$$;

revoke all on function public.es_admin_sistema() from public;
grant execute on function public.es_admin_sistema() to authenticated;

-- Se conserva el nombre historico porque funciones de etapas anteriores lo usan.
-- Desde esta etapa, administrar proyectos/responsables queda SOLO para ADMIN.
create or replace function public.es_admin_sig()
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select public.es_admin_sistema();
$$;

revoke all on function public.es_admin_sig() from public;
grant execute on function public.es_admin_sig() to authenticated;

create or replace function public.es_rol_corporativo()
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select coalesce(public.rol_actual() in ('ADMIN','GERENCIA','SIG'),false);
$$;

revoke all on function public.es_rol_corporativo() from public;
grant execute on function public.es_rol_corporativo() to authenticated;

create or replace function public.puede_acceder_proyecto(p_proyecto_id uuid)
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select
    auth.uid() is not null
    and exists (
      select 1 from public.perfiles p
      where p.id=auth.uid() and p.activo=true
    )
    and (
      public.rol_actual() in ('ADMIN','GERENCIA','SIG')
      or exists (
        select 1
        from public.usuario_proyectos up
        where up.usuario_id=auth.uid()
          and up.proyecto_id=p_proyecto_id
      )
    );
$$;

revoke all on function public.puede_acceder_proyecto(uuid) from public;
grant execute on function public.puede_acceder_proyecto(uuid) to authenticated;

-- PROYECTO puede operar solo en sus proyectos; GERENCIA opera en todos.
create or replace function public.puede_gestionar_proyecto(p_proyecto_id uuid)
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select public.puede_acceder_proyecto(p_proyecto_id);
$$;

revoke all on function public.puede_gestionar_proyecto(uuid) from public;
grant execute on function public.puede_gestionar_proyecto(uuid) to authenticated;

create or replace function public.puede_ver_perfil(p_perfil_id uuid)
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select
    auth.uid()=p_perfil_id
    or public.es_rol_corporativo()
    or exists (
      select 1
      from public.ocurrencias o
      where public.puede_acceder_proyecto(o.proyecto_id)
        and p_perfil_id in (o.reportado_por_id,o.levantado_por_id,o.validado_por_id)
    );
$$;

revoke all on function public.puede_ver_perfil(uuid) from public;
grant execute on function public.puede_ver_perfil(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. LISTADO SEGURO DE PROYECTOS AUTORIZADOS
-- ------------------------------------------------------------
create or replace function public.listar_proyectos_autorizados_actual(
  p_incluir_inactivos boolean default false
)
returns table(
  id uuid,
  codigo text,
  nombre text,
  cliente text,
  tipo_unidad text,
  activo boolean
)
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select p.id,p.codigo,p.nombre,p.cliente,p.tipo_unidad,p.activo
  from public.proyectos p
  where (p_incluir_inactivos or p.activo=true)
    and public.puede_acceder_proyecto(p.id)
  order by p.nombre;
$$;

revoke all on function public.listar_proyectos_autorizados_actual(boolean) from public;
grant execute on function public.listar_proyectos_autorizados_actual(boolean) to authenticated;

-- ------------------------------------------------------------
-- 4. RPC ADMIN: LISTAR USUARIOS AUTH + PERFIL + PROYECTO
-- No expone password ni tokens.
-- ------------------------------------------------------------
create or replace function public.admin_listar_usuarios_accesos()
returns table(
  user_id uuid,
  email text,
  nombres text,
  apellidos text,
  cargo text,
  rol text,
  activo boolean,
  proyecto_id uuid,
  proyecto_codigo text,
  proyecto_nombre text,
  perfil_configurado boolean,
  ultimo_ingreso timestamptz,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not public.es_admin_sistema() then
    raise exception 'Solo ADMIN puede administrar usuarios y accesos';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.nombres,
    p.apellidos,
    p.cargo,
    upper(p.rol),
    coalesce(p.activo,false),
    pr.id,
    pr.codigo,
    pr.nombre,
    (p.id is not null),
    u.last_sign_in_at,
    u.created_at
  from auth.users u
  left join public.perfiles p on p.id=u.id
  left join lateral (
    select py.id,py.codigo,py.nombre
    from public.usuario_proyectos up
    join public.proyectos py on py.id=up.proyecto_id
    where up.usuario_id=u.id
    order by py.nombre
    limit 1
  ) pr on true
  order by coalesce(p.activo,false) desc, lower(coalesce(p.apellidos,'')), lower(coalesce(p.nombres,'')), lower(u.email);
end;
$$;

revoke all on function public.admin_listar_usuarios_accesos() from public;
grant execute on function public.admin_listar_usuarios_accesos() to authenticated;

-- ------------------------------------------------------------
-- 5. RPC ADMIN: CONFIGURAR UN USUARIO AUTH YA EXISTENTE
-- El usuario Auth se crea primero desde Supabase Authentication > Users.
-- ------------------------------------------------------------
create or replace function public.admin_configurar_usuario_existente(
  p_email text,
  p_nombres text,
  p_apellidos text,
  p_cargo text,
  p_rol text,
  p_activo boolean default true,
  p_proyecto_id uuid default null
)
returns table(
  user_id uuid,
  email text,
  rol text,
  proyecto_id uuid
)
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_user_id uuid;
  v_email text;
  v_rol text:=upper(btrim(coalesce(p_rol,'')));
begin
  if not public.es_admin_sistema() then
    raise exception 'Solo ADMIN puede administrar usuarios y accesos';
  end if;

  select u.id,u.email::text
  into v_user_id,v_email
  from auth.users u
  where lower(u.email)=lower(btrim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'El correo no existe en Supabase Authentication. Primero crea el usuario en Authentication > Users.';
  end if;

  if v_rol not in ('ADMIN','GERENCIA','PROYECTO') then
    raise exception 'Rol no valido. Use ADMIN, GERENCIA o PROYECTO.';
  end if;

  -- Se protege la regla definida: solo la cuenta ADMIN actual conserva control total.
  if v_rol='ADMIN' and v_user_id<>auth.uid() then
    raise exception 'No se puede otorgar ADMIN a otra cuenta desde el aplicativo.';
  end if;

  if v_user_id=auth.uid() and (v_rol<>'ADMIN' or coalesce(p_activo,false)=false) then
    raise exception 'La cuenta ADMIN actual no puede quitarse su propio acceso.';
  end if;

  if v_rol='PROYECTO' then
    if p_proyecto_id is null or not exists (
      select 1 from public.proyectos p where p.id=p_proyecto_id and p.activo=true
    ) then
      raise exception 'Para rol PROYECTO debe seleccionar un proyecto activo.';
    end if;
  end if;

  insert into public.perfiles(id,nombres,apellidos,cargo,email,rol,activo)
  values(
    v_user_id,
    btrim(coalesce(p_nombres,'')),
    btrim(coalesce(p_apellidos,'')),
    nullif(btrim(coalesce(p_cargo,'')),''),
    v_email,
    v_rol,
    coalesce(p_activo,true)
  )
  on conflict(id) do update set
    nombres=excluded.nombres,
    apellidos=excluded.apellidos,
    cargo=excluded.cargo,
    email=excluded.email,
    rol=excluded.rol,
    activo=excluded.activo;

  delete from public.usuario_proyectos where usuario_id=v_user_id;

  if v_rol='PROYECTO' then
    insert into public.usuario_proyectos(usuario_id,proyecto_id)
    values(v_user_id,p_proyecto_id)
    on conflict do nothing;
  end if;

  return query select v_user_id,v_email,v_rol,case when v_rol='PROYECTO' then p_proyecto_id else null end;
end;
$$;

revoke all on function public.admin_configurar_usuario_existente(text,text,text,text,text,boolean,uuid) from public;
grant execute on function public.admin_configurar_usuario_existente(text,text,text,text,text,boolean,uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. RLS RESTRICTIVA: CAPA DE SEGURIDAD ADICIONAL
-- Estas politicas son RESTRICTIVE: limitan las politicas permisivas existentes.
-- ------------------------------------------------------------

-- PROYECTOS
alter table public.proyectos enable row level security;
drop policy if exists "v43 restringir proyectos lectura" on public.proyectos;
create policy "v43 restringir proyectos lectura"
on public.proyectos as restrictive for select to authenticated
using (public.puede_acceder_proyecto(id));

-- USUARIO_PROYECTOS
alter table public.usuario_proyectos enable row level security;
drop policy if exists "v43 restringir usuario proyectos lectura" on public.usuario_proyectos;
create policy "v43 restringir usuario proyectos lectura"
on public.usuario_proyectos as restrictive for select to authenticated
using (usuario_id=auth.uid() or public.es_admin_sistema());

-- OCURRENCIAS
alter table public.ocurrencias enable row level security;
drop policy if exists "v43 restringir ocurrencias select" on public.ocurrencias;
drop policy if exists "v43 restringir ocurrencias insert" on public.ocurrencias;
drop policy if exists "v43 restringir ocurrencias update" on public.ocurrencias;
drop policy if exists "v43 restringir ocurrencias delete" on public.ocurrencias;
create policy "v43 restringir ocurrencias select" on public.ocurrencias as restrictive for select to authenticated using (public.puede_acceder_proyecto(proyecto_id));
create policy "v43 restringir ocurrencias insert" on public.ocurrencias as restrictive for insert to authenticated with check (public.puede_gestionar_proyecto(proyecto_id));
create policy "v43 restringir ocurrencias update" on public.ocurrencias as restrictive for update to authenticated using (public.puede_gestionar_proyecto(proyecto_id)) with check (public.puede_gestionar_proyecto(proyecto_id));
create policy "v43 restringir ocurrencias delete" on public.ocurrencias as restrictive for delete to authenticated using (public.es_admin_sistema());

-- EVIDENCIAS
alter table public.evidencias enable row level security;
drop policy if exists "v43 restringir evidencias select" on public.evidencias;
drop policy if exists "v43 restringir evidencias insert" on public.evidencias;
drop policy if exists "v43 restringir evidencias update" on public.evidencias;
drop policy if exists "v43 restringir evidencias delete" on public.evidencias;
create policy "v43 restringir evidencias select" on public.evidencias as restrictive for select to authenticated using (exists(select 1 from public.ocurrencias o where o.id=evidencias.ocurrencia_id and public.puede_acceder_proyecto(o.proyecto_id)));
create policy "v43 restringir evidencias insert" on public.evidencias as restrictive for insert to authenticated with check (exists(select 1 from public.ocurrencias o where o.id=evidencias.ocurrencia_id and public.puede_gestionar_proyecto(o.proyecto_id)));
create policy "v43 restringir evidencias update" on public.evidencias as restrictive for update to authenticated using (exists(select 1 from public.ocurrencias o where o.id=evidencias.ocurrencia_id and public.puede_gestionar_proyecto(o.proyecto_id))) with check (exists(select 1 from public.ocurrencias o where o.id=evidencias.ocurrencia_id and public.puede_gestionar_proyecto(o.proyecto_id)));
create policy "v43 restringir evidencias delete" on public.evidencias as restrictive for delete to authenticated using (public.es_admin_sistema());

-- CAUSAS VINCULADAS
alter table public.ocurrencia_causas_inmediatas enable row level security;
alter table public.ocurrencia_causas_basicas enable row level security;
drop policy if exists "v43 restringir oci select" on public.ocurrencia_causas_inmediatas;
drop policy if exists "v43 restringir oci insert" on public.ocurrencia_causas_inmediatas;
drop policy if exists "v43 restringir ocb select" on public.ocurrencia_causas_basicas;
drop policy if exists "v43 restringir ocb insert" on public.ocurrencia_causas_basicas;
create policy "v43 restringir oci select" on public.ocurrencia_causas_inmediatas as restrictive for select to authenticated using (exists(select 1 from public.ocurrencias o where o.id=ocurrencia_causas_inmediatas.ocurrencia_id and public.puede_acceder_proyecto(o.proyecto_id)));
create policy "v43 restringir oci insert" on public.ocurrencia_causas_inmediatas as restrictive for insert to authenticated with check (exists(select 1 from public.ocurrencias o where o.id=ocurrencia_causas_inmediatas.ocurrencia_id and public.puede_gestionar_proyecto(o.proyecto_id)));
create policy "v43 restringir ocb select" on public.ocurrencia_causas_basicas as restrictive for select to authenticated using (exists(select 1 from public.ocurrencias o where o.id=ocurrencia_causas_basicas.ocurrencia_id and public.puede_acceder_proyecto(o.proyecto_id)));
create policy "v43 restringir ocb insert" on public.ocurrencia_causas_basicas as restrictive for insert to authenticated with check (exists(select 1 from public.ocurrencias o where o.id=ocurrencia_causas_basicas.ocurrencia_id and public.puede_gestionar_proyecto(o.proyecto_id)));

-- REPORTES DE TRABAJADORES
alter table public.reportes_trabajadores enable row level security;
drop policy if exists "v43 restringir reportes select" on public.reportes_trabajadores;
drop policy if exists "v43 restringir reportes update" on public.reportes_trabajadores;
drop policy if exists "v43 restringir reportes delete" on public.reportes_trabajadores;
create policy "v43 restringir reportes select" on public.reportes_trabajadores as restrictive for select to authenticated using (public.puede_acceder_proyecto(proyecto_id));
create policy "v43 restringir reportes update" on public.reportes_trabajadores as restrictive for update to authenticated using (public.puede_gestionar_proyecto(proyecto_id)) with check (public.puede_gestionar_proyecto(proyecto_id));
create policy "v43 restringir reportes delete" on public.reportes_trabajadores as restrictive for delete to authenticated using (public.es_admin_sistema());

-- ASIGNACIONES
alter table public.asignaciones_levantamiento enable row level security;
drop policy if exists "v43 restringir asignaciones select" on public.asignaciones_levantamiento;
drop policy if exists "v43 restringir asignaciones update" on public.asignaciones_levantamiento;
create policy "v43 restringir asignaciones select" on public.asignaciones_levantamiento as restrictive for select to authenticated using (exists(select 1 from public.ocurrencias o where o.id=asignaciones_levantamiento.ocurrencia_id and public.puede_acceder_proyecto(o.proyecto_id)));
create policy "v43 restringir asignaciones update" on public.asignaciones_levantamiento as restrictive for update to authenticated using (exists(select 1 from public.ocurrencias o where o.id=asignaciones_levantamiento.ocurrencia_id and public.puede_gestionar_proyecto(o.proyecto_id))) with check (exists(select 1 from public.ocurrencias o where o.id=asignaciones_levantamiento.ocurrencia_id and public.puede_gestionar_proyecto(o.proyecto_id)));

-- HISTORIAL
alter table public.historial_ocurrencias enable row level security;
drop policy if exists "v43 restringir historial select" on public.historial_ocurrencias;
create policy "v43 restringir historial select" on public.historial_ocurrencias as restrictive for select to authenticated using (exists(select 1 from public.ocurrencias o where o.id=historial_ocurrencias.ocurrencia_id and public.puede_acceder_proyecto(o.proyecto_id)));

-- AMPLIACIONES
alter table public.ampliaciones_plazo enable row level security;
drop policy if exists "v43 restringir ampliaciones select" on public.ampliaciones_plazo;
create policy "v43 restringir ampliaciones select" on public.ampliaciones_plazo as restrictive for select to authenticated using (exists(select 1 from public.ocurrencias o where o.id=ampliaciones_plazo.ocurrencia_id and public.puede_acceder_proyecto(o.proyecto_id)));

-- RESPONSABLES DE CORRECCION
alter table public.responsables_correccion enable row level security;
drop policy if exists "v43 restringir responsables select" on public.responsables_correccion;
drop policy if exists "v43 restringir responsables insert" on public.responsables_correccion;
drop policy if exists "v43 restringir responsables update" on public.responsables_correccion;
create policy "v43 restringir responsables select" on public.responsables_correccion as restrictive for select to authenticated
using (
  public.es_rol_corporativo()
  or aplica_todos_proyectos=true
  or (proyecto_id is not null and public.puede_acceder_proyecto(proyecto_id))
);
create policy "v43 restringir responsables insert" on public.responsables_correccion as restrictive for insert to authenticated with check (public.es_admin_sistema());
create policy "v43 restringir responsables update" on public.responsables_correccion as restrictive for update to authenticated using (public.es_admin_sistema()) with check (public.es_admin_sistema());

-- PERFILES
alter table public.perfiles enable row level security;
drop policy if exists "v43 restringir perfiles select" on public.perfiles;
drop policy if exists "v43 restringir perfiles update" on public.perfiles;
create policy "v43 restringir perfiles select" on public.perfiles as restrictive for select to authenticated using (public.puede_ver_perfil(id));
create policy "v43 restringir perfiles update" on public.perfiles as restrictive for update to authenticated using (public.es_admin_sistema()) with check (public.es_admin_sistema());

commit;

-- ------------------------------------------------------------
-- 7. VERIFICACION
-- ------------------------------------------------------------
select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'rol_actual','es_admin_sistema','es_admin_sig','es_rol_corporativo',
    'puede_acceder_proyecto','puede_gestionar_proyecto',
    'listar_proyectos_autorizados_actual','admin_listar_usuarios_accesos',
    'admin_configurar_usuario_existente'
  )
order by routine_name;

select policyname,tablename,cmd,permissive
from pg_policies
where schemaname='public'
  and policyname like 'v43 restringir%'
order by tablename,policyname;

begin;

-- ------------------------------------------------------------
-- 8. ACTUALIZAR RPC DE AMPLIACION PARA LOS NUEVOS ROLES
-- La autorizacion depende del alcance del proyecto, no de una lista fija de roles.
-- ------------------------------------------------------------
create or replace function public.ampliar_plazo_ocurrencia(
    p_ocurrencia_id uuid,
    p_fecha_nueva date,
    p_motivo text
)
returns table (
    ampliacion_id uuid,
    fecha_original date,
    fecha_anterior date,
    fecha_nueva date,
    numero_ampliaciones integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_occ record;
    v_actor_nombre text;
    v_ampliacion_id uuid;
    v_historial_id uuid;
    v_estado text;
    v_numero integer;
begin
    if auth.uid() is null then raise exception 'Debe iniciar sesion'; end if;

    select o.*, eo.codigo as estado_codigo
    into v_occ
    from public.ocurrencias o
    left join public.estados_ocurrencia eo on eo.id=o.estado_id
    where o.id=p_ocurrencia_id
    for update of o;

    if not found then raise exception 'Ocurrencia no encontrada'; end if;
    if not public.puede_gestionar_proyecto(v_occ.proyecto_id) then
        raise exception 'No tiene autorizacion para gestionar este proyecto';
    end if;

    v_estado:=coalesce(v_occ.estado_codigo,'');
    if v_estado not in ('ABIERTO','EN_PROCESO') then raise exception 'Solo se puede ampliar el plazo de ocurrencias ABIERTAS o EN PROCESO'; end if;
    if v_occ.fecha_levantamiento is null then raise exception 'La ocurrencia no tiene una fecha limite vigente para ampliar'; end if;
    if p_fecha_nueva is null then raise exception 'Debe indicar la nueva fecha limite'; end if;
    if p_fecha_nueva<=v_occ.fecha_levantamiento then raise exception 'La nueva fecha debe ser posterior a la fecha limite vigente'; end if;
    if p_fecha_nueva<=current_date then raise exception 'La nueva fecha debe ser posterior a la fecha actual'; end if;
    if char_length(btrim(coalesce(p_motivo,'')))<10 then raise exception 'Debe registrar un motivo de al menos 10 caracteres'; end if;

    v_actor_nombre:=public.nombre_actor_historial(auth.uid(),null);

    insert into public.ampliaciones_plazo(ocurrencia_id,fecha_anterior,fecha_nueva,dias_ampliados,motivo,autorizado_por_id,actor_nombre)
    values(p_ocurrencia_id,v_occ.fecha_levantamiento,p_fecha_nueva,p_fecha_nueva-v_occ.fecha_levantamiento,btrim(p_motivo),auth.uid(),v_actor_nombre)
    returning id into v_ampliacion_id;

    perform set_config('ssomac.ampliacion_plazo_autorizada','1',true);
    update public.ocurrencias as o
    set fecha_levantamiento=p_fecha_nueva,
        fecha_levantamiento_original=coalesce(o.fecha_levantamiento_original,v_occ.fecha_levantamiento),
        numero_ampliaciones=coalesce(o.numero_ampliaciones,0)+1,
        fecha_ultima_ampliacion=now()
    where o.id=p_ocurrencia_id
    returning o.numero_ampliaciones into v_numero;
    perform set_config('ssomac.ampliacion_plazo_autorizada','0',true);

    update public.asignaciones_levantamiento set fecha_limite=p_fecha_nueva
    where ocurrencia_id=p_ocurrencia_id and activo=true;

    select h.id into v_historial_id
    from public.historial_ocurrencias h
    where h.ocurrencia_id=p_ocurrencia_id and h.tipo_evento='FECHA_LIMITE_MODIFICADA'
    order by h.creado_en desc,h.id desc limit 1;

    if v_historial_id is not null then
      update public.historial_ocurrencias
      set tipo_evento='PLAZO_AMPLIADO',titulo='Plazo de levantamiento ampliado',
          detalle='Fecha anterior: '||to_char(v_occ.fecha_levantamiento,'DD/MM/YYYY')||' · Nueva fecha: '||to_char(p_fecha_nueva,'DD/MM/YYYY')||' · Motivo: '||btrim(p_motivo),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('ampliacion_id',v_ampliacion_id,'fecha_original',coalesce(v_occ.fecha_levantamiento_original,v_occ.fecha_levantamiento),'fecha_anterior',v_occ.fecha_levantamiento,'fecha_nueva',p_fecha_nueva,'dias_ampliados',p_fecha_nueva-v_occ.fecha_levantamiento,'motivo',btrim(p_motivo),'numero_ampliacion',v_numero)
      where id=v_historial_id;
    else
      insert into public.historial_ocurrencias(ocurrencia_id,tipo_evento,titulo,detalle,estado_anterior,estado_nuevo,actor_id,actor_nombre,metadata)
      values(p_ocurrencia_id,'PLAZO_AMPLIADO','Plazo de levantamiento ampliado','Fecha anterior: '||to_char(v_occ.fecha_levantamiento,'DD/MM/YYYY')||' · Nueva fecha: '||to_char(p_fecha_nueva,'DD/MM/YYYY')||' · Motivo: '||btrim(p_motivo),v_estado,v_estado,auth.uid(),v_actor_nombre,jsonb_build_object('ampliacion_id',v_ampliacion_id,'fecha_original',coalesce(v_occ.fecha_levantamiento_original,v_occ.fecha_levantamiento),'fecha_anterior',v_occ.fecha_levantamiento,'fecha_nueva',p_fecha_nueva,'dias_ampliados',p_fecha_nueva-v_occ.fecha_levantamiento,'motivo',btrim(p_motivo),'numero_ampliacion',v_numero));
    end if;

    return query select v_ampliacion_id,coalesce(v_occ.fecha_levantamiento_original,v_occ.fecha_levantamiento),v_occ.fecha_levantamiento,p_fecha_nueva,v_numero;
end;
$$;

revoke all on function public.ampliar_plazo_ocurrencia(uuid,date,text) from public;
grant execute on function public.ampliar_plazo_ocurrencia(uuid,date,text) to authenticated;

commit;
