// ============================================================
// ETAPA 49.2.3 - POSICIONAMIENTO INTERACTIVO DE EXTINTORES
// - Selecciona extintores activos aun no ubicados y colocalos con clic.
// - Arrastra marcadores existentes para cambiar su posicion.
// - Guarda coordenadas relativas X/Y (0-100) en Supabase.
// - Registra cada alta/movimiento en mapa_seguridad_movimientos.
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

  let session=null,projects=[],maps=[],elements=[],extinguishers=[],inspectionDetails=[],currentMap=null,currentProject=null;
  let editMode=false,selectedUnplacedId='',selectedElementId='',dirtyMoves=new Map();

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
    $('layerOther').onchange=render;
    $('mapEditBtn').onclick=enterEditMode;
    $('mapSaveBtn').onclick=savePositions;
    $('mapCancelEditBtn').onclick=cancelEditMode;
    $('mapStage').addEventListener('click',placeSelectedExtinguisher);
    $('mapImage').addEventListener('error',()=>msg('No se pudo cargar la imagen del plano. Verifica que assets/mapas/sede-central-isometrica-v1.png esté publicado en GitHub.'));
    window.addEventListener('beforeunload',e=>{if(editMode&&dirtyMoves.size){e.preventDefault();e.returnValue='';}});
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
    currentMap=null;maps=[];elements=[];extinguishers=[];inspectionDetails=[];
    $('mapPlan').innerHTML='<option value="">Seleccione...</option>';
    syncEditUi();
    if(!projectId){render();return;}
    msg('Cargando plano y extintores...');
    const [m,e,x,d]=await Promise.all([
      sb.from('mapas_seguridad').select('*').eq('proyecto_id',projectId).eq('activo',true).order('principal',{ascending:false}).order('nombre'),
      sb.from('mapa_seguridad_elementos').select('*').eq('proyecto_id',projectId).eq('activo',true),
      sb.from('extintores').select('id,proyecto_id,codigo_extintor,ubicacion_nombre,tipo_extintor,agente_extintor,capacidad,marca_extintor,activo').eq('proyecto_id',projectId).order('codigo_extintor'),
      sb.from('inspeccion_extintor_detalles').select('extintor_id,resultado,inspeccion:inspecciones_extintores!inner(fecha_inspeccion,proyecto_id)').eq('inspeccion.proyecto_id',projectId)
    ]);
    const firstError=m.error||e.error||x.error||d.error;
    if(firstError){
      if(String(firstError.message||'').toLowerCase().includes('mapas_seguridad')) msg('Primero ejecuta ETAPA_49_2_1_MAPA_SEGURIDAD.sql en Supabase.');
      else msg('No se pudo cargar el mapa: '+(firstError.message||firstError));
      render();return;
    }
    maps=m.data||[];elements=e.data||[];extinguishers=x.data||[];inspectionDetails=d.data||[];
    if(!maps.length&&isCentralProject(currentProject)) maps=[{...LOCAL_SEDE_MAP,proyecto_id:projectId}];
    $('mapPlan').innerHTML='<option value="">Seleccione...</option>'+maps.map(v=>`<option value="${v.id}">${esc(v.nombre)}${v.principal?' · Principal':''}</option>`).join('');
    const principal=maps.find(v=>v.principal)||maps[0];
    if(principal){
      $('mapPlan').value=principal.id;selectMap();
      if(principal.localOnly) msg('Planta cargada desde GitHub. Para guardar ubicaciones debes ejecutar el SQL de la Etapa 49.2.2 y recargar.',false);
      else msg('Plano y catálogo de extintores cargados correctamente.',true);
    }else{render();msg('Este proyecto todavía no tiene un plano de seguridad asociado.');}
  }

  function selectMap(){
    currentMap=maps.find(v=>v.id===$('mapPlan').value)||null;
    editMode=false;selectedUnplacedId='';selectedElementId='';dirtyMoves.clear();
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

  function currentElements(){return currentMap?elements.filter(el=>el.mapa_id===currentMap.id&&el.activo!==false):[];}
  function placedExtIds(){return new Set(currentElements().filter(el=>el.tipo_elemento==='EXTINTOR'&&el.extintor_id).map(el=>el.extintor_id));}
  function activeExtinguishers(){return extinguishers.filter(x=>x.activo!==false);}
  function unplacedExtinguishers(){const used=placedExtIds();return activeExtinguishers().filter(x=>!used.has(x.id));}

  function render(){
    const img=$('mapImage'),empty=$('mapEmpty'),markers=$('mapMarkers'),side=$('mapSide'),stage=$('mapStage'),caption=$('mapPlanCaption');
    const version=$('mapVersionLabel');
    if(currentMap?.imagen_ruta){
      if(img.getAttribute('src')!==currentMap.imagen_ruta)img.src=currentMap.imagen_ruta;
      img.classList.remove('hidden');empty.classList.add('hidden');
      const w=Number(currentMap.ancho_referencia)||1536,h=Number(currentMap.alto_referencia)||1024;
      stage.style.aspectRatio=`${w} / ${h}`;
      caption.textContent=`${currentMap.nombre}${currentMap.version?' · '+currentMap.version:''}`;
      caption.classList.remove('hidden');if(version)version.textContent=currentMap.version||'Plano base';
    }else{
      img.removeAttribute('src');img.classList.add('hidden');empty.classList.remove('hidden');stage.style.aspectRatio='3 / 2';caption.classList.add('hidden');if(version)version.textContent='Sin plano';
    }

    syncEditUi();markers.innerHTML='';
    if(!currentMap){updateKpis([]);side.innerHTML=sideEmpty();return;}
    const showExt=$('layerExt').checked,showOther=$('layerOther').checked;
    const visible=currentElements().filter(el=>{
      if(el.tipo_elemento==='EXTINTOR'){
        const ext=extinguishers.find(x=>x.id===el.extintor_id);
        return showExt&&!!ext&&ext.activo!==false;
      }
      return showOther;
    });
    visible.forEach(el=>renderMarker(el,markers));
    updateKpis(visible);
    if(editMode)renderEditPanel();
    else if(selectedElementId){
      const el=currentElements().find(x=>x.id===selectedElementId);if(el)showElement(el,el.extintor_id?extinguishers.find(x=>x.id===el.extintor_id):null,el.tipo_elemento==='EXTINTOR'?stateForExtinguisher(el.extintor_id):'OTRO');else side.innerHTML=sideEmpty();
    }else side.innerHTML=sideEmpty();
  }

  function renderMarker(el,markers){
    const ext=el.extintor_id?extinguishers.find(x=>x.id===el.extintor_id):null;
    const state=el.tipo_elemento==='EXTINTOR'?stateForExtinguisher(el.extintor_id):'OTRO';
    const b=document.createElement('button');
    b.type='button';b.className=`safety-marker ${state.toLowerCase()}${dirtyMoves.has(el.id)?' map-dirty':''}${selectedElementId===el.id?' selected':''}`;
    b.style.left=`${Number(el.pos_x)||50}%`;b.style.top=`${Number(el.pos_y)||50}%`;
    b.style.transform=`translate(-50%,-50%) scale(${Number(el.escala)||1}) rotate(${Number(el.rotacion)||0}deg)`;
    b.title=ext?.codigo_extintor||el.codigo||el.nombre||el.tipo_elemento;
    b.innerHTML=`<span class="safety-marker-icon">${markerIcon(el.tipo_elemento)}</span><small>${esc(ext?.codigo_extintor||el.codigo||'')}</small>`;
    b.onclick=e=>{e.preventDefault();e.stopPropagation();selectedElementId=el.id;if(editMode)renderEditPanel();else showElement(el,ext,state);};
    if(editMode)b.addEventListener('pointerdown',e=>startDrag(e,el,b));
    markers.appendChild(b);
  }

  function markerIcon(type){
    const icons={EXTINTOR:'🧯',BOTIQUIN:'✚',CAMILLA:'▰',LAVAOJOS:'◉',DUCHA_EMERGENCIA:'🚿',ALARMA:'🔔',LUZ_EMERGENCIA:'💡',PUNTO_REUNION:'Ⓢ',ZONA_SEGURA:'Ⓩ',OTRO:'◆'};
    return icons[type]||'◆';
  }

  function updateKpis(rows){
    let ok=0,obs=0,pending=0;
    rows.forEach(el=>{if(el.tipo_elemento!=='EXTINTOR')return;const s=stateForExtinguisher(el.extintor_id);if(s==='CONFORME')ok++;else if(s==='OBSERVADO')obs++;else pending++;});
    $('mapKpiTotal').textContent=rows.length;$('mapKpiOk').textContent=ok;$('mapKpiObs').textContent=obs;$('mapKpiPending').textContent=pending;
  }

  function sideEmpty(){
    if(currentMap)return `<div class="safety-map-side-empty"><strong>Mapa listo</strong><span>${currentElements().filter(x=>x.tipo_elemento==='EXTINTOR').length} extintor(es) ubicados. Pulsa “Editar ubicaciones” para agregar o mover marcadores.</span></div>`;
    return '<div class="safety-map-side-empty"><strong>Selecciona un equipo</strong><span>Aquí aparecerán sus datos, estado e historial.</span></div>';
  }

  function showElement(el,ext,state){
    selectedElementId=el.id;const side=$('mapSide');
    if(el.tipo_elemento==='EXTINTOR'&&ext){
      const last=inspectionDetails.filter(r=>r.extintor_id===ext.id).sort((a,b)=>String(b.inspeccion?.fecha_inspeccion||'').localeCompare(String(a.inspeccion?.fecha_inspeccion||'')))[0];
      side.innerHTML=`<div class="safety-side-head"><div><span class="map-type">EXTINTOR</span><h3>${esc(ext.codigo_extintor)}</h3></div><span class="e49-status ${state==='PENDIENTE'?'INACTIVO':state}">${esc(state)}</span></div><div class="safety-side-grid"><span>Ubicación</span><strong>${esc(ext.ubicacion_nombre||'—')}</strong><span>Tipo</span><strong>${esc(ext.tipo_extintor||'—')}</strong><span>Agente</span><strong>${esc(ext.agente_extintor||'—')}</strong><span>Capacidad</span><strong>${esc(ext.capacidad||'—')}</strong><span>Posición mapa</span><strong>X ${Number(el.pos_x).toFixed(2)}% · Y ${Number(el.pos_y).toFixed(2)}%</strong><span>Última inspección</span><strong>${esc(fmt(last?.inspeccion?.fecha_inspeccion))}</strong></div><div class="workflow-actions"><a class="button-link secondary-link" href="extintores.html">Ir a inspecciones</a></div>`;
    }else side.innerHTML=`<div class="safety-side-head"><div><span class="map-type">${esc(el.tipo_elemento)}</span><h3>${esc(el.codigo||el.nombre||'Equipo')}</h3></div></div><p>${esc(el.descripcion||'Sin descripción registrada.')}</p>`;
  }

  function syncEditUi(){
    const editBtn=$('mapEditBtn'),saveBtn=$('mapSaveBtn'),cancelBtn=$('mapCancelEditBtn'),banner=$('mapEditBanner'),stage=$('mapStage');
    const persist=canPersistCurrentMap();
    if(editBtn){editBtn.disabled=!currentMap||!persist||editMode;editBtn.textContent=editMode?'Modo edición activo':'Editar ubicaciones';}
    saveBtn?.classList.toggle('hidden',!editMode);cancelBtn?.classList.toggle('hidden',!editMode);banner?.classList.toggle('hidden',!editMode);stage?.classList.toggle('editing',editMode);
    if(saveBtn){saveBtn.disabled=!dirtyMoves.size;saveBtn.textContent=dirtyMoves.size?`Guardar ubicaciones (${dirtyMoves.size})`:'Guardar ubicaciones';}
  }

  function enterEditMode(){
    if(!currentMap)return;
    if(!canPersistCurrentMap()){msg('Este plano todavía no está registrado en Supabase. Ejecuta ETAPA_49_2_2_PLANTA_ISOMETRICA_SEDE_CENTRAL.sql y recarga la página.');return;}
    editMode=true;selectedElementId='';selectedUnplacedId=unplacedExtinguishers()[0]?.id||'';syncEditUi();render();
    msg('Modo edición activo: selecciona un extintor sin ubicar y haz clic en el plano, o arrastra un marcador existente.');
  }

  function renderEditPanel(){
    const side=$('mapSide'),unplaced=unplacedExtinguishers(),placed=currentElements().filter(x=>x.tipo_elemento==='EXTINTOR').length;
    if(selectedUnplacedId&&!unplaced.some(x=>x.id===selectedUnplacedId))selectedUnplacedId=unplaced[0]?.id||'';
    const selectedEl=selectedElementId?currentElements().find(x=>x.id===selectedElementId):null;
    const selectedExt=selectedEl?.extintor_id?extinguishers.find(x=>x.id===selectedEl.extintor_id):null;
    side.innerHTML=`<div class="safety-edit-panel"><span class="map-type">MODO EDICIÓN</span><h3>Ubicar extintores</h3><div class="safety-edit-counts"><span><strong>${placed}</strong> ubicados</span><span><strong>${unplaced.length}</strong> sin ubicar</span></div>${unplaced.length?`<div class="field"><label for="mapUnplacedSelect">Extintor por ubicar</label><select id="mapUnplacedSelect"><option value="">Seleccione...</option>${unplaced.map(x=>`<option value="${x.id}" ${selectedUnplacedId===x.id?'selected':''}>${esc(x.codigo_extintor)} · ${esc(x.ubicacion_nombre||'Sin ubicación')}</option>`).join('')}</select></div><div class="map-edit-help"><strong>1.</strong> Selecciona el extintor.<br><strong>2.</strong> Haz clic en su posición real sobre la planta.<br><strong>3.</strong> Ajusta arrastrando el marcador.</div>`:'<div class="map-edit-complete">Todos los extintores activos ya tienen una posición en este plano.</div>'}${selectedEl&&selectedExt?`<div class="map-edit-selected"><span>Seleccionado</span><strong>${esc(selectedExt.codigo_extintor)}</strong><small>${esc(selectedExt.ubicacion_nombre||'')}</small><small>X ${Number(selectedEl.pos_x).toFixed(2)}% · Y ${Number(selectedEl.pos_y).toFixed(2)}%</small></div>`:''}<div class="map-edit-note">Los cambios se guardan únicamente al pulsar <strong>Guardar ubicaciones</strong>.</div></div>`;
    const sel=$('mapUnplacedSelect');if(sel)sel.onchange=e=>{selectedUnplacedId=e.target.value;selectedElementId='';render();};
  }

  function pointFromPointer(e){
    const r=$('mapStage').getBoundingClientRect();
    return {x:clamp(((e.clientX-r.left)/r.width)*100,0.5,99.5),y:clamp(((e.clientY-r.top)/r.height)*100,0.5,99.5)};
  }

  function placeSelectedExtinguisher(e){
    if(!editMode||!selectedUnplacedId||e.target.closest('.safety-marker')||!currentMap)return;
    const ext=extinguishers.find(x=>x.id===selectedUnplacedId);if(!ext)return;
    const p=pointFromPointer(e);const tempId=`tmp_${ext.id}_${Date.now()}`;
    const el={id:tempId,mapa_id:currentMap.id,proyecto_id:currentProject.id,tipo_elemento:'EXTINTOR',extintor_id:ext.id,codigo:ext.codigo_extintor,nombre:`Extintor ${ext.codigo_extintor}`,descripcion:null,icono:'EXTINTOR',pos_x:p.x,pos_y:p.y,escala:1,rotacion:0,orden_capa:20,activo:true,_new:true};
    elements.push(el);selectedElementId=tempId;selectedUnplacedId='';
    dirtyMoves.set(tempId,{element:el,oldX:null,oldY:null,newX:p.x,newY:p.y,isNew:true});
    render();msg(`${ext.codigo_extintor} colocado temporalmente. Puedes arrastrarlo para ajustar antes de guardar.`);
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
          const payload={mapa_id:currentMap.id,proyecto_id:currentProject.id,tipo_elemento:'EXTINTOR',extintor_id:el.extintor_id,codigo:el.codigo||null,nombre:el.nombre||null,descripcion:el.descripcion||null,icono:el.icono||'EXTINTOR',pos_x:Number(el.pos_x),pos_y:Number(el.pos_y),escala:Number(el.escala)||1,rotacion:Number(el.rotacion)||0,orden_capa:Number(el.orden_capa)||20,activo:true,creado_por:session.user.id,actualizado_en:new Date().toISOString()};
          const {data:saved,error}=await sb.from('mapa_seguridad_elementos').insert(payload).select('*').single();if(error)throw error;
          const idx=elements.findIndex(x=>x.id===el.id);if(idx>=0)elements[idx]=saved;el=saved;
          const {error:me}=await sb.from('mapa_seguridad_movimientos').insert({elemento_id:saved.id,mapa_id:currentMap.id,pos_x_anterior:null,pos_y_anterior:null,pos_x_nueva:Number(saved.pos_x),pos_y_nueva:Number(saved.pos_y),motivo:'Ubicación inicial del extintor en el mapa',movido_por:session.user.id});if(me)console.warn('No se pudo registrar trazabilidad de ubicación inicial',me);
        }else{
          const {data:saved,error}=await sb.from('mapa_seguridad_elementos').update({pos_x:Number(el.pos_x),pos_y:Number(el.pos_y),actualizado_en:new Date().toISOString()}).eq('id',el.id).select('*').single();if(error)throw error;
          const idx=elements.findIndex(x=>x.id===el.id);if(idx>=0)elements[idx]=saved;
          const {error:me}=await sb.from('mapa_seguridad_movimientos').insert({elemento_id:el.id,mapa_id:currentMap.id,pos_x_anterior:change.oldX,pos_y_anterior:change.oldY,pos_x_nueva:Number(el.pos_x),pos_y_nueva:Number(el.pos_y),motivo:'Reubicación manual del extintor en el mapa',movido_por:session.user.id});if(me)console.warn('No se pudo registrar trazabilidad de reubicación',me);
        }
      }
      dirtyMoves.clear();selectedElementId='';selectedUnplacedId=unplacedExtinguishers()[0]?.id||'';syncEditUi();render();msg('Ubicaciones guardadas correctamente en Supabase.',true);
    }catch(err){console.error(err);msg('No se pudieron guardar las ubicaciones: '+(err.message||err));syncEditUi();}
    finally{btn.disabled=!dirtyMoves.size;btn.textContent=dirtyMoves.size?`Guardar ubicaciones (${dirtyMoves.size})`:'Guardar ubicaciones';}
  }

  function cancelEditMode(){
    if(dirtyMoves.size&&!confirm('¿Descartar los cambios de ubicación que todavía no has guardado?'))return;
    for(const [id,change] of dirtyMoves){
      if(change.isNew||change.element?._new){elements=elements.filter(x=>x.id!==id);continue;}
      const el=elements.find(x=>x.id===id);if(el){el.pos_x=change.oldX;el.pos_y=change.oldY;}
    }
    dirtyMoves.clear();editMode=false;selectedUnplacedId='';selectedElementId='';syncEditUi();render();msg('Modo edición cerrado.');
  }

  boot().catch(err=>{console.error(err);msg('No se pudo iniciar el mapa: '+(err.message||err));});
})();
