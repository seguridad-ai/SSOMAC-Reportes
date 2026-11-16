-- ============================================================
-- ETAPA 49.2.1 - INFRAESTRUCTURA DEL MAPA DE SEGURIDAD
-- SSOMAC Digital - Explo Drilling Peru
-- Base para plano isometrico interactivo y equipos de emergencia
-- ============================================================

begin;

create table if not exists public.mapas_seguridad (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  nombre text not null,
  tipo_vista text not null default 'ISOMETRICO'
    check (tipo_vista in ('ISOMETRICO','PLANO_2D','SATELITAL')),
  imagen_ruta text,
  ancho_referencia integer,
  alto_referencia integer,
  version text,
  activo boolean not null default true,
  principal boolean not null default false,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists uq_mapa_seguridad_nombre_proyecto
on public.mapas_seguridad(proyecto_id, upper(btrim(nombre)));

-- Solo un plano principal activo por proyecto.
create unique index if not exists uq_mapa_seguridad_principal_proyecto
on public.mapas_seguridad(proyecto_id)
where principal=true and activo=true;

create table if not exists public.mapa_seguridad_elementos (
  id uuid primary key default gen_random_uuid(),
  mapa_id uuid not null references public.mapas_seguridad(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,

  -- En la primera integracion EXTINTOR se vincula al catalogo existente.
  -- OTRO permite registrar equipos futuros sin bloquear el desarrollo.
  tipo_elemento text not null
    check (tipo_elemento in (
      'EXTINTOR','BOTIQUIN','CAMILLA','LAVAOJOS','DUCHA_EMERGENCIA',
      'ALARMA','LUZ_EMERGENCIA','PUNTO_REUNION','ZONA_SEGURA','OTRO'
    )),
  extintor_id uuid references public.extintores(id) on delete cascade,

  codigo text,
  nombre text,
  descripcion text,
  icono text,

  -- Coordenadas relativas al lienzo (0 a 100); no se almacenan pixeles.
  pos_x numeric(7,4) not null default 50 check (pos_x between 0 and 100),
  pos_y numeric(7,4) not null default 50 check (pos_y between 0 and 100),
  escala numeric(6,3) not null default 1 check (escala > 0 and escala <= 5),
  rotacion numeric(7,3) not null default 0,
  orden_capa integer not null default 10,

  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint ck_mapa_elemento_extintor
    check (tipo_elemento <> 'EXTINTOR' or extintor_id is not null)
);

create unique index if not exists uq_mapa_extintor_por_plano
on public.mapa_seguridad_elementos(mapa_id, extintor_id)
where extintor_id is not null and activo=true;

create index if not exists ix_mapa_elementos_mapa_tipo
on public.mapa_seguridad_elementos(mapa_id,tipo_elemento,activo);

-- Historial de movimientos para trazabilidad.
create table if not exists public.mapa_seguridad_movimientos (
  id uuid primary key default gen_random_uuid(),
  elemento_id uuid not null references public.mapa_seguridad_elementos(id) on delete cascade,
  mapa_id uuid not null references public.mapas_seguridad(id) on delete cascade,
  pos_x_anterior numeric(7,4),
  pos_y_anterior numeric(7,4),
  pos_x_nueva numeric(7,4) not null,
  pos_y_nueva numeric(7,4) not null,
  motivo text,
  movido_por uuid references public.perfiles(id) on delete set null,
  movido_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.mapas_seguridad enable row level security;
alter table public.mapa_seguridad_elementos enable row level security;
alter table public.mapa_seguridad_movimientos enable row level security;

drop policy if exists "mapa seguridad select" on public.mapas_seguridad;
create policy "mapa seguridad select" on public.mapas_seguridad
for select to authenticated using (public.puede_acceder_proyecto(proyecto_id));

drop policy if exists "mapa seguridad insert" on public.mapas_seguridad;
create policy "mapa seguridad insert" on public.mapas_seguridad
for insert to authenticated with check (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "mapa seguridad update" on public.mapas_seguridad;
create policy "mapa seguridad update" on public.mapas_seguridad
for update to authenticated using (public.puede_gestionar_proyecto(proyecto_id))
with check (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "mapa seguridad delete" on public.mapas_seguridad;
create policy "mapa seguridad delete" on public.mapas_seguridad
for delete to authenticated using (public.es_admin_sistema());

drop policy if exists "mapa elementos select" on public.mapa_seguridad_elementos;
create policy "mapa elementos select" on public.mapa_seguridad_elementos
for select to authenticated using (public.puede_acceder_proyecto(proyecto_id));

drop policy if exists "mapa elementos insert" on public.mapa_seguridad_elementos;
create policy "mapa elementos insert" on public.mapa_seguridad_elementos
for insert to authenticated with check (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "mapa elementos update" on public.mapa_seguridad_elementos;
create policy "mapa elementos update" on public.mapa_seguridad_elementos
for update to authenticated using (public.puede_gestionar_proyecto(proyecto_id))
with check (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "mapa elementos delete" on public.mapa_seguridad_elementos;
create policy "mapa elementos delete" on public.mapa_seguridad_elementos
for delete to authenticated using (public.puede_gestionar_proyecto(proyecto_id));

drop policy if exists "mapa movimientos select" on public.mapa_seguridad_movimientos;
create policy "mapa movimientos select" on public.mapa_seguridad_movimientos
for select to authenticated using (
  exists(
    select 1 from public.mapas_seguridad m
    where m.id=mapa_id and public.puede_acceder_proyecto(m.proyecto_id)
  )
);

drop policy if exists "mapa movimientos insert" on public.mapa_seguridad_movimientos;
create policy "mapa movimientos insert" on public.mapa_seguridad_movimientos
for insert to authenticated with check (
  exists(
    select 1 from public.mapas_seguridad m
    where m.id=mapa_id and public.puede_gestionar_proyecto(m.proyecto_id)
  )
);

commit;

select 'ETAPA 49.2.1 MAPA SEGURIDAD OK' as resultado;
