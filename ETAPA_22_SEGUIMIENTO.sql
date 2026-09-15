-- ============================================================
-- ETAPA 22
-- FLUJO DE SEGUIMIENTO DE OCURRENCIAS
-- ============================================================

-- 1. Campo para registrar observación de validación / rechazo.
alter table public.ocurrencias
add column if not exists observacion_validacion text;


-- 2. Buena práctica debe nacer CERRADA.
--    Acto/Condición debe nacer ABIERTO.
create or replace function public.preparar_nueva_ocurrencia()
returns trigger
language plpgsql
as $$
declare
    v_origen text;
begin

    if auth.uid() is not null then
        new.reportado_por_id := auth.uid();
    end if;

    select nombre
      into v_origen
      from public.origenes_hallazgo
     where id = new.origen_hallazgo_id;

    if v_origen = 'BUENA PRACTICA' then
        select id
          into new.estado_id
          from public.estados_ocurrencia
         where codigo = 'CERRADO'
         limit 1;
    else
        select id
          into new.estado_id
          from public.estados_ocurrencia
         where codigo = 'ABIERTO'
         limit 1;
    end if;

    return new;
end;
$$;


-- 3. Validar transiciones de estado.
create or replace function public.validar_flujo_estado_ocurrencia()
returns trigger
language plpgsql
as $$
declare
    v_old text;
    v_new text;
    v_origen text;
begin

    if old.estado_id is not distinct from new.estado_id then
        return new;
    end if;

    select codigo into v_old
    from public.estados_ocurrencia
    where id = old.estado_id;

    select codigo into v_new
    from public.estados_ocurrencia
    where id = new.estado_id;

    select oh.nombre into v_origen
    from public.origenes_hallazgo oh
    where oh.id = new.origen_hallazgo_id;

    -- Buena práctica no requiere seguimiento.
    if v_origen = 'BUENA PRACTICA' then
        if v_new <> 'CERRADO' then
            raise exception 'Una BUENA PRACTICA debe permanecer CERRADA';
        end if;
        return new;
    end if;

    -- Transiciones permitidas.
    if not (
        (v_old = 'ABIERTO' and v_new in ('EN_PROCESO','PENDIENTE_VALIDACION'))
        or
        (v_old = 'EN_PROCESO' and v_new = 'PENDIENTE_VALIDACION')
        or
        (v_old = 'PENDIENTE_VALIDACION' and v_new in ('CERRADO','EN_PROCESO'))
    ) then
        raise exception 'Transición de estado no permitida: % -> %', v_old, v_new;
    end if;

    -- Para enviar a validación debe existir levantamiento.
    if v_new = 'PENDIENTE_VALIDACION' then

        if new.fecha_ejecutada is null or new.levantado_por_id is null then
            raise exception 'Debe registrar fecha y usuario de levantamiento';
        end if;

        if not exists (
            select 1
            from public.evidencias e
            where e.ocurrencia_id = new.id
              and e.tipo_evidencia = 'LEVANTAMIENTO'
        ) then
            raise exception 'Debe existir una evidencia de LEVANTAMIENTO';
        end if;

    end if;

    -- Para cerrar debe quedar identificada la validación.
    if v_new = 'CERRADO' then
        if new.validado_por_id is null or new.fecha_validacion is null then
            raise exception 'Debe registrar el usuario y fecha de validación';
        end if;
    end if;

    -- Si se devuelve para corrección, limpiar validación anterior.
    if v_new = 'EN_PROCESO' then
        new.validado_por_id := null;
        new.fecha_validacion := null;
    end if;

    return new;
end;
$$;


drop trigger if exists trg_validar_flujo_estado_ocurrencia
on public.ocurrencias;

create trigger trg_validar_flujo_estado_ocurrencia
before update of estado_id
on public.ocurrencias
for each row
execute function public.validar_flujo_estado_ocurrencia();


-- 4. Verificación.
select
    column_name,
    data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ocurrencias'
  and column_name = 'observacion_validacion';

select
    trigger_name,
    event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'ocurrencias'
  and trigger_name = 'trg_validar_flujo_estado_ocurrencia';
