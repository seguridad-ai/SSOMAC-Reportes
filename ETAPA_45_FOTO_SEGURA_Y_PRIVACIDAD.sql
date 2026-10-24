-- ============================================================
-- ETAPA 45
-- FOTO SEGURA EN EL ENLACE PUBLICO + PRIVACIDAD DEL REPORTANTE
-- Ejecutar en Supabase -> SQL Editor -> Run
-- ============================================================

begin;

-- La URL firmada se genera desde una sesion interna autorizada y se guarda
-- en la asignacion. El supervisor externo solo puede obtenerla presentando
-- el token UUID de su asignacion.
alter table public.asignaciones_levantamiento
  add column if not exists url_foto_hallazgo_firmada text;

alter table public.asignaciones_levantamiento
  add column if not exists foto_hallazgo_url_expira_en timestamptz;

comment on column public.asignaciones_levantamiento.url_foto_hallazgo_firmada
  is 'URL firmada de la fotografia HALLAZGO preparada para el enlace publico de levantamiento.';

comment on column public.asignaciones_levantamiento.foto_hallazgo_url_expira_en
  is 'Fecha de expiracion de la URL firmada de la fotografia HALLAZGO.';

-- El bucket continua PRIVADO. Esta funcion no expone rutas ni permite listar
-- archivos: devuelve solamente la URL ya firmada asociada al token recibido.
drop function if exists public.public_obtener_foto_levantamiento_v45(uuid);

create function public.public_obtener_foto_levantamiento_v45(
  p_token uuid
)
returns table (
  url_foto_hallazgo text,
  expira_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when a.foto_hallazgo_url_expira_en is not null
       and a.foto_hallazgo_url_expira_en > now()
      then a.url_foto_hallazgo_firmada
      else null
    end as url_foto_hallazgo,
    a.foto_hallazgo_url_expira_en as expira_en
  from public.asignaciones_levantamiento a
  where a.token = p_token
    and a.activo = true
  limit 1;
$$;

revoke all on function public.public_obtener_foto_levantamiento_v45(uuid) from public;
grant execute on function public.public_obtener_foto_levantamiento_v45(uuid) to anon, authenticated;

commit;

-- VERIFICACION
select
  column_name,
  data_type
from information_schema.columns
where table_schema='public'
  and table_name='asignaciones_levantamiento'
  and column_name in (
    'url_foto_hallazgo_firmada',
    'foto_hallazgo_url_expira_en'
  )
order by column_name;

select
  routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name='public_obtener_foto_levantamiento_v45';
