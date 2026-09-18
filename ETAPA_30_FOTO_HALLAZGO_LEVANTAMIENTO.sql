-- ============================================================
-- ETAPA 30
-- MOSTRAR FOTO ORIGINAL DEL HALLAZGO EN EL LINK DE LEVANTAMIENTO
-- ============================================================
-- Este cambio mantiene privado el bucket. El enlace público solo recibe
-- la ruta de la evidencia asociada a una ocurrencia con una asignación
-- de levantamiento activa. Luego Supabase genera una URL firmada temporal.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RECREAR LA FUNCION PUBLICA PARA DEVOLVER TAMBIEN LA RUTA
--    DE LA FOTO ORIGINAL DEL HALLAZGO.
-- ------------------------------------------------------------
drop function if exists public.public_obtener_levantamiento(uuid);

create function public.public_obtener_levantamiento(
    p_token uuid
)
returns table (
    codigo_reporte text,
    proyecto text,
    fecha date,
    reportado_por text,
    lugar text,
    tipo_hallazgo text,
    descripcion text,
    accion text,
    fecha_limite date,
    nombre_responsable text,
    estado_asignacion text,
    estado_ocurrencia text,
    puede_levantar boolean,
    ruta_foto_hallazgo text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
    select
        case
            when rt.numero is not null then 'REP-' || lpad(rt.numero::text, 6, '0')
            else 'OC-' || lpad(o.numero::text, 6, '0')
        end as codigo_reporte,
        p.nombre as proyecto,
        o.fecha,
        coalesce(
            nullif(btrim(o.reportado_por_externo), ''),
            nullif(btrim(coalesce(pf.nombres,'') || ' ' || coalesce(pf.apellidos,'')), ''),
            'N.A.'
        ) as reportado_por,
        o.lugar_hallazgo as lugar,
        th.nombre as tipo_hallazgo,
        o.descripcion,
        coalesce(nullif(btrim(o.acciones_implementar),''), 'Por definir') as accion,
        a.fecha_limite,
        a.nombre_responsable,
        a.estado as estado_asignacion,
        eo.codigo as estado_ocurrencia,
        (
            a.activo = true
            and a.estado in ('PENDIENTE','CORREO_ENVIADO','DEVUELTO')
            and eo.codigo not in ('CERRADO','PENDIENTE_VALIDACION')
        ) as puede_levantar,
        fh.ruta_archivo as ruta_foto_hallazgo
    from public.asignaciones_levantamiento a
    join public.ocurrencias o on o.id = a.ocurrencia_id
    join public.proyectos p on p.id = o.proyecto_id
    left join public.tipos_hallazgo th on th.id = o.tipo_hallazgo_id
    left join public.estados_ocurrencia eo on eo.id = o.estado_id
    left join public.perfiles pf on pf.id = o.reportado_por_id
    left join public.reportes_trabajadores rt on rt.id = o.reporte_trabajador_id
    left join lateral (
        select e.ruta_archivo
        from public.evidencias e
        where e.ocurrencia_id = o.id
          and e.tipo_evidencia = 'HALLAZGO'
        order by e.creado_en asc nulls last, e.id
        limit 1
    ) fh on true
    where a.token = p_token
      and a.activo = true
    limit 1;
$$;

revoke all on function public.public_obtener_levantamiento(uuid) from public;
grant execute on function public.public_obtener_levantamiento(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. PERMITIR A UN ENLACE PUBLICO GENERAR URL FIRMADA SOLO PARA
--    FOTOS DE HALLAZGO QUE PERTENECEN A UNA ASIGNACION ACTIVA.
--    El bucket sigue siendo PRIVADO.
-- ------------------------------------------------------------
drop policy if exists "ver foto hallazgo asignacion activa"
on storage.objects;

create policy "ver foto hallazgo asignacion activa"
on storage.objects
for select
to anon
using (
    bucket_id = 'evidencias-ssomac'
    and exists (
        select 1
        from public.evidencias e
        join public.asignaciones_levantamiento a
          on a.ocurrencia_id = e.ocurrencia_id
        where e.ruta_archivo = storage.objects.name
          and e.tipo_evidencia = 'HALLAZGO'
          and a.activo = true
    )
);

-- ------------------------------------------------------------
-- 3. VERIFICACION
-- ------------------------------------------------------------
select
    routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'public_obtener_levantamiento';

select
    policyname,
    cmd,
    roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'ver foto hallazgo asignacion activa';
