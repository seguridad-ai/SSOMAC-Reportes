-- ============================================================
-- ETAPA 47 - MOTOR GENERAL DE INSPECCIONES SSOMAC
-- SSOMAC Digital - Explo Drilling Peru
-- ============================================================
-- Crea:
--   tipos_inspeccion
--   inspeccion_items
--   inspecciones
--   inspeccion_respuestas
--   inspeccion_evidencias
-- Vincula opcionalmente ocurrencias con una inspeccion.
-- Respeta el alcance ADMIN / GERENCIA / PROYECTO de ETAPA 43.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. CATALOGO DE TIPOS DE INSPECCION
-- ------------------------------------------------------------
create table if not exists public.tipos_inspeccion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  icono text,
  activo boolean not null default true,
  orden integer not null default 100,
  creado_por_id uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.inspeccion_items (
  id uuid primary key default gen_random_uuid(),
  tipo_inspeccion_id uuid not null references public.tipos_inspeccion(id) on delete cascade,
  seccion text not null default 'GENERAL',
  codigo text not null,
  criterio text not null,
  criticidad text not null default 'NORMAL' check (criticidad in ('NORMAL','CRITICO')),
  requiere_observacion_nc boolean not null default true,
  activo boolean not null default true,
  orden integer not null default 100,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(tipo_inspeccion_id,codigo)
);

-- ------------------------------------------------------------
-- 2. REGISTRO DE INSPECCIONES
-- ------------------------------------------------------------
create sequence if not exists public.inspecciones_numero_seq;

create table if not exists public.inspecciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null default nextval('public.inspecciones_numero_seq'),
  proyecto_id uuid not null references public.proyectos(id),
  tipo_inspeccion_id uuid not null references public.tipos_inspeccion(id),
  fecha date not null default current_date,
  lugar text not null,
  area text,
  identificacion_activo text,
  inspector_id uuid references public.perfiles(id) on delete set null,
  inspector_nombre text,
  estado text not null default 'COMPLETADA' check (estado in ('BORRADOR','COMPLETADA','ANULADA')),
  total_evaluados integer not null default 0,
  total_conformes integer not null default 0,
  total_no_conformes integer not null default 0,
  total_na integer not null default 0,
  porcentaje_cumplimiento numeric(5,2),
  tiene_incumplimientos boolean not null default false,
  tiene_falla_critica boolean not null default false,
  observaciones_generales text,
  creado_por_id uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(numero)
);

create table if not exists public.inspeccion_respuestas (
  id uuid primary key default gen_random_uuid(),
  inspeccion_id uuid not null references public.inspecciones(id) on delete cascade,
  item_id uuid not null references public.inspeccion_items(id),
  resultado text not null check (resultado in ('CUMPLE','NO_CUMPLE','NA')),
  observacion text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(inspeccion_id,item_id)
);

create table if not exists public.inspeccion_evidencias (
  id uuid primary key default gen_random_uuid(),
  inspeccion_id uuid not null references public.inspecciones(id) on delete cascade,
  item_id uuid references public.inspeccion_items(id) on delete set null,
  ruta_archivo text not null,
  comentario text,
  creado_por_id uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_inspecciones_proyecto_fecha on public.inspecciones(proyecto_id,fecha desc);
create index if not exists idx_inspecciones_tipo on public.inspecciones(tipo_inspeccion_id);
create index if not exists idx_inspeccion_items_tipo_orden on public.inspeccion_items(tipo_inspeccion_id,orden);
create index if not exists idx_inspeccion_respuestas_inspeccion on public.inspeccion_respuestas(inspeccion_id);
create index if not exists idx_inspeccion_evidencias_inspeccion on public.inspeccion_evidencias(inspeccion_id);

-- ------------------------------------------------------------
-- 3. VINCULO CON OCURRENCIAS
-- ------------------------------------------------------------
alter table public.ocurrencias add column if not exists inspeccion_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.ocurrencias'::regclass
      and conname='ocurrencias_inspeccion_id_fkey'
  ) then
    alter table public.ocurrencias
      add constraint ocurrencias_inspeccion_id_fkey
      foreign key (inspeccion_id)
      references public.inspecciones(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_ocurrencias_inspeccion_id on public.ocurrencias(inspeccion_id);

-- ------------------------------------------------------------
-- 4. RECALCULO AUTOMATICO DE RESULTADOS
-- ------------------------------------------------------------
create or replace function public.v47_recalcular_inspeccion(p_inspeccion_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_eval integer:=0;
  v_ok integer:=0;
  v_nc integer:=0;
  v_na integer:=0;
  v_critical boolean:=false;
  v_pct numeric(5,2):=null;
begin
  select
    count(*) filter (where r.resultado<>'NA'),
    count(*) filter (where r.resultado='CUMPLE'),
    count(*) filter (where r.resultado='NO_CUMPLE'),
    count(*) filter (where r.resultado='NA'),
    coalesce(bool_or(r.resultado='NO_CUMPLE' and i.criticidad='CRITICO'),false)
  into v_eval,v_ok,v_nc,v_na,v_critical
  from public.inspeccion_respuestas r
  join public.inspeccion_items i on i.id=r.item_id
  where r.inspeccion_id=p_inspeccion_id;

  if v_eval>0 then
    v_pct=round((v_ok::numeric/v_eval::numeric)*100,2);
  end if;

  update public.inspecciones
  set total_evaluados=coalesce(v_eval,0),
      total_conformes=coalesce(v_ok,0),
      total_no_conformes=coalesce(v_nc,0),
      total_na=coalesce(v_na,0),
      porcentaje_cumplimiento=v_pct,
      tiene_incumplimientos=coalesce(v_nc,0)>0,
      tiene_falla_critica=coalesce(v_critical,false),
      actualizado_en=now()
  where id=p_inspeccion_id;
end;
$$;

revoke all on function public.v47_recalcular_inspeccion(uuid) from public;
grant execute on function public.v47_recalcular_inspeccion(uuid) to authenticated;

create or replace function public.v47_trigger_recalcular_inspeccion()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='DELETE' then
    perform public.v47_recalcular_inspeccion(old.inspeccion_id);
    return old;
  else
    perform public.v47_recalcular_inspeccion(new.inspeccion_id);
    return new;
  end if;
end;
$$;

drop trigger if exists trg_v47_recalcular_inspeccion on public.inspeccion_respuestas;
create trigger trg_v47_recalcular_inspeccion
after insert or update or delete on public.inspeccion_respuestas
for each row execute function public.v47_trigger_recalcular_inspeccion();

-- ------------------------------------------------------------
-- 5. RLS / SEGURIDAD
-- ------------------------------------------------------------
alter table public.tipos_inspeccion enable row level security;
alter table public.inspeccion_items enable row level security;
alter table public.inspecciones enable row level security;
alter table public.inspeccion_respuestas enable row level security;
alter table public.inspeccion_evidencias enable row level security;

-- Plantillas: todos consultan, solo ADMIN configura.
drop policy if exists "v47 tipos inspeccion select" on public.tipos_inspeccion;
drop policy if exists "v47 tipos inspeccion insert" on public.tipos_inspeccion;
drop policy if exists "v47 tipos inspeccion update" on public.tipos_inspeccion;
drop policy if exists "v47 tipos inspeccion delete" on public.tipos_inspeccion;
create policy "v47 tipos inspeccion select" on public.tipos_inspeccion for select to authenticated using (true);
create policy "v47 tipos inspeccion insert" on public.tipos_inspeccion for insert to authenticated with check (public.es_admin_sistema());
create policy "v47 tipos inspeccion update" on public.tipos_inspeccion for update to authenticated using (public.es_admin_sistema()) with check (public.es_admin_sistema());
create policy "v47 tipos inspeccion delete" on public.tipos_inspeccion for delete to authenticated using (public.es_admin_sistema());

drop policy if exists "v47 items inspeccion select" on public.inspeccion_items;
drop policy if exists "v47 items inspeccion insert" on public.inspeccion_items;
drop policy if exists "v47 items inspeccion update" on public.inspeccion_items;
drop policy if exists "v47 items inspeccion delete" on public.inspeccion_items;
create policy "v47 items inspeccion select" on public.inspeccion_items for select to authenticated using (true);
create policy "v47 items inspeccion insert" on public.inspeccion_items for insert to authenticated with check (public.es_admin_sistema());
create policy "v47 items inspeccion update" on public.inspeccion_items for update to authenticated using (public.es_admin_sistema()) with check (public.es_admin_sistema());
create policy "v47 items inspeccion delete" on public.inspeccion_items for delete to authenticated using (public.es_admin_sistema());

-- Inspecciones: alcance real por proyecto.
drop policy if exists "v47 inspecciones select" on public.inspecciones;
drop policy if exists "v47 inspecciones insert" on public.inspecciones;
drop policy if exists "v47 inspecciones update" on public.inspecciones;
drop policy if exists "v47 inspecciones delete" on public.inspecciones;
create policy "v47 inspecciones select" on public.inspecciones for select to authenticated using (public.puede_acceder_proyecto(proyecto_id));
create policy "v47 inspecciones insert" on public.inspecciones for insert to authenticated with check (public.puede_gestionar_proyecto(proyecto_id));
create policy "v47 inspecciones update" on public.inspecciones for update to authenticated using (public.puede_gestionar_proyecto(proyecto_id)) with check (public.puede_gestionar_proyecto(proyecto_id));
create policy "v47 inspecciones delete" on public.inspecciones for delete to authenticated using (public.es_admin_sistema());

-- Respuestas y evidencias heredan el alcance de la inspeccion.
drop policy if exists "v47 respuestas select" on public.inspeccion_respuestas;
drop policy if exists "v47 respuestas insert" on public.inspeccion_respuestas;
drop policy if exists "v47 respuestas update" on public.inspeccion_respuestas;
drop policy if exists "v47 respuestas delete" on public.inspeccion_respuestas;
create policy "v47 respuestas select" on public.inspeccion_respuestas for select to authenticated using (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_respuestas.inspeccion_id and public.puede_acceder_proyecto(x.proyecto_id))
);
create policy "v47 respuestas insert" on public.inspeccion_respuestas for insert to authenticated with check (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_respuestas.inspeccion_id and public.puede_gestionar_proyecto(x.proyecto_id))
);
create policy "v47 respuestas update" on public.inspeccion_respuestas for update to authenticated using (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_respuestas.inspeccion_id and public.puede_gestionar_proyecto(x.proyecto_id))
) with check (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_respuestas.inspeccion_id and public.puede_gestionar_proyecto(x.proyecto_id))
);
create policy "v47 respuestas delete" on public.inspeccion_respuestas for delete to authenticated using (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_respuestas.inspeccion_id and public.puede_gestionar_proyecto(x.proyecto_id))
);

drop policy if exists "v47 evidencias inspeccion select" on public.inspeccion_evidencias;
drop policy if exists "v47 evidencias inspeccion insert" on public.inspeccion_evidencias;
drop policy if exists "v47 evidencias inspeccion update" on public.inspeccion_evidencias;
drop policy if exists "v47 evidencias inspeccion delete" on public.inspeccion_evidencias;
create policy "v47 evidencias inspeccion select" on public.inspeccion_evidencias for select to authenticated using (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_evidencias.inspeccion_id and public.puede_acceder_proyecto(x.proyecto_id))
);
create policy "v47 evidencias inspeccion insert" on public.inspeccion_evidencias for insert to authenticated with check (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_evidencias.inspeccion_id and public.puede_gestionar_proyecto(x.proyecto_id))
);
create policy "v47 evidencias inspeccion update" on public.inspeccion_evidencias for update to authenticated using (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_evidencias.inspeccion_id and public.puede_gestionar_proyecto(x.proyecto_id))
) with check (
  exists(select 1 from public.inspecciones x where x.id=inspeccion_evidencias.inspeccion_id and public.puede_gestionar_proyecto(x.proyecto_id))
);
create policy "v47 evidencias inspeccion delete" on public.inspeccion_evidencias for delete to authenticated using (
  public.es_admin_sistema()
);

-- Storage: permite archivos de inspecciones solo cuando el usuario tiene alcance.
-- Ruta esperada: inspecciones/<inspeccion_uuid>/evidencia/archivo.webp

drop policy if exists "v47 storage inspecciones select" on storage.objects;
drop policy if exists "v47 storage inspecciones insert" on storage.objects;
drop policy if exists "v47 storage inspecciones update" on storage.objects;
create policy "v47 storage inspecciones select" on storage.objects for select to authenticated using (
  bucket_id='evidencias-ssomac'
  and (storage.foldername(name))[1]='inspecciones'
  and exists(
    select 1 from public.inspecciones x
    where x.id::text=(storage.foldername(name))[2]
      and public.puede_acceder_proyecto(x.proyecto_id)
  )
);
create policy "v47 storage inspecciones insert" on storage.objects for insert to authenticated with check (
  bucket_id='evidencias-ssomac'
  and (storage.foldername(name))[1]='inspecciones'
  and exists(
    select 1 from public.inspecciones x
    where x.id::text=(storage.foldername(name))[2]
      and public.puede_gestionar_proyecto(x.proyecto_id)
  )
);
create policy "v47 storage inspecciones update" on storage.objects for update to authenticated using (
  bucket_id='evidencias-ssomac'
  and (storage.foldername(name))[1]='inspecciones'
  and exists(
    select 1 from public.inspecciones x
    where x.id::text=(storage.foldername(name))[2]
      and public.puede_gestionar_proyecto(x.proyecto_id)
  )
) with check (
  bucket_id='evidencias-ssomac'
  and (storage.foldername(name))[1]='inspecciones'
  and exists(
    select 1 from public.inspecciones x
    where x.id::text=(storage.foldername(name))[2]
      and public.puede_gestionar_proyecto(x.proyecto_id)
  )
);

-- ------------------------------------------------------------
-- 6. PRIVILEGIOS
-- ------------------------------------------------------------
grant select,insert,update,delete on public.tipos_inspeccion to authenticated;
grant select,insert,update,delete on public.inspeccion_items to authenticated;
grant select,insert,update,delete on public.inspecciones to authenticated;
grant select,insert,update,delete on public.inspeccion_respuestas to authenticated;
grant select,insert,update,delete on public.inspeccion_evidencias to authenticated;
grant usage,select on sequence public.inspecciones_numero_seq to authenticated;

-- ------------------------------------------------------------
-- 7. PLANTILLA BASE PARA PROBAR EL MOTOR
-- Las plantillas especificas de Botiquines/Extintores se agregan en etapas siguientes.
-- ------------------------------------------------------------
insert into public.tipos_inspeccion(codigo,nombre,descripcion,icono,activo,orden)
values(
  'GENERAL',
  'Inspección General SSOMAC',
  'Plantilla base para verificar el funcionamiento del motor general de inspecciones.',
  '✓',
  true,
  10
)
on conflict (codigo) do update set
  nombre=excluded.nombre,
  descripcion=excluded.descripcion,
  icono=excluded.icono,
  activo=true,
  orden=excluded.orden,
  actualizado_en=now();

with t as (
  select id from public.tipos_inspeccion where codigo='GENERAL'
)
insert into public.inspeccion_items(tipo_inspeccion_id,seccion,codigo,criterio,criticidad,requiere_observacion_nc,activo,orden)
select t.id,v.seccion,v.codigo,v.criterio,v.criticidad,true,true,v.orden
from t
cross join (values
  ('Condiciones generales','GEN-01','El área se encuentra ordenada y limpia.','NORMAL',10),
  ('Condiciones generales','GEN-02','Los accesos, pasillos y vías de evacuación se encuentran libres de obstáculos.','CRITICO',20),
  ('Condiciones generales','GEN-03','La señalización de seguridad requerida se encuentra visible y en buen estado.','NORMAL',30),
  ('Condiciones generales','GEN-04','Los equipos, herramientas o instalaciones observadas se encuentran en condiciones seguras.','CRITICO',40),
  ('Gestión preventiva','GEN-05','Los controles SSOMAC aplicables se encuentran implementados y son efectivos.','CRITICO',50)
) as v(seccion,codigo,criterio,criticidad,orden)
on conflict (tipo_inspeccion_id,codigo) do update set
  seccion=excluded.seccion,
  criterio=excluded.criterio,
  criticidad=excluded.criticidad,
  requiere_observacion_nc=excluded.requiere_observacion_nc,
  activo=true,
  orden=excluded.orden,
  actualizado_en=now();

commit;

-- Verificacion rapida
select 'tipos_inspeccion' as objeto,count(*) as registros from public.tipos_inspeccion
union all
select 'inspeccion_items',count(*) from public.inspeccion_items
union all
select 'inspecciones',count(*) from public.inspecciones;
