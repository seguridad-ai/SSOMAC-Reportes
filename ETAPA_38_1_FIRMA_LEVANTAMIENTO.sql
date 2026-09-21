-- ============================================================
-- ETAPA 38.1 - FIRMA DIGITAL DE QUIEN REALIZA EL LEVANTAMIENTO
-- Explo Drilling Perú - SSOMAC Digital
-- ============================================================
-- Objetivo:
-- 1) Exigir firma digital en el levantamiento público por token.
-- 2) Guardar la firma como evidencia FIRMA_LEVANTAMIENTO.
-- 3) Registrar el nombre real de quien ejecuta el levantamiento.
--
-- La política de Storage creada en ETAPA 29 ya permite subir archivos
-- dentro de: levantamientos/<token>/evidencia/
-- Por ello no se requiere una política adicional para la firma.
-- ============================================================

begin;

-- Retiramos la versión anterior para impedir levantamientos públicos
-- sin firma digital desde clientes antiguos.
drop function if exists public.public_registrar_levantamiento(uuid,text,text);
drop function if exists public.public_registrar_levantamiento(uuid,text,text,text,text);

create function public.public_registrar_levantamiento(
    p_token uuid,
    p_comentario text,
    p_ruta_foto text,
    p_ruta_firma text,
    p_firmante_nombre text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_asig record;
    v_estado_pendiente uuid;
begin
    if char_length(btrim(coalesce(p_comentario,''))) < 5 then
        raise exception 'Describe la acción correctiva realizada';
    end if;

    if char_length(btrim(coalesce(p_firmante_nombre,''))) < 3 then
        raise exception 'Indica el nombre de quien realiza el levantamiento';
    end if;

    if p_ruta_foto is null
       or p_ruta_foto not like ('levantamientos/' || p_token::text || '/evidencia/%')
       or position('..' in p_ruta_foto) > 0 then
        raise exception 'Ruta de evidencia no válida';
    end if;

    if p_ruta_firma is null
       or p_ruta_firma not like ('levantamientos/' || p_token::text || '/evidencia/%')
       or position('..' in p_ruta_firma) > 0 then
        raise exception 'Ruta de firma no válida';
    end if;

    if p_ruta_firma = p_ruta_foto then
        raise exception 'La firma y la fotografía deben ser archivos distintos';
    end if;

    select a.*, o.estado_id
    into v_asig
    from public.asignaciones_levantamiento a
    join public.ocurrencias o on o.id = a.ocurrencia_id
    where a.token = p_token
      and a.activo = true
    for update of a;

    if not found then
        raise exception 'Asignación no encontrada';
    end if;

    if v_asig.estado not in ('PENDIENTE','CORREO_ENVIADO','DEVUELTO') then
        raise exception 'El levantamiento ya fue procesado';
    end if;

    if exists (
        select 1
        from public.evidencias e
        where e.ocurrencia_id = v_asig.ocurrencia_id
          and e.tipo_evidencia = 'LEVANTAMIENTO'
    ) then
        raise exception 'Ya existe una evidencia de levantamiento';
    end if;

    insert into public.evidencias (
        ocurrencia_id,
        tipo_evidencia,
        ruta_archivo,
        comentario,
        creado_por_id
    ) values (
        v_asig.ocurrencia_id,
        'LEVANTAMIENTO',
        p_ruta_foto,
        btrim(p_comentario),
        null
    );

    insert into public.evidencias (
        ocurrencia_id,
        tipo_evidencia,
        ruta_archivo,
        comentario,
        creado_por_id
    ) values (
        v_asig.ocurrencia_id,
        'FIRMA_LEVANTAMIENTO',
        p_ruta_firma,
        btrim(p_firmante_nombre),
        null
    );

    select eo.id
    into v_estado_pendiente
    from public.estados_ocurrencia eo
    where eo.codigo = 'PENDIENTE_VALIDACION'
      and eo.activo = true
    limit 1;

    if v_estado_pendiente is null then
        raise exception 'No existe el estado PENDIENTE_VALIDACION';
    end if;

    update public.ocurrencias
    set fecha_ejecutada = current_date,
        levantado_por_id = null,
        levantado_por_externo = btrim(p_firmante_nombre),
        observacion_validacion = null,
        estado_id = v_estado_pendiente
    where id = v_asig.ocurrencia_id;

    update public.asignaciones_levantamiento
    set estado = 'LEVANTADO',
        levantado_en = now()
    where id = v_asig.id;

    return true;
end;
$$;

revoke all on function public.public_registrar_levantamiento(uuid,text,text,text,text) from public;
grant execute on function public.public_registrar_levantamiento(uuid,text,text,text,text) to anon, authenticated;

commit;

-- ============================================================
-- VERIFICACIÓN
-- Debe devolver una fila con 5 argumentos.
-- ============================================================
select
    p.proname as funcion,
    pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'public_registrar_levantamiento';
