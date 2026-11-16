-- ============================================================
-- ETAPA 49.2.6 - OTROS EQUIPOS DE EMERGENCIA EN MAPA
-- SSOMAC Digital - Explo Drilling Peru
-- ============================================================
-- Crea un maestro con UUID permanente para camillas, lavaojos,
-- duchas de emergencia, alarmas, luces de emergencia, puntos de
-- reunión, zonas seguras y otros equipos. Los marcadores del mapa
-- quedan vinculados al maestro mediante equipo_emergencia_id.
-- ============================================================

begin;

create table if not exists public.equipos_emergencia (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  tipo_equipo text not null
    check (tipo_equipo in (
      'CAMILLA','LAVAOJOS','DUCHA_EMERGENCIA','ALARMA','LUZ_EMERGENCIA',
      'PUNTO_REUNION','ZONA_SEGURA','OTRO'
    )),
  codigo text not null,
  nombre text,
  ubicacion_nombre text,
  responsable text,
  estado_equipo text not null default 'OPERATIVO'
    check (estado_equipo in ('OPERATIVO','OBSERVADO','FUERA_SERVICIO')),
  fecha_ultima_revision date,
  fecha_proxima_revision date,
  observacion text,
  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint ck_equipo_emergencia_codigo check (nullif(btrim(codigo),'') is not null)
);

create unique index if not exists uq_equipo_emergencia_codigo_activo
on public.equipos_emergencia(proyecto_id, upper(btrim(codigo)))
where activo=true;

create index if not exists ix_equipos_emergencia_proyecto_tipo
on public.equipos_emergencia(proyecto_id,tipo_equipo,activo);

alter table public.mapa_seguridad_elementos
  add column if not exists equipo_emergencia_id uuid references public.equipos_emergencia(id) on delete cascade;

create unique index if not exists uq_mapa_equipo_emergencia_por_plano
on public.mapa_seguridad_elementos(mapa_id, equipo_emergencia_id)
where equipo_emergencia_id is not null and activo=true;

-- RLS del maestro de equipos.
alter table public.equipos_emergencia enable row level security;

drop policy if exists "equipos emergencia select" on public.equipos_emergencia;
create policy "equipos emergencia select" on public.equipos_emergencia
for select to authenticated using (public.puede_acceder_proyecto(proyecto_id));

drop policy if exists "equipos emergencia insert" on public.equipos_emergencia;
create policy "equipos emergencia insert" on public.equipos_emergencia
for insert to authenticated with check (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "equipos emergencia update" on public.equipos_emergencia;
create policy "equipos emergencia update" on public.equipos_emergencia
for update to authenticated using (public.puede_gestionar_proyecto(proyecto_id))
with check (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "equipos emergencia delete" on public.equipos_emergencia;
create policy "equipos emergencia delete" on public.equipos_emergencia
for delete to authenticated using (public.es_admin_sistema());

commit;

select 'ETAPA 49.2.6 OTROS EQUIPOS EMERGENCIA OK' as resultado;
