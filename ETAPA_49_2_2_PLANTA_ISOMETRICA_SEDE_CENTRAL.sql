-- ============================================================
-- ETAPA 49.2.2 - PLANTA ISOMETRICA DE LA SEDE CENTRAL
-- SSOMAC Digital - Explo Drilling Peru
-- Registra en Supabase el asset publicado en GitHub Pages.
-- Requiere haber ejecutado ETAPA_49_2_1_MAPA_SEGURIDAD.sql.
-- ============================================================

begin;

do $$
declare
  v_proyecto_id uuid;
begin
  -- Priorizamos la sede/proyecto Lima; también reconoce "Sede Central".
  select p.id
    into v_proyecto_id
  from public.proyectos p
  where coalesce(p.activo,true)=true
    and (
      upper(coalesce(p.codigo,'')) like '%LIMA%'
      or upper(coalesce(p.nombre,'')) like '%LIMA%'
      or upper(coalesce(p.nombre,'')) like '%SEDE CENTRAL%'
    )
  order by
    case
      when upper(coalesce(p.codigo,''))='LIMA' then 1
      when upper(coalesce(p.nombre,''))='LIMA' then 2
      when upper(coalesce(p.nombre,'')) like '%SEDE CENTRAL%' then 3
      else 4
    end,
    p.nombre
  limit 1;

  if v_proyecto_id is null then
    raise exception 'No se encontro un proyecto/sede activo con LIMA o SEDE CENTRAL. Registra el plano manualmente en mapas_seguridad indicando el proyecto correcto.';
  end if;

  -- Evita conflicto con el indice que permite un solo plano principal activo.
  update public.mapas_seguridad
     set principal=false,
         actualizado_en=now()
   where proyecto_id=v_proyecto_id
     and principal=true
     and activo=true;

  update public.mapas_seguridad
     set nombre='Planta isométrica - Sede Central',
         tipo_vista='ISOMETRICO',
         imagen_ruta='assets/mapas/sede-central-isometrica-v1.png',
         ancho_referencia=1536,
         alto_referencia=1024,
         version='v1',
         activo=true,
         principal=true,
         actualizado_en=now()
   where proyecto_id=v_proyecto_id
     and upper(btrim(nombre))=upper(btrim('Planta isométrica - Sede Central'));

  if not found then
    insert into public.mapas_seguridad(
      proyecto_id,nombre,tipo_vista,imagen_ruta,
      ancho_referencia,alto_referencia,version,activo,principal
    ) values (
      v_proyecto_id,'Planta isométrica - Sede Central','ISOMETRICO',
      'assets/mapas/sede-central-isometrica-v1.png',1536,1024,'v1',true,true
    );
  end if;
end $$;

commit;

select 'ETAPA 49.2.2 PLANTA ISOMETRICA SEDE CENTRAL OK' as resultado;
