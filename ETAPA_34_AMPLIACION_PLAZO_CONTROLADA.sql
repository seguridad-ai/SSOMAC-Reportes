-- ============================================================
-- ETAPA 34
-- AMPLIACION DE PLAZO CONTROLADA + TRAZABILIDAD
-- ============================================================
-- Objetivo:
--   - Conservar la fecha limite original.
--   - Permitir ampliaciones solo mediante una funcion controlada.
--   - Exigir motivo y nueva fecha posterior al plazo vigente.
--   - Actualizar la fecha limite de la asignacion activa.
--   - Registrar cada ampliacion en una tabla propia y en el historial.
--
-- Requisitos previos:
--   ETAPA 33 - historial_ocurrencias y sus triggers.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CAMPOS DE CONTROL EN OCURRENCIAS
-- ------------------------------------------------------------
alter table public.ocurrencias
add column if not exists fecha_levantamiento_original date;

alter table public.ocurrencias
add column if not exists numero_ampliaciones integer not null default 0;

alter table public.ocurrencias
add column if not exists fecha_ultima_ampliacion timestamptz;

-- Para registros existentes, la fecha vigente al momento de instalar
-- esta etapa se toma como fecha original.
update public.ocurrencias
set fecha_levantamiento_original = fecha_levantamiento
where fecha_levantamiento_original is null
  and fecha_levantamiento is not null;

-- ------------------------------------------------------------
-- 2. TABLA DE AMPLIACIONES
-- ------------------------------------------------------------
create table if not exists public.ampliaciones_plazo (
    id uuid primary key default gen_random_uuid(),
    ocurrencia_id uuid not null references public.ocurrencias(id) on delete cascade,
    fecha_anterior date not null,
    fecha_nueva date not null,
    dias_ampliados integer not null,
    motivo text not null,
    autorizado_por_id uuid references public.perfiles(id) on delete set null,
    actor_nombre text not null,
    creado_en timestamptz not null default now(),
    constraint ampliaciones_plazo_fecha_check check (fecha_nueva > fecha_anterior),
    constraint ampliaciones_plazo_dias_check check (dias_ampliados > 0),
    constraint ampliaciones_plazo_motivo_check check (char_length(btrim(motivo)) >= 10)
);

create index if not exists idx_ampliaciones_plazo_ocurrencia_fecha
on public.ampliaciones_plazo(ocurrencia_id, creado_en desc);

alter table public.ampliaciones_plazo enable row level security;

revoke all on table public.ampliaciones_plazo from anon;
revoke insert, update, delete on table public.ampliaciones_plazo from authenticated;
grant select on table public.ampliaciones_plazo to authenticated;

drop policy if exists "ver ampliaciones de proyectos autorizados"
on public.ampliaciones_plazo;

create policy "ver ampliaciones de proyectos autorizados"
on public.ampliaciones_plazo
for select
to authenticated
using (
    exists (
        select 1
        from public.ocurrencias o
        where o.id = ampliaciones_plazo.ocurrencia_id
          and public.puede_acceder_proyecto(o.proyecto_id)
    )
);

-- ------------------------------------------------------------
-- 3. FIJAR FECHA ORIGINAL EN NUEVAS OCURRENCIAS
-- ------------------------------------------------------------
create or replace function public.inicializar_fecha_original_ocurrencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if new.fecha_levantamiento_original is null
       and new.fecha_levantamiento is not null then
        new.fecha_levantamiento_original := new.fecha_levantamiento;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_inicializar_fecha_original_ocurrencia
on public.ocurrencias;

create trigger trg_inicializar_fecha_original_ocurrencia
before insert
on public.ocurrencias
for each row
execute function public.inicializar_fecha_original_ocurrencia();

-- ------------------------------------------------------------
-- 4. BLOQUEAR CAMBIOS DIRECTOS DE FECHA DESDE LA APLICACION
-- ------------------------------------------------------------
-- Un administrador de base de datos puede hacer mantenimiento desde SQL.
-- Para usuarios autenticados, la fecha solo puede cambiar mediante el RPC
-- ampliar_plazo_ocurrencia().
create or replace function public.proteger_plazo_ocurrencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_autorizado text;
begin
    v_autorizado := current_setting('ssomac.ampliacion_plazo_autorizada', true);

    if auth.uid() is not null
       and old.fecha_levantamiento is distinct from new.fecha_levantamiento
       and coalesce(v_autorizado,'0') <> '1' then
        raise exception 'La fecha limite no puede modificarse directamente. Use la ampliacion de plazo controlada.';
    end if;

    if auth.uid() is not null
       and old.fecha_levantamiento_original is distinct from new.fecha_levantamiento_original
       and coalesce(v_autorizado,'0') <> '1' then
        raise exception 'La fecha limite original no puede modificarse.';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_proteger_plazo_ocurrencia
on public.ocurrencias;

create trigger trg_proteger_plazo_ocurrencia
before update
on public.ocurrencias
for each row
execute function public.proteger_plazo_ocurrencia();

-- ------------------------------------------------------------
-- 5. RPC CONTROLADO PARA AMPLIAR PLAZO
-- ------------------------------------------------------------
create or replace function public.ampliar_plazo_ocurrencia(
    p_ocurrencia_id uuid,
    p_fecha_nueva date,
    p_motivo text
)
returns table (
    ampliacion_id uuid,
    fecha_original date,
    fecha_anterior date,
    fecha_nueva date,
    numero_ampliaciones integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_occ record;
    v_rol text;
    v_activo boolean;
    v_actor_nombre text;
    v_ampliacion_id uuid;
    v_historial_id uuid;
    v_estado text;
    v_numero integer;
begin
    if auth.uid() is null then
        raise exception 'Debe iniciar sesion';
    end if;

    select p.rol, p.activo
    into v_rol, v_activo
    from public.perfiles p
    where p.id = auth.uid();

    if coalesce(v_activo,false) = false then
        raise exception 'Usuario inactivo';
    end if;

    if coalesce(v_rol,'') not in ('ADMIN','SIG','ING_SEGURIDAD') then
        raise exception 'No tiene permisos para ampliar plazos';
    end if;

    select
        o.*,
        eo.codigo as estado_codigo
    into v_occ
    from public.ocurrencias o
    left join public.estados_ocurrencia eo on eo.id = o.estado_id
    where o.id = p_ocurrencia_id
    for update of o;

    if not found then
        raise exception 'Ocurrencia no encontrada';
    end if;

    if not public.puede_gestionar_proyecto(v_occ.proyecto_id) then
        raise exception 'No tiene autorizacion para gestionar este proyecto';
    end if;

    v_estado := coalesce(v_occ.estado_codigo,'');

    if v_estado not in ('ABIERTO','EN_PROCESO') then
        raise exception 'Solo se puede ampliar el plazo de ocurrencias ABIERTAS o EN PROCESO';
    end if;

    if v_occ.fecha_levantamiento is null then
        raise exception 'La ocurrencia no tiene una fecha limite vigente para ampliar';
    end if;

    if p_fecha_nueva is null then
        raise exception 'Debe indicar la nueva fecha limite';
    end if;

    if p_fecha_nueva <= v_occ.fecha_levantamiento then
        raise exception 'La nueva fecha debe ser posterior a la fecha limite vigente';
    end if;

    if p_fecha_nueva <= current_date then
        raise exception 'La nueva fecha debe ser posterior a la fecha actual';
    end if;

    if char_length(btrim(coalesce(p_motivo,''))) < 10 then
        raise exception 'Debe registrar un motivo de al menos 10 caracteres';
    end if;

    v_actor_nombre := public.nombre_actor_historial(auth.uid(), null);

    insert into public.ampliaciones_plazo (
        ocurrencia_id,
        fecha_anterior,
        fecha_nueva,
        dias_ampliados,
        motivo,
        autorizado_por_id,
        actor_nombre
    ) values (
        p_ocurrencia_id,
        v_occ.fecha_levantamiento,
        p_fecha_nueva,
        p_fecha_nueva - v_occ.fecha_levantamiento,
        btrim(p_motivo),
        auth.uid(),
        v_actor_nombre
    )
    returning id into v_ampliacion_id;

    -- Habilita exclusivamente esta actualizacion para el trigger protector.
    perform set_config('ssomac.ampliacion_plazo_autorizada','1',true);

    update public.ocurrencias
    set fecha_levantamiento = p_fecha_nueva,
        fecha_levantamiento_original = coalesce(fecha_levantamiento_original, v_occ.fecha_levantamiento),
        numero_ampliaciones = coalesce(numero_ampliaciones,0) + 1,
        fecha_ultima_ampliacion = now()
    where id = p_ocurrencia_id
    returning numero_ampliaciones into v_numero;

    perform set_config('ssomac.ampliacion_plazo_autorizada','0',true);

    -- Mantener sincronizada la fecha que ve el responsable mediante su token.
    update public.asignaciones_levantamiento
    set fecha_limite = p_fecha_nueva
    where ocurrencia_id = p_ocurrencia_id
      and activo = true;

    -- ETAPA 33 ya genera un evento FECHA_LIMITE_MODIFICADA.
    -- Lo enriquecemos y lo convertimos en un evento especifico de ampliacion.
    select h.id
    into v_historial_id
    from public.historial_ocurrencias h
    where h.ocurrencia_id = p_ocurrencia_id
      and h.tipo_evento = 'FECHA_LIMITE_MODIFICADA'
    order by h.creado_en desc, h.id desc
    limit 1;

    if v_historial_id is not null then
        update public.historial_ocurrencias
        set tipo_evento = 'PLAZO_AMPLIADO',
            titulo = 'Plazo de levantamiento ampliado',
            detalle =
                'Fecha anterior: ' || to_char(v_occ.fecha_levantamiento,'DD/MM/YYYY') ||
                ' · Nueva fecha: ' || to_char(p_fecha_nueva,'DD/MM/YYYY') ||
                ' · Motivo: ' || btrim(p_motivo),
            metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
                'ampliacion_id',v_ampliacion_id,
                'fecha_original',coalesce(v_occ.fecha_levantamiento_original,v_occ.fecha_levantamiento),
                'fecha_anterior',v_occ.fecha_levantamiento,
                'fecha_nueva',p_fecha_nueva,
                'dias_ampliados',p_fecha_nueva - v_occ.fecha_levantamiento,
                'motivo',btrim(p_motivo),
                'numero_ampliacion',v_numero
            )
        where id = v_historial_id;
    else
        -- Respaldo por si el trigger de ETAPA 33 no estuviera activo.
        insert into public.historial_ocurrencias (
            ocurrencia_id,tipo_evento,titulo,detalle,
            estado_anterior,estado_nuevo,actor_id,actor_nombre,metadata
        ) values (
            p_ocurrencia_id,
            'PLAZO_AMPLIADO',
            'Plazo de levantamiento ampliado',
            'Fecha anterior: ' || to_char(v_occ.fecha_levantamiento,'DD/MM/YYYY') ||
            ' · Nueva fecha: ' || to_char(p_fecha_nueva,'DD/MM/YYYY') ||
            ' · Motivo: ' || btrim(p_motivo),
            v_estado,v_estado,auth.uid(),v_actor_nombre,
            jsonb_build_object(
                'ampliacion_id',v_ampliacion_id,
                'fecha_original',coalesce(v_occ.fecha_levantamiento_original,v_occ.fecha_levantamiento),
                'fecha_anterior',v_occ.fecha_levantamiento,
                'fecha_nueva',p_fecha_nueva,
                'dias_ampliados',p_fecha_nueva - v_occ.fecha_levantamiento,
                'motivo',btrim(p_motivo),
                'numero_ampliacion',v_numero
            )
        );
    end if;

    return query
    select
        v_ampliacion_id,
        coalesce(v_occ.fecha_levantamiento_original,v_occ.fecha_levantamiento),
        v_occ.fecha_levantamiento,
        p_fecha_nueva,
        v_numero;
end;
$$;

revoke all on function public.ampliar_plazo_ocurrencia(uuid,date,text) from public;
grant execute on function public.ampliar_plazo_ocurrencia(uuid,date,text) to authenticated;

-- ------------------------------------------------------------
-- 6. VERIFICACION
-- ------------------------------------------------------------
select column_name,data_type,column_default
from information_schema.columns
where table_schema='public'
  and table_name='ocurrencias'
  and column_name in (
      'fecha_levantamiento_original',
      'numero_ampliaciones',
      'fecha_ultima_ampliacion'
  )
order by ordinal_position;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in (
      'inicializar_fecha_original_ocurrencia',
      'proteger_plazo_ocurrencia',
      'ampliar_plazo_ocurrencia'
  )
order by routine_name;

select trigger_name,event_manipulation,event_object_table
from information_schema.triggers
where trigger_schema='public'
  and trigger_name in (
      'trg_inicializar_fecha_original_ocurrencia',
      'trg_proteger_plazo_ocurrencia'
  )
order by trigger_name,event_manipulation;

select policyname,cmd,roles
from pg_policies
where schemaname='public'
  and tablename='ampliaciones_plazo';
