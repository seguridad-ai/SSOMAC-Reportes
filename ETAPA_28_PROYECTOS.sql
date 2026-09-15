-- ============================================================
-- ETAPA 28
-- ADMINISTRACION DE PROYECTOS / SEDES
-- ============================================================

-- 1. CAMPOS COMPLEMENTARIOS
alter table public.proyectos
add column if not exists tipo_unidad text not null default 'PROYECTO';

alter table public.proyectos
add column if not exists creado_en timestamptz not null default now();

alter table public.proyectos
add column if not exists creado_por_id uuid
references public.perfiles(id)
on delete set null;

alter table public.proyectos
add column if not exists actualizado_en timestamptz;

alter table public.proyectos
add column if not exists actualizado_por_id uuid
references public.perfiles(id)
on delete set null;

-- Normalizar registros existentes.
update public.proyectos
set tipo_unidad = 'PROYECTO'
where tipo_unidad is null
   or upper(tipo_unidad) not in ('PROYECTO','SEDE');

-- 2. LISTAR UNIDADES PARA ADMIN / SIG
create or replace function public.admin_listar_unidades()
returns table (
    id uuid,
    codigo text,
    nombre text,
    cliente text,
    tipo_unidad text,
    activo boolean,
    creado_en timestamptz,
    actualizado_en timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.es_admin_sig() then
        raise exception 'No autorizado para administrar proyectos';
    end if;

    return query
    select
        p.id,
        p.codigo,
        p.nombre,
        p.cliente,
        p.tipo_unidad,
        p.activo,
        p.creado_en,
        p.actualizado_en
    from public.proyectos p
    order by p.activo desc, p.tipo_unidad, p.nombre;
end;
$$;

revoke all on function public.admin_listar_unidades() from public;
grant execute on function public.admin_listar_unidades() to authenticated;

-- 3. CREAR / EDITAR PROYECTO O SEDE
create or replace function public.admin_guardar_unidad(
    p_id uuid,
    p_codigo text,
    p_nombre text,
    p_cliente text,
    p_tipo_unidad text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_codigo text := upper(trim(coalesce(p_codigo,'')));
    v_nombre text := trim(coalesce(p_nombre,''));
    v_cliente text := nullif(trim(coalesce(p_cliente,'')), '');
    v_tipo text := upper(trim(coalesce(p_tipo_unidad,'PROYECTO')));
begin
    if not public.es_admin_sig() then
        raise exception 'No autorizado para administrar proyectos';
    end if;

    if v_codigo = '' or length(v_codigo) > 15 then
        raise exception 'El código es obligatorio y debe tener máximo 15 caracteres';
    end if;

    if v_codigo !~ '^[A-Z0-9_-]+$' then
        raise exception 'El código solo puede contener letras, números, guion y guion bajo';
    end if;

    if v_nombre = '' then
        raise exception 'El nombre es obligatorio';
    end if;

    if v_tipo not in ('PROYECTO','SEDE') then
        raise exception 'Tipo de unidad no válido';
    end if;

    if exists (
        select 1
        from public.proyectos p
        where upper(p.codigo) = v_codigo
          and (p_id is null or p.id <> p_id)
    ) then
        raise exception 'Ya existe un proyecto o sede con el código %', v_codigo;
    end if;

    if p_id is null then
        insert into public.proyectos (
            codigo,
            nombre,
            cliente,
            tipo_unidad,
            activo,
            creado_por_id
        ) values (
            v_codigo,
            v_nombre,
            v_cliente,
            v_tipo,
            true,
            auth.uid()
        )
        returning id into v_id;

        -- Los usuarios corporativos ADMIN / SIG reciben acceso automáticamente.
        insert into public.usuario_proyectos (usuario_id, proyecto_id)
        select pf.id, v_id
        from public.perfiles pf
        where pf.activo = true
          and pf.rol in ('ADMIN','SIG')
        on conflict do nothing;

    else
        update public.proyectos
        set codigo = v_codigo,
            nombre = v_nombre,
            cliente = v_cliente,
            tipo_unidad = v_tipo,
            actualizado_en = now(),
            actualizado_por_id = auth.uid()
        where id = p_id;

        if not found then
            raise exception 'Proyecto o sede no encontrado';
        end if;

        v_id := p_id;
    end if;

    return v_id;
end;
$$;

revoke all on function public.admin_guardar_unidad(uuid,text,text,text,text) from public;
grant execute on function public.admin_guardar_unidad(uuid,text,text,text,text) to authenticated;

-- 4. ACTIVAR / DESACTIVAR
create or replace function public.admin_cambiar_estado_unidad(
    p_id uuid,
    p_activo boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.es_admin_sig() then
        raise exception 'No autorizado para administrar proyectos';
    end if;

    update public.proyectos
    set activo = p_activo,
        actualizado_en = now(),
        actualizado_por_id = auth.uid()
    where id = p_id;

    if not found then
        raise exception 'Proyecto o sede no encontrado';
    end if;

    return true;
end;
$$;

revoke all on function public.admin_cambiar_estado_unidad(uuid,boolean) from public;
grant execute on function public.admin_cambiar_estado_unidad(uuid,boolean) to authenticated;

-- 5. VERIFICACION
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
      'admin_listar_unidades',
      'admin_guardar_unidad',
      'admin_cambiar_estado_unidad'
  )
order by routine_name;
