-- ============================================================
-- CORRECCION ETAPA 44 - AUDITORIA DE ELIMINACIONES
-- Corrige instalaciones donde auditoria_eliminaciones ya existia
-- antes de la version final de ETAPA 44.
-- ============================================================

begin;

alter table public.auditoria_eliminaciones
  add column if not exists proyecto_nombre text;

alter table public.auditoria_eliminaciones
  add column if not exists eliminado_por_nombre text;

alter table public.auditoria_eliminaciones
  add column if not exists detalle jsonb not null default '{}'::jsonb;

commit;

-- Verificacion: deben aparecer las tres columnas.
select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='auditoria_eliminaciones'
  and column_name in ('proyecto_nombre','eliminado_por_nombre','detalle')
order by column_name;
