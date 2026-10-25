-- ============================================================
-- V11.8.3.1 · CORRECCIÓN RLS STORAGE - INSPECCIONES GENERALES
-- SSOMAC Digital · Explo Drilling Perú
--
-- Corrige el error:
--   new row violates row-level security policy
-- al guardar firma/fotografías de una Inspección General.
--
-- No hace público el bucket. Solo habilita a usuarios autenticados
-- a trabajar con archivos dentro de la carpeta inspecciones-generales/.
-- ============================================================

begin;

-- Elimina versiones previas del parche si existieran.
drop policy if exists "e473 inspecciones storage select" on storage.objects;
drop policy if exists "e473 inspecciones storage insert" on storage.objects;
drop policy if exists "e473 inspecciones storage update" on storage.objects;

-- Lectura autenticada para poder generar URLs firmadas de firmas y fotos.
create policy "e473 inspecciones storage select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'evidencias-ssomac'
  and (storage.foldername(name))[1] = 'inspecciones-generales'
);

-- Carga de firmas y fotografías de observación desde la aplicación interna.
create policy "e473 inspecciones storage insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'evidencias-ssomac'
  and (storage.foldername(name))[1] = 'inspecciones-generales'
  and auth.uid() is not null
);

-- Se deja disponible por compatibilidad si en una edición futura se usa upsert.
create policy "e473 inspecciones storage update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'evidencias-ssomac'
  and (storage.foldername(name))[1] = 'inspecciones-generales'
)
with check (
  bucket_id = 'evidencias-ssomac'
  and (storage.foldername(name))[1] = 'inspecciones-generales'
  and auth.uid() is not null
);

commit;

-- Verificación: deben aparecer 3 políticas.
select policyname, cmd, roles
from pg_policies
where schemaname='storage'
  and tablename='objects'
  and policyname like 'e473 inspecciones storage %'
order by policyname;
