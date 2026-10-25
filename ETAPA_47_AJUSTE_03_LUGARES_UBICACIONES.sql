-- ============================================================
-- V11.8.3 · AJUSTE ETAPA 47
-- ÁREAS/PROCESOS + LUGARES/UBICACIONES
-- Ejecutar DESPUÉS de ETAPA_47_AJUSTE_02_AREAS_Y_LEVANTAMIENTO.sql
-- ============================================================
begin;

create table if not exists public.lugares_proyecto (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  area_proyecto_id uuid references public.areas_proyecto(id) on delete set null,
  nombre text not null,
  activo boolean not null default true,
  creado_por_id uuid default auth.uid() references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists ux_lugares_proyecto_nombre
  on public.lugares_proyecto(proyecto_id, upper(btrim(nombre)));
create index if not exists ix_lugares_proyecto_area on public.lugares_proyecto(area_proyecto_id);

-- Garantiza que el área vinculada pertenezca al mismo proyecto.
create or replace function public.e483_validar_area_lugar()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_project uuid;
begin
  if new.area_proyecto_id is not null then
    select ap.proyecto_id into v_project from public.areas_proyecto ap where ap.id=new.area_proyecto_id;
    if v_project is null or v_project<>new.proyecto_id then
      raise exception 'El área / proceso debe pertenecer al mismo proyecto o sede del lugar.';
    end if;
  end if;
  new.nombre=upper(btrim(new.nombre));new.actualizado_en=now();return new;
end;$$;

drop trigger if exists trg_e483_validar_lugar on public.lugares_proyecto;
create trigger trg_e483_validar_lugar before insert or update on public.lugares_proyecto
for each row execute function public.e483_validar_area_lugar();

alter table public.lugares_proyecto enable row level security;
drop policy if exists "e483 lugares select" on public.lugares_proyecto;
drop policy if exists "e483 lugares insert" on public.lugares_proyecto;
drop policy if exists "e483 lugares update" on public.lugares_proyecto;
drop policy if exists "e483 lugares delete" on public.lugares_proyecto;
create policy "e483 lugares select" on public.lugares_proyecto for select to authenticated using (public.puede_acceder_proyecto(proyecto_id));
create policy "e483 lugares insert" on public.lugares_proyecto for insert to authenticated with check (public.e472_puede_administrar_area(proyecto_id) and (creado_por_id is null or creado_por_id=auth.uid()));
create policy "e483 lugares update" on public.lugares_proyecto for update to authenticated using (public.e472_puede_administrar_area(proyecto_id)) with check (public.e472_puede_administrar_area(proyecto_id));
create policy "e483 lugares delete" on public.lugares_proyecto for delete to authenticated using (public.es_admin_sistema());
grant select,insert,update,delete on public.lugares_proyecto to authenticated;

alter table public.inspecciones_generales add column if not exists lugar_id uuid references public.lugares_proyecto(id) on delete set null;
alter table public.ocurrencias add column if not exists lugar_id uuid references public.lugares_proyecto(id) on delete set null;
alter table public.ocurrencias add column if not exists area_hallazgo_proyecto_id uuid references public.areas_proyecto(id) on delete set null;
alter table public.reportes_trabajadores add column if not exists lugar_id uuid references public.lugares_proyecto(id) on delete set null;
alter table public.reportes_trabajadores add column if not exists area_hallazgo_proyecto_id uuid references public.areas_proyecto(id) on delete set null;

-- Solo migra lugares realmente usados en inspecciones previas; NO convierte áreas/procesos en lugares.
insert into public.lugares_proyecto(proyecto_id,area_proyecto_id,nombre,activo,creado_por_id)
select distinct i.proyecto_id,i.area_proyecto_id,upper(btrim(i.area_inspeccionada)),true,i.creado_por_id
from public.inspecciones_generales i
where nullif(btrim(i.area_inspeccionada),'') is not null
  and not exists(select 1 from public.lugares_proyecto l where l.proyecto_id=i.proyecto_id and upper(btrim(l.nombre))=upper(btrim(i.area_inspeccionada)));

update public.inspecciones_generales i set lugar_id=l.id
from public.lugares_proyecto l
where i.lugar_id is null and l.proyecto_id=i.proyecto_id and upper(btrim(l.nombre))=upper(btrim(i.area_inspeccionada));

-- Lista pública segura de lugares para el formulario QR de trabajadores.
create or replace function public.public_listar_lugares_reporte(p_proyecto_id uuid)
returns table(id uuid,nombre text,area_proyecto_id uuid,area_nombre text)
language sql stable security definer set search_path=public,pg_temp as $$
  select l.id,l.nombre,l.area_proyecto_id,ap.nombre
  from public.lugares_proyecto l
  left join public.areas_proyecto ap on ap.id=l.area_proyecto_id
  join public.proyectos p on p.id=l.proyecto_id
  where l.proyecto_id=p_proyecto_id and l.activo=true and coalesce(p.activo,true)=true
  order by l.nombre;
$$;
revoke all on function public.public_listar_lugares_reporte(uuid) from public;
grant execute on function public.public_listar_lugares_reporte(uuid) to anon,authenticated;

-- Asocia el lugar seleccionado después de crear el reporte público, validando su token.
create or replace function public.public_asignar_lugar_reporte(p_reporte_id uuid,p_token_publico uuid,p_lugar_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_report record;v_place record;
begin
  select * into v_report from public.reportes_trabajadores where id=p_reporte_id and token_publico=p_token_publico;
  if not found then raise exception 'Reporte o token inválido.'; end if;
  select * into v_place from public.lugares_proyecto where id=p_lugar_id and activo=true;
  if not found or v_place.proyecto_id<>v_report.proyecto_id then raise exception 'Lugar no válido para este proyecto.';end if;
  update public.reportes_trabajadores set lugar_id=v_place.id,area_hallazgo_proyecto_id=v_place.area_proyecto_id,lugar_hallazgo=v_place.nombre,actualizado_en=now() where id=v_report.id;
  return true;
end;$$;
revoke all on function public.public_asignar_lugar_reporte(uuid,uuid,uuid) from public;
grant execute on function public.public_asignar_lugar_reporte(uuid,uuid,uuid) to anon,authenticated;

commit;

select table_name from information_schema.tables where table_schema='public' and table_name='lugares_proyecto';
