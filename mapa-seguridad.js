// ============================================================
// ETAPA 49.2.1 - MAPA INTERACTIVO DE SEGURIDAD
// Infraestructura inicial para planta isometrica + capas SSOMAC
// ============================================================
(async function(){
  'use strict';
  if(typeof sb==='undefined') return;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const msg=(text='',ok=false)=>{const el=$('mapMessage');if(!el)return;el.textContent=text;el.className=`message ${text?'visible':''} ${ok?'success':''}`;};
  const ym=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'}).slice(0,7);
  const fmt=v=>{if(!v)return'—';const p=String(v).slice(0,10).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(v);};

  let session=null,projects=[],maps=[],elements=[],extinguishers=[],inspectionDetails=[],currentMap=null;

  async function boot(){
    session=await requireSession();if(!session)return;
    $('logoutBtn')?.addEventListener('click',logout);
    $('mapPeriod').value=ym();
    bind();
    const {data,error}=await sb.from('usuario_proyectos').select('proyecto_id,proyectos(id,codigo,nombre,cliente,activo)').eq('usuario_id',session.user.id);
    if(error)throw error;
    projects=(data||[]).map(x=>x.proyectos).filter(Boolean);
    $('mapProject').innerHTML='<option value="">Seleccione...</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    if(projects.length===1){$('mapProject').value=projects[0].id;await loadProject();}
  }

  function bind(){
    $('mapProject').onchange=loadProject;
    $('mapPlan').onchange=selectMap;
    $('mapPeriod').onchange=render;
    $('layerExt').onchange=render;
    $('layerOther').onchange=render;
  }

  async function loadProject(){
    const projectId=$('mapProject').value;
    currentMap=null;maps=[];elements=[];extinguishers=[];inspectionDetails=[];
    $('mapPlan').innerHTML='<option value="">Seleccione...</option>';
    if(!projectId){render();return;}
    msg('Cargando mapa y equipos...');
    const [m,e,x,d]=await Promise.all([
      sb.from('mapas_seguridad').select('*').eq('proyecto_id',projectId).eq('activo',true).order('principal',{ascending:false}).order('nombre'),
      sb.from('mapa_seguridad_elementos').select('*').eq('proyecto_id',projectId).eq('activo',true),
      sb.from('extintores').select('id,proyecto_id,codigo_extintor,ubicacion_nombre,tipo_extintor,agente_extintor,capacidad,marca_extintor,activo').eq('proyecto_id',projectId),
      sb.from('inspeccion_extintor_detalles').select('extintor_id,resultado,inspeccion:inspecciones_extintores!inner(fecha_inspeccion,proyecto_id)').eq('inspeccion.proyecto_id',projectId)
    ]);
    const firstError=m.error||e.error||x.error||d.error;
    if(firstError){
      if(String(firstError.message||'').toLowerCase().includes('mapas_seguridad')) msg('Primero ejecuta ETAPA_49_2_1_MAPA_SEGURIDAD.sql en Supabase.');
      else msg('No se pudo cargar el mapa: '+(firstError.message||firstError));
      render();return;
    }
    maps=m.data||[];elements=e.data||[];extinguishers=x.data||[];inspectionDetails=d.data||[];
    $('mapPlan').innerHTML='<option value="">Seleccione...</option>'+maps.map(v=>`<option value="${v.id}">${esc(v.nombre)}${v.principal?' · Principal':''}</option>`).join('');
    const principal=maps.find(v=>v.principal)||maps[0];
    if(principal){$('mapPlan').value=principal.id;selectMap();}else render();
    msg('');
  }

  function selectMap(){
    currentMap=maps.find(v=>v.id===$('mapPlan').value)||null;
    render();
  }

  function stateForExtinguisher(extId){
    const period=$('mapPeriod').value;
    const rows=inspectionDetails.filter(r=>r.extintor_id===extId&&String(r.inspeccion?.fecha_inspeccion||'').slice(0,7)===period)
      .sort((a,b)=>String(b.inspeccion?.fecha_inspeccion||'').localeCompare(String(a.inspeccion?.fecha_inspeccion||'')));
    if(!rows.length)return'PENDIENTE';
    return rows[0].resultado==='OBSERVADO'?'OBSERVADO':'CONFORME';
  }

  function render(){
    const img=$('mapImage'),empty=$('mapEmpty'),markers=$('mapMarkers'),side=$('mapSide');
    if(currentMap?.imagen_ruta){
      img.src=currentMap.imagen_ruta;img.classList.remove('hidden');empty.classList.add('hidden');
    }else{img.removeAttribute('src');img.classList.add('hidden');empty.classList.remove('hidden');}
    markers.innerHTML='';
    if(!currentMap){updateKpis([]);side.innerHTML=sideEmpty();return;}
    const showExt=$('layerExt').checked,showOther=$('layerOther').checked;
    const visible=elements.filter(el=>el.mapa_id===currentMap.id&&((el.tipo_elemento==='EXTINTOR'&&showExt)||(el.tipo_elemento!=='EXTINTOR'&&showOther)));
    visible.forEach(el=>{
      const ext=el.extintor_id?extinguishers.find(x=>x.id===el.extintor_id):null;
      const state=el.tipo_elemento==='EXTINTOR'?stateForExtinguisher(el.extintor_id):'OTRO';
      const b=document.createElement('button');
      b.type='button';b.className=`safety-marker ${state.toLowerCase()}`;
      b.style.left=`${Number(el.pos_x)||50}%`;b.style.top=`${Number(el.pos_y)||50}%`;
      b.style.transform=`translate(-50%,-50%) scale(${Number(el.escala)||1}) rotate(${Number(el.rotacion)||0}deg)`;
      b.title=ext?.codigo_extintor||el.codigo||el.nombre||el.tipo_elemento;
      b.innerHTML=`<span class="safety-marker-icon">${markerIcon(el.tipo_elemento)}</span><small>${esc(ext?.codigo_extintor||el.codigo||'')}</small>`;
      b.onclick=()=>showElement(el,ext,state);
      markers.appendChild(b);
    });
    updateKpis(visible);
    if(!visible.length)side.innerHTML=sideEmpty();
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

  function sideEmpty(){return '<div class="safety-map-side-empty"><strong>Selecciona un equipo</strong><span>Aquí aparecerán sus datos, estado e historial.</span></div>';}

  function showElement(el,ext,state){
    const side=$('mapSide');
    if(el.tipo_elemento==='EXTINTOR'&&ext){
      const last=inspectionDetails.filter(r=>r.extintor_id===ext.id).sort((a,b)=>String(b.inspeccion?.fecha_inspeccion||'').localeCompare(String(a.inspeccion?.fecha_inspeccion||'')))[0];
      side.innerHTML=`<div class="safety-side-head"><div><span class="map-type">EXTINTOR</span><h3>${esc(ext.codigo_extintor)}</h3></div><span class="e49-status ${state==='PENDIENTE'?'INACTIVO':state}">${esc(state)}</span></div><div class="safety-side-grid"><span>Ubicación</span><strong>${esc(ext.ubicacion_nombre||'—')}</strong><span>Tipo</span><strong>${esc(ext.tipo_extintor||'—')}</strong><span>Agente</span><strong>${esc(ext.agente_extintor||'—')}</strong><span>Capacidad</span><strong>${esc(ext.capacidad||'—')}</strong><span>Última inspección</span><strong>${esc(fmt(last?.inspeccion?.fecha_inspeccion))}</strong></div><div class="workflow-actions"><a class="button-link secondary-link" href="extintores.html">Ir a inspecciones</a></div>`;
    }else{
      side.innerHTML=`<div class="safety-side-head"><div><span class="map-type">${esc(el.tipo_elemento)}</span><h3>${esc(el.codigo||el.nombre||'Equipo')}</h3></div></div><p>${esc(el.descripcion||'Sin descripción registrada.')}</p>`;
    }
  }

  boot().catch(err=>{console.error(err);msg('No se pudo iniciar el mapa: '+(err.message||err));});
})();
