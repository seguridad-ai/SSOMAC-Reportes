-- ============================================================
-- ETAPA 49.2.5 - INTEGRACION DE BOTIQUINES AL MAPA DE SEGURIDAD
-- SSOMAC Digital - Explo Drilling Peru
-- ============================================================
-- Crea identidad permanente (UUID) para cada botiquin, enlaza
-- las inspecciones de Etapa 48 y permite ubicar botiquines de
-- ubicacion como marcadores dinamicos en mapas_seguridad.
-- ============================================================

begin;

create table if not exists public.botiquines (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  tipo text not null default 'UBICACION' check (tipo in ('UBICACION','VEHICULO')),
  codigo_botiquin text,
  placa_vehiculo text,
  lugar_id uuid references public.lugares_proyecto(id) on delete set null,
  area_proyecto_id uuid references public.areas_proyecto(id) on delete set null,
  ubicacion_nombre text,
  responsable_botiquin text,
  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint ck_botiquin_identidad check (
    (tipo='UBICACION' and nullif(btrim(coalesce(codigo_botiquin,'')),'') is not null)
    or
    (tipo='VEHICULO' and nullif(btrim(coalesce(placa_vehiculo,'')),'') is not null)
  )
);

create unique index if not exists uq_botiquin_codigo_proyecto
on public.botiquines(proyecto_id, upper(btrim(codigo_botiquin)))
where tipo='UBICACION' and activo=true;

create unique index if not exists uq_botiquin_vehiculo_proyecto
on public.botiquines(proyecto_id, upper(btrim(placa_vehiculo)))
where tipo='VEHICULO' and activo=true;

alter table public.inspecciones_botiquin
  add column if not exists botiquin_id uuid references public.botiquines(id) on delete set null;

create index if not exists ix_inspecciones_botiquin_botiquin_fecha
on public.inspecciones_botiquin(botiquin_id,fecha_inspeccion desc);

alter table public.mapa_seguridad_elementos
  add column if not exists botiquin_id uuid references public.botiquines(id) on delete cascade;

-- Garantiza que un marcador BOTIQUIN siempre apunte al maestro.
alter table public.mapa_seguridad_elementos
  drop constraint if exists ck_mapa_elemento_botiquin;
alter table public.mapa_seguridad_elementos
  add constraint ck_mapa_elemento_botiquin
  check (tipo_elemento <> 'BOTIQUIN' or botiquin_id is not null);

create unique index if not exists uq_mapa_botiquin_por_plano
on public.mapa_seguridad_elementos(mapa_id, botiquin_id)
where botiquin_id is not null and activo=true;

-- ------------------------------------------------------------
-- MIGRACION DE BOTIQUINES DE UBICACION YA INSPECCIONADOS
-- Se toma la inspeccion mas reciente de cada codigo/proyecto.
-- ------------------------------------------------------------
insert into public.botiquines(
  proyecto_id,tipo,codigo_botiquin,lugar_id,area_proyecto_id,
  ubicacion_nombre,responsable_botiquin,activo,creado_por,creado_en,actualizado_en
)
select s.proyecto_id,'UBICACION',s.codigo_botiquin,s.lugar_id,s.area_proyecto_id,
       s.ubicacion_nombre,s.responsable_botiquin,true,s.creado_por,coalesce(s.creado_en,now()),now()
from (
  select distinct on (i.proyecto_id, upper(btrim(i.codigo_botiquin)))
         i.*
  from public.inspecciones_botiquin i
  where i.tipo='UBICACION'
    and nullif(btrim(coalesce(i.codigo_botiquin,'')),'') is not null
  order by i.proyecto_id, upper(btrim(i.codigo_botiquin)), i.fecha_inspeccion desc, i.creado_en desc
) s
where not exists (
  select 1 from public.botiquines b
  where b.proyecto_id=s.proyecto_id and b.tipo='UBICACION' and b.activo=true
    and upper(btrim(b.codigo_botiquin))=upper(btrim(s.codigo_botiquin))
);

update public.inspecciones_botiquin i
set botiquin_id=b.id
from public.botiquines b
where i.botiquin_id is null
  and i.tipo='UBICACION'
  and b.proyecto_id=i.proyecto_id
  and b.tipo='UBICACION'
  and b.activo=true
  and upper(btrim(b.codigo_botiquin))=upper(btrim(i.codigo_botiquin));

-- Migra identidad de botiquines vehiculares para conservar trazabilidad,
-- aunque no se muestran como marcadores fijos sobre la planta.
insert into public.botiquines(
  proyecto_id,tipo,placa_vehiculo,ubicacion_nombre,responsable_botiquin,
  activo,creado_por,creado_en,actualizado_en
)
select s.proyecto_id,'VEHICULO',s.placa_vehiculo,s.ubicacion_nombre,s.responsable_botiquin,
       true,s.creado_por,coalesce(s.creado_en,now()),now()
from (
  select distinct on (i.proyecto_id, upper(btrim(i.placa_vehiculo)))
         i.*
  from public.inspecciones_botiquin i
  where i.tipo='VEHICULO'
    and nullif(btrim(coalesce(i.placa_vehiculo,'')),'') is not null
  order by i.proyecto_id, upper(btrim(i.placa_vehiculo)), i.fecha_inspeccion desc, i.creado_en desc
) s
where not exists (
  select 1 from public.botiquines b
  where b.proyecto_id=s.proyecto_id and b.tipo='VEHICULO' and b.activo=true
    and upper(btrim(b.placa_vehiculo))=upper(btrim(s.placa_vehiculo))
);

update public.inspecciones_botiquin i
set botiquin_id=b.id
from public.botiquines b
where i.botiquin_id is null
  and i.tipo='VEHICULO'
  and b.proyecto_id=i.proyecto_id
  and b.tipo='VEHICULO'
  and b.activo=true
  and upper(btrim(b.placa_vehiculo))=upper(btrim(i.placa_vehiculo));

-- ------------------------------------------------------------
-- RLS DEL MAESTRO
-- ------------------------------------------------------------
alter table public.botiquines enable row level security;

drop policy if exists "botiquines select" on public.botiquines;
create policy "botiquines select" on public.botiquines
for select to authenticated using (public.puede_acceder_proyecto(proyecto_id));

drop policy if exists "botiquines insert" on public.botiquines;
create policy "botiquines insert" on public.botiquines
for insert to authenticated with check (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "botiquines update" on public.botiquines;
create policy "botiquines update" on public.botiquines
for update to authenticated using (public.puede_gestionar_proyecto(proyecto_id))
with check (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "botiquines delete" on public.botiquines;
create policy "botiquines delete" on public.botiquines
for delete to authenticated using (public.puede_gestionar_proyecto(proyecto_id));

commit;

select 'ETAPA 49.2.5 BOTIQUINES EN MAPA OK' as resultado,
       (select count(*) from public.botiquines where tipo='UBICACION') as botiquines_ubicacion,
       (select count(*) from public.inspecciones_botiquin where botiquin_id is not null) as inspecciones_enlazadas;
