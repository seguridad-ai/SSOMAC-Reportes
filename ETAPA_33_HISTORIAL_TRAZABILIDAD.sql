-- ============================================================
-- ETAPA 33
-- HISTORIAL Y TRAZABILIDAD DE OCURRENCIAS
-- ============================================================
-- Objetivo:
--   Registrar automáticamente los principales eventos de cada ocurrencia:
--   creación, asignación, inicio de seguimiento, levantamiento,
--   devolución y cierre.
--
-- Importante:
--   - El historial es de solo lectura para los usuarios de la aplicación.
--   - Los eventos se generan en la base de datos mediante triggers.
--   - Los registros existentes reciben un evento de línea base transparente;
--     no se inventan eventos históricos anteriores a esta implementación.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA DE HISTORIAL
-- ------------------------------------------------------------
create table if not exists public.historial_ocurrencias (
    id uuid primary key default gen_random_uuid(),
    ocurrencia_id uuid not null references public.ocurrencias(id) on delete cascade,
    tipo_evento text not null,
    titulo text not null,
    detalle text,
    estado_anterior text,
    estado_nuevo text,
    actor_id uuid,
    actor_nombre text,
    evidencia_id uuid,
    metadata jsonb not null default '{}'::jsonb,
    creado_en timestamptz not null default now()
);

create index if not exists idx_historial_ocurrencias_ocurrencia_fecha
on public.historial_ocurrencias(ocurrencia_id, creado_en desc);

create index if not exists idx_historial_ocurrencias_tipo
on public.historial_ocurrencias(tipo_evento);

alter table public.historial_ocurrencias enable row level security;

revoke all on table public.historial_ocurrencias from anon;
revoke insert, update, delete on table public.historial_ocurrencias from authenticated;
grant select on table public.historial_ocurrencias to authenticated;

drop policy if exists "ver historial de proyectos autorizados"
on public.historial_ocurrencias;

create policy "ver historial de proyectos autorizados"
on public.historial_ocurrencias
for select
to authenticated
using (
    exists (
        select 1
        from public.ocurrencias o
        where o.id = historial_ocurrencias.ocurrencia_id
          and public.puede_acceder_proyecto(o.proyecto_id)
    )
);

-- ------------------------------------------------------------
-- 2. HELPER: NOMBRE DEL ACTOR
-- ------------------------------------------------------------
create or replace function public.nombre_actor_historial(
    p_actor_id uuid,
    p_fallback text default null
)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
    v_nombre text;
begin
    if p_actor_id is not null then
        select nullif(btrim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')), '')
        into v_nombre
        from public.perfiles p
        where p.id = p_actor_id
        limit 1;
    end if;

    return coalesce(
        v_nombre,
        nullif(btrim(coalesce(p_fallback,'')), ''),
        'Sistema / usuario externo'
    );
end;
$$;

revoke all on function public.nombre_actor_historial(uuid,text) from public;

-- ------------------------------------------------------------
-- 3. TRIGGER PRINCIPAL SOBRE OCURRENCIAS
-- ------------------------------------------------------------
create or replace function public.registrar_historial_ocurrencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_actor_nombre text;
    v_old_estado text;
    v_new_estado text;
    v_origen text;
    v_evidencia_id uuid;
    v_comentario text;
    v_tipo text;
    v_titulo text;
    v_detalle text;
begin
    v_actor_id := auth.uid();

    if tg_op = 'INSERT' then
        select eo.codigo into v_new_estado
        from public.estados_ocurrencia eo
        where eo.id = new.estado_id;

        select oh.nombre into v_origen
        from public.origenes_hallazgo oh
        where oh.id = new.origen_hallazgo_id;

        v_actor_nombre := public.nombre_actor_historial(
            v_actor_id,
            coalesce(new.reportado_por_externo, null)
        );

        if v_origen = 'BUENA PRACTICA' then
            v_tipo := 'BUENA_PRACTICA_REGISTRADA';
            v_titulo := 'Buena práctica registrada';
            v_detalle := 'La buena práctica fue registrada y no requiere levantamiento.';
        else
            v_tipo := 'OCURRENCIA_REGISTRADA';
            v_titulo := 'Ocurrencia registrada';
            v_detalle := case
                when new.modalidad_levantamiento = 'INMEDIATO'
                    then 'Modalidad de levantamiento: inmediato.'
                else 'Modalidad de levantamiento: asignado para seguimiento.'
            end;
        end if;

        insert into public.historial_ocurrencias (
            ocurrencia_id,tipo_evento,titulo,detalle,
            estado_anterior,estado_nuevo,actor_id,actor_nombre
        ) values (
            new.id,v_tipo,v_titulo,v_detalle,
            null,v_new_estado,v_actor_id,v_actor_nombre
        );

        return new;
    end if;

    -- A partir de aquí: UPDATE.
    select eo.codigo into v_old_estado
    from public.estados_ocurrencia eo
    where eo.id = old.estado_id;

    select eo.codigo into v_new_estado
    from public.estados_ocurrencia eo
    where eo.id = new.estado_id;

    v_actor_nombre := public.nombre_actor_historial(
        v_actor_id,
        coalesce(new.levantado_por_externo, new.reportado_por_externo)
    );

    -- Cambio de responsable sin cambio de estado.
    if old.responsable_correccion_id is distinct from new.responsable_correccion_id
       and new.responsable_correccion_id is not null then
        insert into public.historial_ocurrencias (
            ocurrencia_id,tipo_evento,titulo,detalle,
            estado_anterior,estado_nuevo,actor_id,actor_nombre,metadata
        ) values (
            new.id,
            'RESPONSABLE_MODIFICADO',
            'Responsable de corrección modificado',
            'Nuevo responsable: ' || coalesce(nullif(btrim(new.responsable_correccion),''),'No especificado'),
            v_old_estado,v_new_estado,v_actor_id,v_actor_nombre,
            jsonb_build_object('responsable_id',new.responsable_correccion_id)
        );
    end if;

    -- Cambio de fecha límite sin cambio de estado.
    if old.fecha_levantamiento is distinct from new.fecha_levantamiento then
        insert into public.historial_ocurrencias (
            ocurrencia_id,tipo_evento,titulo,detalle,
            estado_anterior,estado_nuevo,actor_id,actor_nombre,metadata
        ) values (
            new.id,
            'FECHA_LIMITE_MODIFICADA',
            'Fecha límite modificada',
            'Fecha anterior: ' || coalesce(to_char(old.fecha_levantamiento,'DD/MM/YYYY'),'Sin fecha') ||
            ' · Nueva fecha: ' || coalesce(to_char(new.fecha_levantamiento,'DD/MM/YYYY'),'Sin fecha'),
            v_old_estado,v_new_estado,v_actor_id,v_actor_nombre,
            jsonb_build_object(
                'fecha_anterior',old.fecha_levantamiento,
                'fecha_nueva',new.fecha_levantamiento
            )
        );
    end if;

    -- Si no cambió el estado, no generar evento adicional.
    if old.estado_id is not distinct from new.estado_id then
        return new;
    end if;

    if v_new_estado = 'EN_PROCESO' and v_old_estado = 'ABIERTO' then
        v_tipo := 'SEGUIMIENTO_INICIADO';
        v_titulo := 'Seguimiento iniciado';
        v_detalle := 'La ocurrencia pasó a gestión de corrección.';

    elsif v_new_estado = 'PENDIENTE_VALIDACION' then
        select e.id, e.comentario
        into v_evidencia_id, v_comentario
        from public.evidencias e
        where e.ocurrencia_id = new.id
          and e.tipo_evidencia = 'LEVANTAMIENTO'
        order by e.creado_en desc nulls last, e.id desc
        limit 1;

        v_tipo := 'LEVANTAMIENTO_ENVIADO';
        v_titulo := 'Levantamiento enviado para validación';
        v_detalle := coalesce(
            nullif(btrim(v_comentario),''),
            'Se registró la corrección y su evidencia fotográfica.'
        );

    elsif v_new_estado = 'EN_PROCESO' and v_old_estado = 'PENDIENTE_VALIDACION' then
        v_tipo := 'LEVANTAMIENTO_DEVUELTO';
        v_titulo := 'Levantamiento devuelto para corrección';
        v_detalle := coalesce(
            nullif(btrim(new.observacion_validacion),''),
            'El levantamiento requiere una nueva corrección.'
        );

    elsif v_new_estado = 'CERRADO' then
        v_tipo := 'OCURRENCIA_CERRADA';
        v_titulo := 'Ocurrencia validada y cerrada';
        v_detalle := coalesce(
            nullif(btrim(new.observacion_validacion),''),
            'Levantamiento validado conforme.'
        );

    else
        v_tipo := 'ESTADO_MODIFICADO';
        v_titulo := 'Estado de la ocurrencia modificado';
        v_detalle := coalesce(v_old_estado,'—') || ' → ' || coalesce(v_new_estado,'—');
    end if;

    insert into public.historial_ocurrencias (
        ocurrencia_id,tipo_evento,titulo,detalle,
        estado_anterior,estado_nuevo,actor_id,actor_nombre,evidencia_id,
        metadata
    ) values (
        new.id,v_tipo,v_titulo,v_detalle,
        v_old_estado,v_new_estado,v_actor_id,v_actor_nombre,v_evidencia_id,
        case
            when v_evidencia_id is not null then jsonb_build_object('evidencia_id',v_evidencia_id)
            else '{}'::jsonb
        end
    );

    return new;
end;
$$;

revoke all on function public.registrar_historial_ocurrencia() from public;

drop trigger if exists trg_registrar_historial_ocurrencia
on public.ocurrencias;

create trigger trg_registrar_historial_ocurrencia
after insert or update
on public.ocurrencias
for each row
execute function public.registrar_historial_ocurrencia();

-- ------------------------------------------------------------
-- 4. TRIGGER DE ASIGNACIÓN DE RESPONSABLE
-- ------------------------------------------------------------
create or replace function public.registrar_historial_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_actor_nombre text;
    v_estado text;
    v_detalle text;
begin
    v_actor_id := auth.uid();
    v_actor_nombre := public.nombre_actor_historial(v_actor_id, null);

    select eo.codigo into v_estado
    from public.ocurrencias o
    left join public.estados_ocurrencia eo on eo.id = o.estado_id
    where o.id = new.ocurrencia_id;

    v_detalle := 'Responsable: ' || coalesce(nullif(btrim(new.nombre_responsable),''),'No especificado');

    if new.fecha_limite is not null then
        v_detalle := v_detalle || ' · Fecha límite: ' || to_char(new.fecha_limite,'DD/MM/YYYY');
    else
        v_detalle := v_detalle || ' · Sin fecha límite definida';
    end if;

    insert into public.historial_ocurrencias (
        ocurrencia_id,tipo_evento,titulo,detalle,
        estado_anterior,estado_nuevo,actor_id,actor_nombre,metadata
    ) values (
        new.ocurrencia_id,
        'RESPONSABLE_ASIGNADO',
        'Responsable asignado para levantamiento',
        v_detalle,
        v_estado,v_estado,v_actor_id,v_actor_nombre,
        jsonb_build_object(
            'asignacion_id',new.id,
            'responsable_id',new.responsable_id,
            'fecha_limite',new.fecha_limite
        )
    );

    return new;
end;
$$;

revoke all on function public.registrar_historial_asignacion() from public;

drop trigger if exists trg_registrar_historial_asignacion
on public.asignaciones_levantamiento;

create trigger trg_registrar_historial_asignacion
after insert
on public.asignaciones_levantamiento
for each row
execute function public.registrar_historial_asignacion();

-- ------------------------------------------------------------
-- 5. LÍNEA BASE PARA OCURRENCIAS QUE YA EXISTÍAN
-- ------------------------------------------------------------
-- Se registra únicamente que la trazabilidad se activó con el estado actual.
-- No se reconstruyen eventos pasados que la base no almacenó como historial.
insert into public.historial_ocurrencias (
    ocurrencia_id,tipo_evento,titulo,detalle,
    estado_anterior,estado_nuevo,actor_id,actor_nombre,creado_en
)
select
    o.id,
    'TRAZABILIDAD_ACTIVADA',
    'Trazabilidad activada',
    'Registro existente al activar el historial. Estado actual: ' || coalesce(eo.nombre,eo.codigo,'No identificado') || '.',
    null,
    eo.codigo,
    null,
    'Sistema',
    now()
from public.ocurrencias o
left join public.estados_ocurrencia eo on eo.id = o.estado_id
where not exists (
    select 1
    from public.historial_ocurrencias h
    where h.ocurrencia_id = o.id
);

-- ------------------------------------------------------------
-- 6. VERIFICACIÓN
-- ------------------------------------------------------------
select column_name,data_type
from information_schema.columns
where table_schema='public'
  and table_name='historial_ocurrencias'
order by ordinal_position;

select trigger_name,event_manipulation,event_object_table
from information_schema.triggers
where trigger_schema='public'
  and trigger_name in (
      'trg_registrar_historial_ocurrencia',
      'trg_registrar_historial_asignacion'
  )
order by trigger_name,event_manipulation;

select policyname,cmd,roles
from pg_policies
where schemaname='public'
  and tablename='historial_ocurrencias';
