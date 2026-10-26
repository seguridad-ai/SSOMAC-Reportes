-- ============================================================
-- V11.9.1 - CORRECCION ETAPA 48
-- Relacion explicita de areas + foto general opcional del botiquin
-- ============================================================

begin;

alter table public.inspecciones_botiquin
  add column if not exists foto_botiquin_ruta text,
  add column if not exists foto_botiquin_descripcion text;

commit;

select 'V11.9.1 OK' as resultado,
       column_name
from information_schema.columns
where table_schema='public'
  and table_name='inspecciones_botiquin'
  and column_name in ('foto_botiquin_ruta','foto_botiquin_descripcion')
order by column_name;
