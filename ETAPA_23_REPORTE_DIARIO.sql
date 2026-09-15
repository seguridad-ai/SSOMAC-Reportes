-- ============================================================
-- ETAPA 23 - REPORTE DIARIO
-- Permitir visualizar los nombres de los reportantes de los
-- proyectos a los que el usuario actual tiene acceso.
-- ============================================================

drop policy if exists "ver reportantes de proyectos autorizados"
on public.perfiles;

create policy "ver reportantes de proyectos autorizados"
on public.perfiles
for select
to authenticated
using (
    exists (
        select 1
        from public.ocurrencias o
        where o.reportado_por_id = perfiles.id
          and public.puede_acceder_proyecto(o.proyecto_id)
    )
);

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'perfiles'
order by policyname;
