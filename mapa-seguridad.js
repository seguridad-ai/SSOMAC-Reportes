// ============================================================
// ETAPA 49.2.6 - EXTINTORES + BOTIQUINES + OTROS EQUIPOS
// - Selecciona extintores activos aun no ubicados y colocalos con clic.
// - Arrastra marcadores existentes para cambiar su posicion.
// - Guarda coordenadas relativas X/Y (0-100) en Supabase.
// - Registra cada alta/movimiento en mapa_seguridad_movimientos.
// - Zoom 50%-300%, ajuste, rueda del mouse y desplazamiento.
// - Mantiene coordenadas X/Y correctas aun con zoom o paneo.
// - Administra camillas, lavaojos, duchas, alarmas, luces y otros equipos.
// ============================================================
(async function(){
  'use strict';
  if(typeof sb==='undefined') return;

  const LOCAL_SEDE_MAP={
    id:'LOCAL_SEDE_CENTRAL_ISO_V1',
    nombre:'Planta isométrica - Sede Central',
    tipo_vista:'ISOMETRICO',
    imagen_ruta:'assets/mapas/sede-central-isometrica-v1.png',
    ancho_referencia:1536,
    alto_referencia:1024,
    version:'v1',
    principal:true,
    localOnly:true
  };

  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const msg=(text='',ok=false)=>{const el=$('mapMessage');if(!el)return;el.textContent=text;el.className=`message ${text?'visible':''} ${ok?'success':''}`;};
  const ym=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'}).slice(0,7);
  const fmt=v=>{if(!v)return'—';const p=String(v).slice(0,10).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(v);};
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const isUuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));

  let session=null,projects=[],maps=[],elements=[],extinguishers=[],inspectionDetails=[],botiquines=[],botiquinInspections=[],emergencyEquipment=[],currentMap=null,currentProject=null;
  let editMode=false,editTargetType='EXTINTOR',selectedUnplacedId='',selectedElementId='',dirtyMoves=new Map();
  let mapView={zoom:1,panX:0,panY:0},panMode=false,spaceHeld=false,suppressMapClick=false;

  async function boot(){
    session=await requireSession();if(!session)return;
    $('logoutBtn')?.addEventListener('click',logout);
    $('mapPeriod').value=ym();
    bind();
    const {data,error}=await sb.from('usuario_proyectos').select('proyecto_id,proyectos(id,codigo,nombre,cliente,activo)').eq('usuario_id',session.user.id);
    if(error)throw error;
    projects=(data||[]).map(x=>x.proyectos).filter(Boolean);
    $('mapProject').innerHTML='<option value="">Seleccione...</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    const preferred=projects.find(isCentralProject);
    if(projects.length===1||preferred){
      $('mapProject').value=(preferred||projects[0]).id;
      await loadProject();
    }else render();
  }

  function bind(){
    $('mapProject').onchange=async()=>{if(editMode&&!confirmDiscard())return;await loadProject();};
    $('mapPlan').onchange=()=>{if(editMode&&!confirmDiscard())return;selectMap();};
    $('mapPeriod').onchange=render;
    $('layerExt').onchange=render;
    $('layerBot').onchange=render;
    $('layerOther').onchange=render;
    $('mapEquipmentManageBtn').onclick=openEquipmentManager;
    $('mapEditBtn').onclick=enterEditMode;
    $('mapSaveBtn').onclick=savePositions;
    $('mapCancelEditBtn').onclick=cancelEditMode;
    $('equipmentModalClose').onclick=closeEquipmentManager;
    $('equipmentResetBtn').onclick=resetEquipmentForm;
    $('equipmentForm').onsubmit=e=>saveEquipment(e,false);
    $('equipmentSavePlaceBtn').onclick=e=>saveEquipment(e,true);
    $('emergencyEquipmentModal').addEventListener('click',e=>{if(e.target===$('emergencyEquipmentModal'))closeEquipmentManager();});
    $('mapCanvas').addEventListener('click',placeSelectedEquipment);
    $('mapCanvas').addEventListener('pointerdown',startCanvasPan);
    $('mapStage').addEventListener('wheel',handleMapWheel,{passive:false});
    $('mapFitBtn').onclick=()=>resetMapView(true);
    $('mapZoomInBtn').onclick=()=>zoomMapTo(mapView.zoom+0.25);
    $('mapZoomOutBtn').onclick=()=>zoomMapTo(mapView.zoom-0.25);
    $('mapPanBtn').onclick=()=>{panMode=!panMode;applyMapTransform();};
    $('mapImage').addEventListener('error',()=>msg('No se pudo cargar la imagen del plano. Verifica que assets/mapas/sede-central-isometrica-v1.png esté publicado en GitHub.'));
    window.addEventListener('keydown',e=>{if(e.code==='Space'&&!isFormTarget(e.target)){spaceHeld=true;applyMapTransform();e.preventDefault();}});
    window.addEventListener('keyup',e=>{if(e.code==='Space'){spaceHeld=false;applyMapTransform();}});
    window.addEventListener('resize',()=>{clampMapPan();applyMapTransform();});
    window.addEventListener('beforeunload',e=>{if(editMode&&dirtyMoves.size){e.preventDefault();e.returnValue='';}});
  }

  function isFormTarget(target){
    return !!target?.closest?.('input,select,textarea,button,a,[contenteditable="true"]');
  }

  function resetMapView(showMessage=false){
    mapView={zoom:1,panX:0,panY:0};
    panMode=false;
    applyMapTransform();
    if(showMessage&&currentMap)msg('Plano ajustado a la ventana.',true);
  }

  function clampMapPan(){
    const stage=$('mapStage');
    if(!stage)return;
    const w=stage.clientWidth||0,h=stage.clientHeight||0,z=mapView.zoom;
    if(z<1){mapView.panX=(w-(w*z))/2;mapView.panY=(h-(h*z))/2;return;}
    if(z===1){mapView.panX=0;mapView.panY=0;return;}
    const minX=w-(w*z),minY=h-(h*z);
    mapView.panX=clamp(mapView.panX,minX,0);
    mapView.panY=clamp(mapView.panY,minY,0);
  }

  function applyMapTransform(){
    const canvas=$('mapCanvas'),stage=$('mapStage'),label=$('mapZoomLabel'),panBtn=$('mapPanBtn');
    if(canvas)canvas.style.transform=`translate(${mapView.panX}px, ${mapView.panY}px) scale(${mapView.zoom})`;
    if(label)label.textContent=`${Math.round(mapView.zoom*100)}%`;
    if($('mapZoomOutBtn'))$('mapZoomOutBtn').disabled=mapView.zoom<=0.5;
    if($('mapZoomInBtn'))$('mapZoomInBtn').disabled=mapView.zoom>=3;
    if($('mapFitBtn'))$('mapFitBtn').disabled=!currentMap;
    if(panBtn){panBtn.disabled=!currentMap;panBtn.classList.toggle('active',panMode);panBtn.textContent=panMode?'Mover plano: ON':'Mover plano';}
    const panningReady=!!currentMap&&(panMode||spaceHeld||(!editMode&&mapView.zoom>1));
    stage?.classList.toggle('pan-ready',panningReady);
    stage?.classList.toggle('pan-mode',panMode||spaceHeld);
  }

  function zoomMapTo(nextZoom,clientX=null,clientY=null){
    if(!currentMap)return;
    const stage=$('mapStage');if(!stage)return;
    const rect=stage.getBoundingClientRect();
    const oldZoom=mapView.zoom,newZoom=clamp(Math.round(nextZoom*100)/100,0.5,3);
    const px=(clientX??(rect.left+rect.width/2))-rect.left;
    const py=(clientY??(rect.top+rect.height/2))-rect.top;
    const contentX=(px-mapView.panX)/oldZoom;
    const contentY=(py-mapView.panY)/oldZoom;
    mapView.zoom=newZoom;
    mapView.panX=px-contentX*newZoom;
    mapView.panY=py-contentY*newZoom;
    clampMapPan();applyMapTransform();
  }

  function handleMapWheel(e){
    if(!currentMap||e.target.closest('.safety-map-nav'))return;
    e.preventDefault();
    const direction=e.deltaY<0?1:-1;
    zoomMapTo(mapView.zoom+(direction*0.15),e.clientX,e.clientY);
  }

  function canPanCanvas(){
    return !!currentMap&&(panMode||spaceHeld||(!editMode&&mapView.zoom>1));
  }

  function startCanvasPan(e){
    if(e.target.closest('.safety-marker')||e.target.closest('.safety-map-nav')||!canPanCanvas())return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();
    suppressMapClick=false;
    const startX=e.clientX,startY=e.clientY,originX=mapView.panX,originY=mapView.panY;
    const canvas=$('mapCanvas'),stage=$('mapStage');
    try{canvas.setPointerCapture?.(e.pointerId);}catch(_){}
    stage?.classList.add('panning');
    const onMove=ev=>{
      if(ev.pointerId!==e.pointerId)return;
      const dx=ev.clientX-startX,dy=ev.clientY-startY;
      if(Math.abs(dx)>3||Math.abs(dy)>3)suppressMapClick=true;
      mapView.panX=originX+dx;mapView.panY=originY+dy;clampMapPan();applyMapTransform();
    };
    const onUp=ev=>{
      if(ev.pointerId!==e.pointerId)return;
      canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onUp);
      try{canvas.releasePointerCapture?.(e.pointerId);}catch(_){}
      stage?.classList.remove('panning');
      if(suppressMapClick)setTimeout(()=>{suppressMapClick=false;},0);
    };
    canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onUp);
  }

  function confirmDiscard(){
    if(!editMode||!dirtyMoves.size)return true;
    return confirm('Hay cambios de ubicación sin guardar. ¿Deseas descartarlos?');
  }

  function isCentralProject(p){
    const text=`${p?.codigo||''} ${p?.nombre||''}`.toUpperCase();
    return text.includes('LIMA')||text.includes('SEDE CENTRAL')||text.includes('CENTRAL');
  }

  async function loadProject(){
    const projectId=$('mapProject').value;
    currentProject=projects.find(p=>p.id===projectId)||null;
    editMode=false;selectedUnplacedId='';selectedElementId='';dirtyMoves.clear();
    currentMap=null;maps=[];elements=[];extinguishers=[];inspectionDetails=[];botiquines=[];botiquinInspections=[];emergencyEquipment=[];
    resetMapView(false);
    $('mapPlan').innerHTML='<option value="">Seleccione...</option>';
    syncEditUi();
    if(!projectId){render();return;}
    msg('Cargando plano y equipos de emergencia...');
    const [m,e,x,d,b,bi,oe]=await Promise.all([
      sb.from('mapas_seguridad').select('*').eq('proyecto_id',projectId).eq('activo',true).order('principal',{ascending:false}).order('nombre'),
      sb.from('mapa_seguridad_elementos').select('*').eq('proyecto_id',projectId).eq('activo',true),
      sb.from('extintores').select('id,proyecto_id,codigo_extintor,ubicacion_nombre,tipo_extintor,agente_extintor,capacidad,marca_extintor,activo').eq('proyecto_id',projectId).order('codigo_extintor'),
      sb.from('inspeccion_extintor_detalles').select('extintor_id,resultado,inspeccion:inspecciones_extintores!inner(fecha_inspeccion,proyecto_id)').eq('inspeccion.proyecto_id',projectId),
      sb.from('botiquines').select('id,proyecto_id,tipo,codigo_botiquin,lugar_id,area_proyecto_id,ubicacion_nombre,responsable_botiquin,activo').eq('proyecto_id',projectId).eq('tipo','UBICACION').order('codigo_botiquin'),
      sb.from('inspecciones_botiquin').select('id,botiquin_id,fecha_inspeccion,estado,codigo_botiquin,ubicacion_nombre,responsable_botiquin').eq('proyecto_id',projectId).eq('tipo','UBICACION').order('fecha_inspeccion',{ascending:false}),
      sb.from('equipos_emergencia').select('*').eq('proyecto_id',projectId).order('tipo_equipo').order('codigo')
    ]);
    const firstError=m.error||e.error||x.error||d.error||b.error||bi.error||oe.error;
    if(firstError){
      const em=String(firstError.message||'').toLowerCase();
      if(em.includes('mapas_seguridad')) msg('Primero ejecuta ETAPA_49_2_1_MAPA_SEGURIDAD.sql en Supabase.');
      else if(em.includes('botiquines')||em.includes('botiquin_id')) msg('Primero ejecuta ETAPA_49_2_5_BOTIQUINES_MAPA.sql en Supabase y recarga.');
      else if(em.includes('equipos_emergencia')||em.includes('equipo_emergencia_id')) msg('Primero ejecuta ETAPA_49_2_6_OTROS_EQUIPOS_EMERGENCIA.sql en Supabase y recarga.');
      else msg('No se pudo cargar el mapa: '+(firstError.message||firstError));
      render();return;
    }
    maps=m.data||[];elements=e.data||[];extinguishers=x.data||[];inspectionDetails=d.data||[];botiquines=b.data||[];botiquinInspections=bi.data||[];emergencyEquipment=oe.data||[];
    if(!maps.length&&isCentralProject(currentProject)) maps=[{...LOCAL_SEDE_MAP,proyecto_id:projectId}];
    $('mapPlan').innerHTML='<option value="">Seleccione...</option>'+maps.map(v=>`<option value="${v.id}">${esc(v.nombre)}${v.principal?' · Principal':''}</option>`).join('');
    const principal=maps.find(v=>v.principal)||maps[0];
    if(principal){
      $('mapPlan').value=principal.id;selectMap();
      if(principal.localOnly) msg('Planta cargada desde GitHub. Para guardar ubicaciones debes ejecutar el SQL de la Etapa 49.2.2 y recargar.',false);
      else msg('Plano y equipos de emergencia cargados correctamente.',true);
    }else{render();msg('Este proyecto todavía no tiene un plano de seguridad asociado.');}
  }

  function selectMap(){
    currentMap=maps.find(v=>v.id===$('mapPlan').value)||null;
    editMode=false;selectedUnplacedId='';selectedElementId='';dirtyMoves.clear();
    resetMapView(false);
    syncEditUi();render();
  }

  function canPersistCurrentMap(){return !!(currentMap&&!currentMap.localOnly&&isUuid(currentMap.id));}

  function stateForExtinguisher(extId){
    const period=$('mapPeriod').value;
    const rows=inspectionDetails.filter(r=>r.extintor_id===extId&&String(r.inspeccion?.fecha_inspeccion||'').slice(0,7)===period)
      .sort((a,b)=>String(b.inspeccion?.fecha_inspeccion||'').localeCompare(String(a.inspeccion?.fecha_inspeccion||'')));
    if(!rows.length)return'PENDIENTE';
    return rows[0].resultado==='OBSERVADO'?'OBSERVADO':'CONFORME';
  }

  function stateForBotiquin(botiquinId){
    const period=$('mapPeriod').value;
    const rows=botiquinInspections.filter(r=>r.botiquin_id===botiquinId&&String(r.fecha_inspeccion||'').slice(0,7)===period)
      .sort((a,b)=>String(b.fecha_inspeccion||'').localeCompare(String(a.fecha_inspeccion||'')));
    if(!rows.length)return'PENDIENTE';
    return rows[0].estado==='CONFORME'?'CONFORME':'OBSERVADO';
  }

  function currentElements(){return currentMap?elements.filter(el=>el.mapa_id===currentMap.id&&el.activo!==false):[];}
  function placedExtIds(){return new Set(currentElements().filter(el=>el.tipo_elemento==='EXTINTOR'&&el.extintor_id).map(el=>el.extintor_id));}
  function placedBotIds(){return new Set(currentElements().filter(el=>el.tipo_elemento==='BOTIQUIN'&&el.botiquin_id).map(el=>el.botiquin_id));}
  function placedOtherIds(){return new Set(currentElements().filter(el=>el.equipo_emergencia_id).map(el=>el.equipo_emergencia_id));}
  function activeExtinguishers(){return extinguishers.filter(x=>x.activo!==false);}
  function activeBotiquines(){return botiquines.filter(x=>x.activo!==false&&x.tipo==='UBICACION');}
  function activeEmergencyEquipment(){return emergencyEquipment.filter(x=>x.activo!==false);}
  function unplacedExtinguishers(){const used=placedExtIds();return activeExtinguishers().filter(x=>!used.has(x.id));}
  function unplacedBotiquines(){const used=placedBotIds();return activeBotiquines().filter(x=>!used.has(x.id));}
  function unplacedEmergencyEquipment(){const used=placedOtherIds();return activeEmergencyEquipment().filter(x=>!used.has(x.id));}
  function unplacedForType(){if(editTargetType==='BOTIQUIN')return unplacedBotiquines();if(editTargetType==='OTRO')return unplacedEmergencyEquipment();return unplacedExtinguishers();}
  function stateForEmergencyEquipment(eq){if(!eq)return'OTRO';if(eq.estado_equipo==='OBSERVADO')return'OBSERVADO';if(eq.estado_equipo==='FUERA_SERVICIO')return'INACTIVO';return'CONFORME';}
  function equipmentTypeLabel(type){return ({CAMILLA:'Camilla',LAVAOJOS:'Lavaojos',DUCHA_EMERGENCIA:'Ducha de emergencia',ALARMA:'Alarma',LUZ_EMERGENCIA:'Luz de emergencia',PUNTO_REUNION:'Punto de reunión',ZONA_SEGURA:'Zona segura',OTRO:'Otro equipo'})[type]||type||'Otro equipo';}

  function render(){
    const img=$('mapImage'),empty=$('mapEmpty'),canvas=$('mapCanvas'),markers=$('mapMarkers'),side=$('mapSide'),stage=$('mapStage'),caption=$('mapPlanCaption');
    const version=$('mapVersionLabel');
    if(currentMap?.imagen_ruta){
      if(img.getAttribute('src')!==currentMap.imagen_ruta)img.src=currentMap.imagen_ruta;
      img.classList.remove('hidden');empty.classList.add('hidden');canvas?.classList.remove('hidden');
      const w=Number(currentMap.ancho_referencia)||1536,h=Number(currentMap.alto_referencia)||1024;
      stage.style.aspectRatio=`${w} / ${h}`;
      caption.textContent=`${currentMap.nombre}${currentMap.version?' · '+currentMap.version:''}`;
      caption.classList.remove('hidden');if(version)version.textContent=currentMap.version||'Plano base';
    }else{
      img.removeAttribute('src');img.classList.add('hidden');empty.classList.remove('hidden');canvas?.classList.add('hidden');stage.style.aspectRatio='3 / 2';caption.classList.add('hidden');if(version)version.textContent='Sin plano';
    }

    syncEditUi();applyMapTransform();markers.innerHTML='';
    if(!currentMap){updateKpis();side.innerHTML=sideEmpty();bindSideEmptyAction();return;}
    const showExt=$('layerExt').checked,showBot=$('layerBot').checked,showOther=$('layerOther').checked;
    const visible=currentElements().filter(el=>{
      if(el.tipo_elemento==='EXTINTOR'){
        const ext=extinguishers.find(x=>x.id===el.extintor_id);return showExt&&!!ext&&ext.activo!==false;
      }
      if(el.tipo_elemento==='BOTIQUIN'){
        const bot=botiquines.find(x=>x.id===el.botiquin_id);return showBot&&!!bot&&bot.activo!==false;
      }
      const eq=el.equipo_emergencia_id?emergencyEquipment.find(x=>x.id===el.equipo_emergencia_id):null;
      return showOther&&(!el.equipo_emergencia_id||!!eq&&eq.activo!==false);
    });
    visible.forEach(el=>renderMarker(el,markers));
    updateKpis();
    if(editMode)renderEditPanel();
    else if(selectedElementId){
      const el=currentElements().find(x=>x.id===selectedElementId);if(el){const entity=el.tipo_elemento==='EXTINTOR'?extinguishers.find(x=>x.id===el.extintor_id):el.tipo_elemento==='BOTIQUIN'?botiquines.find(x=>x.id===el.botiquin_id):emergencyEquipment.find(x=>x.id===el.equipo_emergencia_id);const state=el.tipo_elemento==='EXTINTOR'?stateForExtinguisher(el.extintor_id):el.tipo_elemento==='BOTIQUIN'?stateForBotiquin(el.botiquin_id):stateForEmergencyEquipment(entity);showElement(el,entity,state);}else{side.innerHTML=sideEmpty();bindSideEmptyAction();}
    }else{side.innerHTML=sideEmpty();bindSideEmptyAction();}
  }

  function renderMarker(el,markers){
    const ext=el.extintor_id?extinguishers.find(x=>x.id===el.extintor_id):null;
    const bot=el.botiquin_id?botiquines.find(x=>x.id===el.botiquin_id):null;
    const eq=el.equipo_emergencia_id?emergencyEquipment.find(x=>x.id===el.equipo_emergencia_id):null;
    const entity=ext||bot||eq;
    const state=el.tipo_elemento==='EXTINTOR'?stateForExtinguisher(el.extintor_id):el.tipo_elemento==='BOTIQUIN'?stateForBotiquin(el.botiquin_id):stateForEmergencyEquipment(eq);
    const b=document.createElement('button');
    b.type='button';b.className=`safety-marker ${state.toLowerCase()}${el.tipo_elemento==='BOTIQUIN'?' botiquin':''}${dirtyMoves.has(el.id)?' map-dirty':''}${selectedElementId===el.id?' selected':''}`;
    b.style.left=`${Number(el.pos_x)||50}%`;b.style.top=`${Number(el.pos_y)||50}%`;
    b.style.transform=`translate(-50%,-50%) scale(${Number(el.escala)||1}) rotate(${Number(el.rotacion)||0}deg)`;
    b.title=ext?.codigo_extintor||bot?.codigo_botiquin||eq?.codigo||el.codigo||el.nombre||el.tipo_elemento;
    b.innerHTML=`<span class="safety-marker-icon">${markerIcon(el.tipo_elemento)}</span><small>${esc(ext?.codigo_extintor||bot?.codigo_botiquin||eq?.codigo||el.codigo||'')}</small>`;
    b.onclick=e=>{e.preventDefault();e.stopPropagation();selectedElementId=el.id;if(editMode)renderEditPanel();else showElement(el,entity,state);};
    if(editMode)b.addEventListener('pointerdown',e=>startDrag(e,el,b));
    markers.appendChild(b);
  }

  function markerIcon(type){
    const icons={EXTINTOR:'🧯',BOTIQUIN:'✚',CAMILLA:'▰',LAVAOJOS:'◉',DUCHA_EMERGENCIA:'🚿',ALARMA:'🔔',LUZ_EMERGENCIA:'💡',PUNTO_REUNION:'Ⓢ',ZONA_SEGURA:'Ⓩ',OTRO:'◆'};
    return icons[type]||'◆';
  }

  function updateKpis(){
    const active=activeExtinguishers();
    let ok=0,obs=0,pending=0;
    active.forEach(ext=>{const st=stateForExtinguisher(ext.id);if(st==='CONFORME')ok++;else if(st==='OBSERVADO')obs++;else pending++;});
    $('mapKpiTotal').textContent=active.length;$('mapKpiOk').textContent=ok;$('mapKpiObs').textContent=obs;$('mapKpiPending').textContent=pending;
    const bots=activeBotiquines();let botObs=0;bots.forEach(b=>{if(stateForBotiquin(b.id)==='OBSERVADO')botObs++;});
    if($('mapKpiBotTotal'))$('mapKpiBotTotal').textContent=bots.length;if($('mapKpiBotObs'))$('mapKpiBotObs').textContent=botObs;
    if($('mapKpiOtherTotal'))$('mapKpiOtherTotal').textContent=activeEmergencyEquipment().length;
  }

  function sideEmpty(){
    if(currentMap){
      const placedExt=currentElements().filter(x=>x.tipo_elemento==='EXTINTOR').length,placedBot=currentElements().filter(x=>x.tipo_elemento==='BOTIQUIN').length,placedOther=currentElements().filter(x=>x.equipo_emergencia_id).length;
      const unplacedExt=unplacedExtinguishers().length,unplacedBot=unplacedBotiquines().length,unplacedOther=unplacedEmergencyEquipment().length;
      const disabled=canPersistCurrentMap()?'':' disabled';
      const hint=canPersistCurrentMap()?'Ubica los equipos del catálogo sobre su posición real en la planta.':'Ejecuta primero el SQL de la Etapa 49.2.2 para habilitar el guardado de ubicaciones.';
      return `<div class="safety-map-side-empty"><span class="map-type">MAPA LISTO</span><strong>${placedExt} extintores · ${placedBot} botiquines · ${placedOther} otros equipos ubicados</strong><span>${unplacedExt} extintor(es), ${unplacedBot} botiquín(es) y ${unplacedOther} otro(s) equipo(s) sin ubicar.</span><span>${hint}</span><button id="mapSideEditBtn" type="button" class="map-side-edit-btn"${disabled}>Ubicar equipos</button><button id="mapSideManageBtn" type="button" class="secondary map-side-manage-btn">Gestionar otros equipos</button></div>`;
    }
    return '<div class="safety-map-side-empty"><strong>Selecciona un equipo</strong><span>Aquí aparecerán sus datos, estado e historial.</span></div>';
  }

  function bindSideEmptyAction(){
    const btn=$('mapSideEditBtn');if(btn)btn.onclick=enterEditMode;
    const manage=$('mapSideManageBtn');if(manage)manage.onclick=openEquipmentManager;
  }

  function showElement(el,ext,state){
    selectedElementId=el.id;const side=$('mapSide');
    if(el.tipo_elemento==='EXTINTOR'&&ext){
      const last=inspectionDetails.filter(r=>r.extintor_id===ext.id).sort((a,b)=>String(b.inspeccion?.fecha_inspeccion||'').localeCompare(String(a.inspeccion?.fecha_inspeccion||'')))[0];
      side.innerHTML=`<div class="safety-side-head"><div><span class="map-type">EXTINTOR</span><h3>${esc(ext.codigo_extintor)}</h3></div><span class="e49-status ${state==='PENDIENTE'?'INACTIVO':state}">${esc(state)}</span></div><div class="safety-side-grid"><span>Ubicación</span><strong>${esc(ext.ubicacion_nombre||'—')}</strong><span>Tipo</span><strong>${esc(ext.tipo_extintor||'—')}</strong><span>Agente</span><strong>${esc(ext.agente_extintor||'—')}</strong><span>Capacidad</span><strong>${esc(ext.capacidad||'—')}</strong><span>Posición mapa</span><strong>X ${Number(el.pos_x).toFixed(2)}% · Y ${Number(el.pos_y).toFixed(2)}%</strong><span>Última inspección</span><strong>${esc(fmt(last?.inspeccion?.fecha_inspeccion))}</strong></div><div class="workflow-actions"><a class="button-link secondary-link" href="extintores.html">Ir a inspecciones</a></div>`;
    }else if(el.tipo_elemento==='BOTIQUIN'&&ext){
      const last=botiquinInspections.filter(r=>r.botiquin_id===ext.id).sort((a,b)=>String(b.fecha_inspeccion||'').localeCompare(String(a.fecha_inspeccion||'')))[0];
      side.innerHTML=`<div class="safety-side-head"><div><span class="map-type">BOTIQUÍN</span><h3>${esc(ext.codigo_botiquin||'BOTIQUÍN')}</h3></div><span class="e49-status ${state==='PENDIENTE'?'INACTIVO':state}">${esc(state)}</span></div><div class="safety-side-grid"><span>Ubicación</span><strong>${esc(ext.ubicacion_nombre||'—')}</strong><span>Responsable</span><strong>${esc(ext.responsable_botiquin||'—')}</strong><span>Posición mapa</span><strong>X ${Number(el.pos_x).toFixed(2)}% · Y ${Number(el.pos_y).toFixed(2)}%</strong><span>Última inspección</span><strong>${esc(fmt(last?.fecha_inspeccion))}</strong><span>Resultado</span><strong>${esc(last?.estado||'Sin inspección')}</strong></div><div class="workflow-actions"><a class="button-link secondary-link" href="botiquines.html">Ir a botiquines</a></div>`;
    }else if(ext){
      const stateLabel=ext.estado_equipo==='FUERA_SERVICIO'?'FUERA DE SERVICIO':ext.estado_equipo||'OPERATIVO';
      side.innerHTML=`<div class="safety-side-head"><div><span class="map-type">${esc(equipmentTypeLabel(ext.tipo_equipo))}</span><h3>${esc(ext.codigo||'EQUIPO')}</h3></div><span class="e49-status ${state==='INACTIVO'?'INACTIVO':state}">${esc(stateLabel)}</span></div><div class="safety-side-grid"><span>Nombre</span><strong>${esc(ext.nombre||'—')}</strong><span>Ubicación</span><strong>${esc(ext.ubicacion_nombre||'—')}</strong><span>Responsable</span><strong>${esc(ext.responsable||'—')}</strong><span>Última revisión</span><strong>${esc(fmt(ext.fecha_ultima_revision))}</strong><span>Próxima revisión</span><strong>${esc(fmt(ext.fecha_proxima_revision))}</strong><span>Posición mapa</span><strong>X ${Number(el.pos_x).toFixed(2)}% · Y ${Number(el.pos_y).toFixed(2)}%</strong></div>${ext.observacion?`<div class="map-equipment-observation"><strong>Observación</strong><p>${esc(ext.observacion)}</p></div>`:''}<div class="workflow-actions"><button id="mapEditGenericEquipment" type="button" class="secondary">Editar equipo</button></div>`;
      const editBtn=$('mapEditGenericEquipment');if(editBtn)editBtn.onclick=()=>openEquipmentManager(ext.id);
    }else side.innerHTML=`<div class="safety-side-head"><div><span class="map-type">${esc(el.tipo_elemento)}</span><h3>${esc(el.codigo||el.nombre||'Equipo')}</h3></div></div><p>${esc(el.descripcion||'Sin descripción registrada.')}</p>`;
  }

  function syncEditUi(){
    const editBtn=$('mapEditBtn'),saveBtn=$('mapSaveBtn'),cancelBtn=$('mapCancelEditBtn'),banner=$('mapEditBanner'),stage=$('mapStage');
    const persist=canPersistCurrentMap();
    if(editBtn){editBtn.disabled=!currentMap||!persist||editMode;editBtn.textContent=editMode?'Modo edición activo':'Editar ubicaciones';}
    saveBtn?.classList.toggle('hidden',!editMode);cancelBtn?.classList.toggle('hidden',!editMode);banner?.classList.toggle('hidden',!editMode);stage?.classList.toggle('editing',editMode);
    if(saveBtn){saveBtn.disabled=!dirtyMoves.size;saveBtn.textContent=dirtyMoves.size?`Guardar ubicaciones (${dirtyMoves.size})`:'Guardar ubicaciones';}
    applyMapTransform();
  }

  function enterEditMode(preferredType=null,preferredId=''){
    if(!currentMap)return;
    if(!canPersistCurrentMap()){msg('Este plano todavía no está registrado en Supabase. Ejecuta ETAPA_49_2_2_PLANTA_ISOMETRICA_SEDE_CENTRAL.sql y recarga la página.');return;}
    editMode=true;panMode=false;selectedElementId='';
    if(preferredType)editTargetType=preferredType;
    else editTargetType=unplacedExtinguishers().length?'EXTINTOR':unplacedBotiquines().length?'BOTIQUIN':unplacedEmergencyEquipment().length?'OTRO':'EXTINTOR';
    selectedUnplacedId=preferredId||unplacedForType()[0]?.id||'';syncEditUi();render();
    msg('Modo edición activo: selecciona Extintor, Botiquín u Otro equipo, ubícalo con clic y ajusta arrastrando.');
  }

  function renderEditPanel(){
    const side=$('mapSide'),unplaced=unplacedForType();
    const placedExt=currentElements().filter(x=>x.tipo_elemento==='EXTINTOR').length,placedBot=currentElements().filter(x=>x.tipo_elemento==='BOTIQUIN').length,placedOther=currentElements().filter(x=>x.equipo_emergencia_id).length;
    if(selectedUnplacedId&&!unplaced.some(x=>x.id===selectedUnplacedId))selectedUnplacedId=unplaced[0]?.id||'';
    const selectedEl=selectedElementId?currentElements().find(x=>x.id===selectedElementId):null;
    const selectedEntity=selectedEl?.tipo_elemento==='EXTINTOR'?extinguishers.find(x=>x.id===selectedEl.extintor_id):selectedEl?.tipo_elemento==='BOTIQUIN'?botiquines.find(x=>x.id===selectedEl.botiquin_id):emergencyEquipment.find(x=>x.id===selectedEl?.equipo_emergencia_id);
    const label=editTargetType==='BOTIQUIN'?'botiquín':editTargetType==='OTRO'?'equipo':'extintor';
    const typeLabel=editTargetType==='BOTIQUIN'?'Botiquín':editTargetType==='OTRO'?'Otro equipo':'Extintor';
    const opts=unplaced.map(x=>{const code=editTargetType==='BOTIQUIN'?x.codigo_botiquin:editTargetType==='OTRO'?x.codigo:x.codigo_extintor;const extra=editTargetType==='OTRO'?equipmentTypeLabel(x.tipo_equipo):x.ubicacion_nombre||'Sin ubicación';return `<option value="${x.id}" ${selectedUnplacedId===x.id?'selected':''}>${esc(code||'Sin código')} · ${esc(extra)}</option>`;}).join('');
    let selectedCode='';
    if(selectedEl&&selectedEntity)selectedCode=selectedEl.tipo_elemento==='BOTIQUIN'?selectedEntity.codigo_botiquin:selectedEl.tipo_elemento==='EXTINTOR'?selectedEntity.codigo_extintor:selectedEntity.codigo;
    side.innerHTML=`<div class="safety-edit-panel"><span class="map-type">MODO EDICIÓN</span><h3>Ubicar equipos</h3><div class="map-edit-type"><button type="button" data-type="EXTINTOR" class="${editTargetType==='EXTINTOR'?'active':''}">🧯 Extintores</button><button type="button" data-type="BOTIQUIN" class="${editTargetType==='BOTIQUIN'?'active':''}">✚ Botiquines</button><button type="button" data-type="OTRO" class="${editTargetType==='OTRO'?'active':''}">◆ Otros</button></div><div class="safety-edit-counts"><span><strong>${placedExt}</strong> extintores</span><span><strong>${placedBot}</strong> botiquines</span><span><strong>${placedOther}</strong> otros</span></div>${unplaced.length?`<div class="field"><label for="mapUnplacedSelect">${typeLabel} por ubicar</label><select id="mapUnplacedSelect"><option value="">Seleccione...</option>${opts}</select></div><div class="map-edit-help"><strong>1.</strong> Selecciona el ${label}.<br><strong>2.</strong> Haz clic en su posición real sobre la planta.<br><strong>3.</strong> Ajusta arrastrando el marcador.<br><strong>4.</strong> Usa <em>Mover plano</em> si necesitas desplazarte.</div>`:`<div class="map-edit-complete">Todos los ${editTargetType==='BOTIQUIN'?'botiquines':editTargetType==='OTRO'?'otros equipos':'extintores'} activos ya tienen una posición en este plano.${editTargetType==='OTRO'?'<br><button id="mapEditAddOther" type="button" class="secondary">Registrar otro equipo</button>':''}</div>`}${selectedEl&&selectedEntity?`<div class="map-edit-selected"><span>Seleccionado</span><strong>${esc(selectedCode||'Equipo')}</strong><small>${esc(selectedEntity.ubicacion_nombre||'')}</small><small>X ${Number(selectedEl.pos_x).toFixed(2)}% · Y ${Number(selectedEl.pos_y).toFixed(2)}%</small></div>`:''}<div class="map-edit-note">Los cambios se guardan únicamente al pulsar <strong>Guardar ubicaciones</strong>.</div></div>`;
    side.querySelectorAll('[data-type]').forEach(btn=>btn.onclick=()=>{editTargetType=btn.dataset.type;selectedUnplacedId=unplacedForType()[0]?.id||'';selectedElementId='';render();});
    const sel=$('mapUnplacedSelect');if(sel)sel.onchange=e=>{selectedUnplacedId=e.target.value;selectedElementId='';render();};
    const addOther=$('mapEditAddOther');if(addOther)addOther.onclick=()=>openEquipmentManager();
  }

  function pointFromPointer(e){
    const r=$('mapCanvas').getBoundingClientRect();
    return {x:clamp(((e.clientX-r.left)/r.width)*100,0.5,99.5),y:clamp(((e.clientY-r.top)/r.height)*100,0.5,99.5)};
  }

  function placeSelectedEquipment(e){
    if(!editMode||panMode||spaceHeld||suppressMapClick||!selectedUnplacedId||e.target.closest('.safety-marker')||!currentMap)return;
    const p=pointFromPointer(e);const isBot=editTargetType==='BOTIQUIN',isOther=editTargetType==='OTRO';
    const entity=isBot?botiquines.find(x=>x.id===selectedUnplacedId):isOther?emergencyEquipment.find(x=>x.id===selectedUnplacedId):extinguishers.find(x=>x.id===selectedUnplacedId);if(!entity)return;
    const code=isBot?entity.codigo_botiquin:isOther?entity.codigo:entity.codigo_extintor;
    const type=isBot?'BOTIQUIN':isOther?entity.tipo_equipo:'EXTINTOR';
    const tempId=`tmp_${isBot?'bot':isOther?'oth':'ext'}_${entity.id}_${Date.now()}`;
    const el={id:tempId,mapa_id:currentMap.id,proyecto_id:currentProject.id,tipo_elemento:type,extintor_id:isBot||isOther?null:entity.id,botiquin_id:isBot?entity.id:null,equipo_emergencia_id:isOther?entity.id:null,codigo:code,nombre:isOther?(entity.nombre||`${equipmentTypeLabel(entity.tipo_equipo)} ${code}`):`${isBot?'Botiquín':'Extintor'} ${code}`,descripcion:isOther?entity.observacion:null,icono:type,pos_x:p.x,pos_y:p.y,escala:1,rotacion:0,orden_capa:20,activo:true,_new:true};
    elements.push(el);selectedElementId=tempId;selectedUnplacedId='';dirtyMoves.set(tempId,{element:el,oldX:null,oldY:null,newX:p.x,newY:p.y,isNew:true});
    render();msg(`${code} colocado temporalmente. Puedes arrastrarlo para ajustar antes de guardar.`);
  }

  function startDrag(e,el,button){
    if(!editMode)return;e.preventDefault();e.stopPropagation();selectedElementId=el.id;
    let moved=false;button.classList.add('dragging');
    const onMove=ev=>{moved=true;const p=pointFromPointer(ev);setElementPosition(el,p.x,p.y);button.style.left=`${p.x}%`;button.style.top=`${p.y}%`;syncEditUi();};
    const onUp=()=>{button.classList.remove('dragging');document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);if(moved){render();msg('Posición ajustada. Pulsa Guardar ubicaciones para confirmar.');}else renderEditPanel();};
    document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',onUp,{once:true});
  }

  function setElementPosition(el,x,y){
    const existing=dirtyMoves.get(el.id);
    if(!existing)dirtyMoves.set(el.id,{element:el,oldX:Number(el.pos_x),oldY:Number(el.pos_y),newX:x,newY:y,isNew:!!el._new});
    else{existing.newX=x;existing.newY=y;existing.element=el;}
    el.pos_x=x;el.pos_y=y;
  }

  async function savePositions(){
    if(!editMode||!dirtyMoves.size)return;
    const btn=$('mapSaveBtn');btn.disabled=true;btn.textContent='Guardando...';msg('Guardando ubicaciones...');
    try{
      const changes=[...dirtyMoves.values()];
      for(const change of changes){
        let el=change.element;
        if(change.isNew||el._new){
          const payload={mapa_id:currentMap.id,proyecto_id:currentProject.id,tipo_elemento:el.tipo_elemento,extintor_id:el.extintor_id||null,botiquin_id:el.botiquin_id||null,equipo_emergencia_id:el.equipo_emergencia_id||null,codigo:el.codigo||null,nombre:el.nombre||null,descripcion:el.descripcion||null,icono:el.icono||el.tipo_elemento,pos_x:Number(el.pos_x),pos_y:Number(el.pos_y),escala:Number(el.escala)||1,rotacion:Number(el.rotacion)||0,orden_capa:Number(el.orden_capa)||20,activo:true,creado_por:session.user.id,actualizado_en:new Date().toISOString()};
          const {data:saved,error}=await sb.from('mapa_seguridad_elementos').insert(payload).select('*').single();if(error)throw error;
          const idx=elements.findIndex(x=>x.id===el.id);if(idx>=0)elements[idx]=saved;el=saved;
          const {error:me}=await sb.from('mapa_seguridad_movimientos').insert({elemento_id:saved.id,mapa_id:currentMap.id,pos_x_anterior:null,pos_y_anterior:null,pos_x_nueva:Number(saved.pos_x),pos_y_nueva:Number(saved.pos_y),motivo:`Ubicación inicial de ${el.tipo_elemento==='BOTIQUIN'?'botiquín':el.tipo_elemento==='EXTINTOR'?'extintor':'equipo de emergencia'} en el mapa`,movido_por:session.user.id});if(me)console.warn('No se pudo registrar trazabilidad de ubicación inicial',me);
        }else{
          const {data:saved,error}=await sb.from('mapa_seguridad_elementos').update({pos_x:Number(el.pos_x),pos_y:Number(el.pos_y),actualizado_en:new Date().toISOString()}).eq('id',el.id).select('*').single();if(error)throw error;
          const idx=elements.findIndex(x=>x.id===el.id);if(idx>=0)elements[idx]=saved;
          const {error:me}=await sb.from('mapa_seguridad_movimientos').insert({elemento_id:el.id,mapa_id:currentMap.id,pos_x_anterior:change.oldX,pos_y_anterior:change.oldY,pos_x_nueva:Number(el.pos_x),pos_y_nueva:Number(el.pos_y),motivo:`Reubicación manual de ${el.tipo_elemento==='BOTIQUIN'?'botiquín':el.tipo_elemento==='EXTINTOR'?'extintor':'equipo de emergencia'} en el mapa`,movido_por:session.user.id});if(me)console.warn('No se pudo registrar trazabilidad de reubicación',me);
        }
      }
      dirtyMoves.clear();selectedElementId='';selectedUnplacedId=unplacedForType()[0]?.id||'';syncEditUi();render();msg('Ubicaciones guardadas correctamente en Supabase.',true);
    }catch(err){console.error(err);msg('No se pudieron guardar las ubicaciones: '+(err.message||err));syncEditUi();}
    finally{btn.disabled=!dirtyMoves.size;btn.textContent=dirtyMoves.size?`Guardar ubicaciones (${dirtyMoves.size})`:'Guardar ubicaciones';}
  }

  function equipmentMsg(text='',ok=false){
    const el=$('equipmentMessage');if(!el)return;el.textContent=text;el.className=`message ${text?'visible':''} ${ok?'success':''}`;
  }

  function openEquipmentManager(editId=''){
    if(!currentProject){msg('Selecciona primero un proyecto / sede.');return;}
    $('emergencyEquipmentModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    equipmentMsg('');
    resetEquipmentForm();
    renderEquipmentList();
    if(editId){const eq=emergencyEquipment.find(x=>x.id===editId);if(eq)fillEquipmentForm(eq);}
  }

  function closeEquipmentManager(){
    $('emergencyEquipmentModal').classList.add('hidden');
    document.body.classList.remove('modal-open');
    equipmentMsg('');
  }

  function resetEquipmentForm(){
    $('equipmentId').value='';
    $('equipmentType').value='CAMILLA';
    $('equipmentCode').value='';
    $('equipmentName').value='';
    $('equipmentLocation').value='';
    $('equipmentResponsible').value='';
    $('equipmentState').value='OPERATIVO';
    $('equipmentLastReview').value='';
    $('equipmentNextReview').value='';
    $('equipmentObservation').value='';
    $('equipmentSaveBtn').textContent='Guardar equipo';
    equipmentMsg('');
  }

  function fillEquipmentForm(eq){
    $('equipmentId').value=eq.id||'';
    $('equipmentType').value=eq.tipo_equipo||'OTRO';
    $('equipmentCode').value=eq.codigo||'';
    $('equipmentName').value=eq.nombre||'';
    $('equipmentLocation').value=eq.ubicacion_nombre||'';
    $('equipmentResponsible').value=eq.responsable||'';
    $('equipmentState').value=eq.estado_equipo||'OPERATIVO';
    $('equipmentLastReview').value=String(eq.fecha_ultima_revision||'').slice(0,10);
    $('equipmentNextReview').value=String(eq.fecha_proxima_revision||'').slice(0,10);
    $('equipmentObservation').value=eq.observacion||'';
    $('equipmentSaveBtn').textContent='Actualizar equipo';
    $('equipmentCode').focus();
  }

  function renderEquipmentList(){
    const host=$('equipmentList');if(!host)return;
    const rows=[...emergencyEquipment].sort((a,b)=>`${a.tipo_equipo} ${a.codigo}`.localeCompare(`${b.tipo_equipo} ${b.codigo}`,'es'));
    $('equipmentListCount').textContent=`${rows.filter(x=>x.activo!==false).length} activo(s) · ${rows.length} total`;
    if(!rows.length){host.innerHTML='<div class="equipment-list-empty">Todavía no hay otros equipos registrados para este proyecto.</div>';return;}
    host.innerHTML=rows.map(eq=>{
      const placed=currentElements().some(el=>el.equipo_emergencia_id===eq.id&&el.activo!==false);
      const state=eq.estado_equipo==='FUERA_SERVICIO'?'Fuera de servicio':eq.estado_equipo==='OBSERVADO'?'Observado':'Operativo';
      return `<article class="equipment-list-item ${eq.activo===false?'inactive':''}"><div class="equipment-list-icon">${markerIcon(eq.tipo_equipo)}</div><div class="equipment-list-main"><div class="equipment-list-title"><strong>${esc(eq.codigo)}</strong><span>${esc(equipmentTypeLabel(eq.tipo_equipo))}</span></div><small>${esc(eq.nombre||eq.ubicacion_nombre||'Sin descripción')}</small><div class="equipment-list-meta"><span class="equipment-state ${String(eq.estado_equipo||'OPERATIVO').toLowerCase()}">${esc(state)}</span><span>${placed?'Ubicado en plano':'Sin ubicar'}</span>${eq.activo===false?'<span>Inactivo</span>':''}</div></div><div class="equipment-list-actions"><button type="button" class="secondary" data-eq-edit="${eq.id}">Editar</button><button type="button" class="secondary" data-eq-toggle="${eq.id}">${eq.activo===false?'Reactivar':'Desactivar'}</button>${eq.activo!==false&&!placed?`<button type="button" data-eq-place="${eq.id}">Ubicar</button>`:''}</div></article>`;
    }).join('');
    host.querySelectorAll('[data-eq-edit]').forEach(b=>b.onclick=()=>{const eq=emergencyEquipment.find(x=>x.id===b.dataset.eqEdit);if(eq)fillEquipmentForm(eq);});
    host.querySelectorAll('[data-eq-toggle]').forEach(b=>b.onclick=()=>toggleEmergencyEquipment(b.dataset.eqToggle));
    host.querySelectorAll('[data-eq-place]').forEach(b=>b.onclick=()=>{const id=b.dataset.eqPlace;closeEquipmentManager();enterEditMode('OTRO',id);});
  }

  async function saveEquipment(e,placeAfter=false){
    e?.preventDefault?.();
    if(!currentProject){equipmentMsg('Selecciona primero un proyecto / sede.');return;}
    const id=$('equipmentId').value.trim();
    const code=$('equipmentCode').value.trim().toUpperCase();
    if(!code){equipmentMsg('Ingresa el código del equipo.');$('equipmentCode').focus();return;}
    const existingRecord=id?emergencyEquipment.find(x=>x.id===id):null;
    const payload={
      proyecto_id:currentProject.id,
      tipo_equipo:$('equipmentType').value,
      codigo:code,
      nombre:$('equipmentName').value.trim()||null,
      ubicacion_nombre:$('equipmentLocation').value.trim()||null,
      responsable:$('equipmentResponsible').value.trim()||null,
      estado_equipo:$('equipmentState').value,
      fecha_ultima_revision:$('equipmentLastReview').value||null,
      fecha_proxima_revision:$('equipmentNextReview').value||null,
      observacion:$('equipmentObservation').value.trim()||null,
      activo:existingRecord?existingRecord.activo!==false:true,
      actualizado_en:new Date().toISOString()
    };
    const saveBtn=placeAfter?$('equipmentSavePlaceBtn'):$('equipmentSaveBtn');
    const oldText=saveBtn.textContent;saveBtn.disabled=true;saveBtn.textContent='Guardando...';equipmentMsg('Guardando equipo...');
    try{
      let saved,error;
      if(id){({data:saved,error}=await sb.from('equipos_emergencia').update(payload).eq('id',id).select('*').single());}
      else{payload.creado_por=session.user.id;({data:saved,error}=await sb.from('equipos_emergencia').insert(payload).select('*').single());}
      if(error)throw error;
      const idx=emergencyEquipment.findIndex(x=>x.id===saved.id);if(idx>=0)emergencyEquipment[idx]=saved;else emergencyEquipment.push(saved);
      const linked=elements.filter(el=>el.equipo_emergencia_id===saved.id);
      if(linked.length){
        const {error:mapErr}=await sb.from('mapa_seguridad_elementos').update({tipo_elemento:saved.tipo_equipo,codigo:saved.codigo,nombre:saved.nombre||`${equipmentTypeLabel(saved.tipo_equipo)} ${saved.codigo}`,descripcion:saved.observacion||null,icono:saved.tipo_equipo,actualizado_en:new Date().toISOString()}).eq('equipo_emergencia_id',saved.id);
        if(mapErr)console.warn('No se pudo sincronizar el marcador del equipo',mapErr);
        linked.forEach(el=>{el.tipo_elemento=saved.tipo_equipo;el.codigo=saved.codigo;el.nombre=saved.nombre||`${equipmentTypeLabel(saved.tipo_equipo)} ${saved.codigo}`;el.descripcion=saved.observacion||null;el.icono=saved.tipo_equipo;});
      }
      resetEquipmentForm();renderEquipmentList();render();equipmentMsg('Equipo guardado correctamente.',true);
      if(placeAfter){
        closeEquipmentManager();
        const existing=currentElements().find(el=>el.equipo_emergencia_id===saved.id&&el.activo!==false);
        if(existing){editMode=true;editTargetType='OTRO';selectedElementId=existing.id;selectedUnplacedId='';syncEditUi();render();msg(`${saved.codigo} ya está ubicado. Puedes arrastrarlo para cambiar su posición.`);}
        else enterEditMode('OTRO',saved.id);
      }
    }catch(err){
      console.error(err);
      const text=String(err?.message||err||'');
      equipmentMsg(text.toLowerCase().includes('uq_equipo_emergencia_codigo_activo')||text.toLowerCase().includes('duplicate')?'Ya existe un equipo activo con ese código en este proyecto.':'No se pudo guardar el equipo: '+text);
    }finally{saveBtn.disabled=false;saveBtn.textContent=oldText;}
  }

  async function toggleEmergencyEquipment(id){
    const eq=emergencyEquipment.find(x=>x.id===id);if(!eq)return;
    const next=eq.activo===false;
    const verb=next?'reactivar':'desactivar';
    if(!confirm(`¿Deseas ${verb} ${eq.codigo}?`))return;
    equipmentMsg(`${next?'Reactivando':'Desactivando'} equipo...`);
    try{
      const {data:saved,error}=await sb.from('equipos_emergencia').update({activo:next,actualizado_en:new Date().toISOString()}).eq('id',id).select('*').single();if(error)throw error;
      const idx=emergencyEquipment.findIndex(x=>x.id===id);if(idx>=0)emergencyEquipment[idx]=saved;
      if(!next){
        const {error:me}=await sb.from('mapa_seguridad_elementos').update({activo:false,actualizado_en:new Date().toISOString()}).eq('equipo_emergencia_id',id);if(me)console.warn(me);
        elements.forEach(el=>{if(el.equipo_emergencia_id===id)el.activo=false;});
      }
      renderEquipmentList();render();equipmentMsg(`Equipo ${next?'reactivado':'desactivado'} correctamente.`,true);
    }catch(err){console.error(err);equipmentMsg('No se pudo actualizar el equipo: '+(err.message||err));}
  }

  function cancelEditMode(){
    if(dirtyMoves.size&&!confirm('¿Descartar los cambios de ubicación que todavía no has guardado?'))return;
    for(const [id,change] of dirtyMoves){
      if(change.isNew||change.element?._new){elements=elements.filter(x=>x.id!==id);continue;}
      const el=elements.find(x=>x.id===id);if(el){el.pos_x=change.oldX;el.pos_y=change.oldY;}
    }
    dirtyMoves.clear();editMode=false;panMode=false;selectedUnplacedId='';selectedElementId='';syncEditUi();render();msg('Modo edición cerrado.');
  }

  boot().catch(err=>{console.error(err);msg('No se pudo iniciar el mapa: '+(err.message||err));});
})();
