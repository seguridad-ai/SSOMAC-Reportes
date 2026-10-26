// ============================================================
// ETAPA 49 - INSPECCION MENSUAL DE EXTINTORES
// Formato global EDP-SIG-SSOMAC-RE-PO-181-03
// + ficha individual digital por extintor
// ============================================================
(async function(){
  'use strict';
  if(typeof sb==='undefined') return;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm=v=>String(v??'').trim();
  const upper=v=>norm(v).toUpperCase();
  const fmt=v=>{if(!v)return'—';const p=String(v).slice(0,10).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(v);};
  const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});
  const code=n=>`IE-${String(n||0).padStart(6,'0')}`;
  const msg=(el,text='',ok=false)=>{if(!el)return;el.textContent=text;el.className=`message ${text?'visible':''} ${ok?'success':''}`;};
  const CONDITION_KEYS=[
    ['etiqueta_mantenimiento','Etiqueta · Mantenimiento'],['instrucciones_uso','Etiqueta · Instrucciones de uso'],['prueba_hidrostatica','Etiqueta · Prueba hidrostática'],['collar_verificacion','Collar de verificación'],['tarjeta_inspeccion','Tarjeta de inspección'],['manometro','Manómetro'],['botella','Botella'],['valvula','Válvula'],['manguera','Manguera'],['precinto_seguridad','Precinto de seguridad']
  ];
  const mark=v=>v==='OK'?'√':v==='MAL'?'X':'N/A';
  const hasBad=m=>CONDITION_KEYS.some(([k])=>m[k]==='MAL');

  const listCard=$('e49ListCard'),catalogCard=$('e49CatalogCard'),assetFormCard=$('e49AssetFormCard'),formCard=$('e49FormCard'),detailCard=$('e49DetailCard');
  const list=$('e49List'),listMessage=$('e49ListMessage'),catalogList=$('e49CatalogList'),catalogMessage=$('e49CatalogMessage'),assetMessage=$('e49AssetMessage'),formMessage=$('e49FormMessage'),detailMessage=$('e49DetailMessage');
  let session=null,profile=null,projects=[],places=[],responsibles=[],assets=[],inspections=[],models=[],detailCurrent=null;

  async function boot(){
    session=await requireSession();if(!session)return;
    $('logoutBtn')?.addEventListener('click',logout);
    profile=await getProfile(session.user.id);
    const [pr,resp]=await Promise.all([
      sb.from('usuario_proyectos').select('proyecto_id,proyectos(id,codigo,nombre,cliente,activo)').eq('usuario_id',session.user.id),
      sb.from('responsables_correccion').select('id,proyecto_id,nombres,apellidos,cargo,email,area_nombre,aplica_todos_proyectos,activo').eq('activo',true).order('apellidos')
    ]);
    if(pr.error)throw pr.error;if(resp.error)throw resp.error;
    projects=(pr.data||[]).map(x=>x.proyectos).filter(Boolean);responsibles=resp.data||[];
    const opts='<option value="">Todos</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    $('e49FilterProject').innerHTML=opts;$('e49CatalogProject').innerHTML=opts;
    $('e49Project').innerHTML='<option value="">Seleccione...</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    $('e49AssetProject').innerHTML='<option value="">Seleccione...</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    $('e49Date').value=today();$('e49Inspector').value=`${profile?.nombres||''} ${profile?.apellidos||''}`.trim();
    bind();await Promise.all([loadAssets(),loadInspections()]);
    if(new URLSearchParams(location.search).get('new')==='1') openNewInspection();
  }

  function bind(){
    $('e49NewBtn').onclick=openNewInspection;$('e49CatalogBtn').onclick=openCatalog;$('e49CloseCatalog').onclick=showList;$('e49AddAsset').onclick=()=>openAssetForm();$('e49AssetCancel').onclick=openCatalog;$('e49Cancel').onclick=showList;$('e49DetailBack').onclick=showList;
    $('e49FilterProject').onchange=renderInspections;$('e49FilterStatus').onchange=renderInspections;$('e49FilterText').oninput=renderInspections;
    $('e49CatalogProject').onchange=renderCatalog;$('e49CatalogStatus').onchange=renderCatalog;$('e49CatalogSearch').oninput=renderCatalog;
    $('e49AssetProject').onchange=()=>loadPlaces($('e49AssetProject').value,'e49AssetPlace');
    $('e49Project').onchange=loadInspectionAssets;$('e49AllOk').onclick=markAllOk;
    $('e49AssetForm').addEventListener('submit',saveAsset);$('e49Form').addEventListener('submit',saveInspection);
    $('e49GlobalPdf').onclick=e=>downloadGlobalPdf(detailCurrent?.id,e.currentTarget);
  }
  function hideAll(){[listCard,catalogCard,assetFormCard,formCard,detailCard].forEach(x=>x?.classList.add('hidden'));}
  function showList(){hideAll();listCard.classList.remove('hidden');history.replaceState(null,'','extintores.html');}
  function openCatalog(){hideAll();catalogCard.classList.remove('hidden');renderCatalog();}

  async function loadPlaces(projectId,targetId){
    const el=$(targetId);if(!projectId){el.innerHTML='<option value="">Selecciona primero el proyecto...</option>';return;}
    const {data,error}=await sb.from('lugares_proyecto').select('id,nombre,area_proyecto_id,activo').eq('proyecto_id',projectId).eq('activo',true).order('nombre');if(error){el.innerHTML='<option value="">Error al cargar</option>';return;}
    places=data||[];el.innerHTML='<option value="">Seleccione...</option>'+places.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  }

  async function loadAssets(){
    const {data,error}=await sb.from('extintores').select('*,proyecto:proyectos(id,nombre,cliente),lugar:lugares_proyecto(id,nombre)').order('codigo_extintor');
    if(error){msg(catalogMessage,'No se pudieron cargar los extintores: '+error.message);return;}
    assets=data||[];$('e49KpiAssets').textContent=assets.filter(x=>x.activo).length;renderCatalog();
  }
  function renderCatalog(){
    if(!catalogList)return;const pf=$('e49CatalogProject').value,sf=$('e49CatalogStatus').value,q=norm($('e49CatalogSearch').value).toLowerCase();
    const rows=assets.filter(x=>(!pf||x.proyecto_id===pf)&&(!sf||(sf==='ACTIVE'?x.activo:!x.activo))&&(!q||`${x.codigo_extintor} ${x.ubicacion_nombre||''} ${x.lugar?.nombre||''} ${x.tipo_extintor||''} ${x.agente_extintor||''} ${x.marca_extintor||''}`.toLowerCase().includes(q)));
    if(!rows.length){catalogList.innerHTML='<div class="list-item">No hay extintores con esos filtros.</div>';return;}
    catalogList.innerHTML=rows.map(x=>`<article class="e49-card ${x.activo?'':'inactive'}"><div><div class="e49-card-top"><strong>${esc(x.codigo_extintor)}</strong><span class="e49-status ${x.activo?'CONFORME':'INACTIVO'}">${x.activo?'ACTIVO':'INACTIVO'}</span></div><h3>${esc(x.lugar?.nombre||x.ubicacion_nombre||'Sin ubicación')}</h3><p>${esc(x.proyecto?.nombre||'')} · ${esc(x.tipo_extintor||'')} · ${esc(x.agente_extintor||'')} · ${esc(x.capacidad||'')}</p><small>Recarga próxima: ${esc(fmt(x.fecha_recarga_proxima))} · P. hidrostática próxima: ${esc(fmt(x.fecha_hidrostatica_proxima))}</small></div><div class="e49-actions"><button class="secondary e49-edit" data-id="${x.id}">Editar</button><button class="${x.activo?'warning':'success'} e49-toggle" data-id="${x.id}">${x.activo?'Desactivar':'Reactivar'}</button></div></article>`).join('');
    catalogList.querySelectorAll('.e49-edit').forEach(b=>b.onclick=()=>openAssetForm(assets.find(x=>x.id===b.dataset.id)));catalogList.querySelectorAll('.e49-toggle').forEach(b=>b.onclick=()=>toggleAsset(b.dataset.id));
  }
  async function toggleAsset(id){const x=assets.find(a=>a.id===id);if(!x)return;if(!confirm(`¿Deseas ${x.activo?'desactivar':'reactivar'} ${x.codigo_extintor}?`))return;const {error}=await sb.from('extintores').update({activo:!x.activo,actualizado_en:new Date().toISOString()}).eq('id',id);if(error){msg(catalogMessage,'No se pudo actualizar: '+error.message);return;}await loadAssets();}
  async function openAssetForm(x=null){
    hideAll();assetFormCard.classList.remove('hidden');$('e49AssetForm').reset();$('e49AssetId').value=x?.id||'';$('e49AssetFormTitle').textContent=x?'Editar extintor':'Agregar extintor';
    if(x){$('e49AssetProject').value=x.proyecto_id;await loadPlaces(x.proyecto_id,'e49AssetPlace');$('e49AssetPlace').value=x.lugar_id||'';$('e49AssetCode').value=x.codigo_extintor||'';$('e49AssetType').value=x.tipo_extintor||'';$('e49AssetAgent').value=x.agente_extintor||'';$('e49AssetCapacity').value=x.capacidad||'';$('e49AssetBrand').value=x.marca_extintor||'';$('e49AssetRechargeBrand').value=x.marca_recarga||'';$('e49AssetRechargeCurrent').value=x.fecha_recarga_actual||'';$('e49AssetRechargeNext').value=x.fecha_recarga_proxima||'';$('e49AssetHydroCurrent').value=x.fecha_hidrostatica_actual||'';$('e49AssetHydroNext').value=x.fecha_hidrostatica_proxima||'';}
    msg(assetMessage,'');
  }
  async function saveAsset(e){
    e.preventDefault();msg(assetMessage,'');const place=places.find(x=>x.id===$('e49AssetPlace').value);if(!place){msg(assetMessage,'Selecciona una ubicación válida.');return;}
    const payload={proyecto_id:$('e49AssetProject').value,lugar_id:place.id,area_proyecto_id:place.area_proyecto_id||null,ubicacion_nombre:place.nombre,codigo_extintor:upper($('e49AssetCode').value),tipo_extintor:norm($('e49AssetType').value),agente_extintor:norm($('e49AssetAgent').value),capacidad:norm($('e49AssetCapacity').value),marca_extintor:norm($('e49AssetBrand').value)||null,marca_recarga:norm($('e49AssetRechargeBrand').value)||null,fecha_recarga_actual:$('e49AssetRechargeCurrent').value||null,fecha_recarga_proxima:$('e49AssetRechargeNext').value||null,fecha_hidrostatica_actual:$('e49AssetHydroCurrent').value||null,fecha_hidrostatica_proxima:$('e49AssetHydroNext').value||null,actualizado_en:new Date().toISOString()};
    const id=$('e49AssetId').value;let q;if(id)q=sb.from('extintores').update(payload).eq('id',id);else q=sb.from('extintores').insert({...payload,activo:true,creado_por:session.user.id});const {error}=await q;if(error){msg(assetMessage,'No se pudo guardar: '+(error.message||error));return;}msg(assetMessage,'Extintor guardado correctamente.',true);await loadAssets();setTimeout(openCatalog,500);
  }

  async function openNewInspection(){hideAll();formCard.classList.remove('hidden');$('e49Form').reset();$('e49Date').value=today();$('e49Inspector').value=`${profile?.nombres||''} ${profile?.apellidos||''}`.trim();models=[];$('e49InspectionRows').innerHTML='<div class="list-item">Selecciona el proyecto para cargar sus extintores activos.</div>';msg(formMessage,'');}
  async function loadInspectionAssets(){const projectId=$('e49Project').value;if(!projectId){models=[];renderModels();return;}const rows=assets.filter(x=>x.proyecto_id===projectId&&x.activo);models=rows.map(x=>({asset:x,...Object.fromEntries(CONDITION_KEYS.map(([k])=>[k,''])),observacion:'',photoFile:null,photoPreview:'',medida_control:'Corregir las condiciones observadas y dejar el extintor operativo.',responsable_control_id:'',fecha_verificacion:''}));renderModels();}
  function renderModels(){
    const box=$('e49InspectionRows');if(!models.length){box.innerHTML='<div class="list-item">No hay extintores activos registrados para este proyecto. Agrégalos desde Catálogo de extintores.</div>';return;}
    box.innerHTML=models.map((m,i)=>`<article class="e49-inspection-card" data-i="${i}"><div class="e49-ext-head"><div><span class="e49-ext-no">${i+1}</span><strong>${esc(m.asset.codigo_extintor)}</strong><small>${esc(m.asset.ubicacion_nombre||m.asset.lugar?.nombre||'')} · ${esc(m.asset.tipo_extintor||'')} · ${esc(m.asset.capacidad||'')}</small></div><button type="button" class="secondary" data-all-ok>Todo √</button></div><div class="e49-tech-grid"><label>Recarga actual<input data-tech="fecha_recarga_actual" type="date" value="${m.asset.fecha_recarga_actual||''}"></label><label>Próxima recarga<input data-tech="fecha_recarga_proxima" type="date" value="${m.asset.fecha_recarga_proxima||''}"></label><label>P. hidro. actual<input data-tech="fecha_hidrostatica_actual" type="date" value="${m.asset.fecha_hidrostatica_actual||''}"></label><label>Próxima P. hidro.<input data-tech="fecha_hidrostatica_proxima" type="date" value="${m.asset.fecha_hidrostatica_proxima||''}"></label></div><div class="e49-condition-grid">${CONDITION_KEYS.map(([k,label])=>`<div class="e49-condition"><span>${esc(label)}</span><select data-cond="${k}"><option value="">—</option><option value="OK" ${m[k]==='OK'?'selected':''}>√ Buen estado</option><option value="MAL" ${m[k]==='MAL'?'selected':''}>X Mal estado</option><option value="NA" ${m[k]==='NA'?'selected':''}>N/A</option></select></div>`).join('')}</div><div class="e49-bad-block ${hasBad(m)?'':'hidden'}"><div class="field"><label>Observación *</label><textarea data-obs rows="2" placeholder="Describe el defecto o incumplimiento.">${esc(m.observacion)}</textarea></div><div class="field"><label>Fotografía (opcional)</label><input data-photo type="file" accept="image/jpeg,image/png,image/webp"><div class="e49-photo-preview">${m.photoPreview?`<img src="${m.photoPreview}">`:'Sin fotografía'}</div></div><div class="field"><label>Medida de control *</label><textarea data-action rows="2">${esc(m.medida_control)}</textarea></div><div class="field"><label>Responsable de control *</label><select data-resp><option value="">Seleccione...</option>${availableResponsibles().map(r=>`<option value="${r.id}" ${m.responsable_control_id===r.id?'selected':''}>${esc(`${r.nombres||''} ${r.apellidos||''}`.trim())} · ${esc(r.cargo||'')}</option>`).join('')}</select></div><div class="field"><label>Fecha de verificación *</label><input data-due type="date" value="${m.fecha_verificacion||''}"></div></div></article>`).join('');
    box.querySelectorAll('.e49-inspection-card').forEach(card=>{const i=Number(card.dataset.i),m=models[i];card.querySelector('[data-all-ok]').onclick=()=>{CONDITION_KEYS.forEach(([k])=>m[k]='OK');renderModels();};card.querySelectorAll('[data-cond]').forEach(el=>el.onchange=()=>{m[el.dataset.cond]=el.value;renderModels();});card.querySelectorAll('[data-tech]').forEach(el=>el.onchange=()=>{m.asset[el.dataset.tech]=el.value||null;});card.querySelector('[data-obs]')?.addEventListener('input',e=>m.observacion=e.target.value);card.querySelector('[data-action]')?.addEventListener('input',e=>m.medida_control=e.target.value);card.querySelector('[data-resp]')?.addEventListener('change',e=>m.responsable_control_id=e.target.value);card.querySelector('[data-due]')?.addEventListener('change',e=>m.fecha_verificacion=e.target.value);card.querySelector('[data-photo]')?.addEventListener('change',e=>{m.photoFile=e.target.files?.[0]||null;m.photoPreview=m.photoFile?URL.createObjectURL(m.photoFile):'';renderModels();});});
  }
  function availableResponsibles(){const p=$('e49Project').value;return responsibles.filter(r=>r.aplica_todos_proyectos===true||r.proyecto_id===p);}
  function markAllOk(){models.forEach(m=>CONDITION_KEYS.forEach(([k])=>m[k]='OK'));renderModels();}

  async function saveInspection(e){
    e.preventDefault();msg(formMessage,'');if(!models.length){msg(formMessage,'No hay extintores para registrar.');return;}
    const missing=models.filter(m=>CONDITION_KEYS.some(([k])=>!m[k]));if(missing.length){msg(formMessage,`Completa todos los criterios de ${missing.length} extintor(es).`);return;}
    const bad=models.filter(hasBad);for(const m of bad){if(norm(m.observacion).length<3||norm(m.medida_control).length<5||!m.responsable_control_id||!m.fecha_verificacion){msg(formMessage,`Completa observación, medida, responsable y fecha para ${m.asset.codigo_extintor}.`);return;}}
    const btn=$('e49Save');btn.disabled=true;btn.textContent='Guardando...';let header=null;const uploaded=[];
    try{
      const projectId=$('e49Project').value;const {data:h,error:he}=await sb.from('inspecciones_extintores').insert({proyecto_id:projectId,fecha_inspeccion:$('e49Date').value,inspector_id:session.user.id,inspector_nombre:norm($('e49Inspector').value),vb_residente:norm($('e49Resident').value)||null,estado:bad.length?'OBSERVADO':'CONFORME',creado_por:session.user.id}).select('*').single();if(he)throw he;header=h;
      for(let i=0;i<models.length;i++){
        const m=models[i],a=m.asset,resp=responsibles.find(r=>r.id===m.responsable_control_id);let photoPath=null;
        if(m.photoFile){const blob=await optimizeImage(m.photoFile);photoPath=`inspecciones-extintores/${header.id}/${a.id}/${Date.now()}_${uid()}.webp`;const {error:ue}=await sb.storage.from('evidencias-ssomac').upload(photoPath,blob,{contentType:'image/webp',upsert:false});if(ue)throw ue;uploaded.push(photoPath);}
        const detailPayload={inspeccion_id:header.id,extintor_id:a.id,orden:i+1,codigo_extintor:a.codigo_extintor,ubicacion_nombre:a.ubicacion_nombre||a.lugar?.nombre||'',tipo_extintor:a.tipo_extintor,agente_extintor:a.agente_extintor,capacidad:a.capacidad,marca_extintor:a.marca_extintor,marca_recarga:a.marca_recarga,fecha_recarga_actual:a.fecha_recarga_actual||null,fecha_recarga_proxima:a.fecha_recarga_proxima||null,fecha_hidrostatica_actual:a.fecha_hidrostatica_actual||null,fecha_hidrostatica_proxima:a.fecha_hidrostatica_proxima||null,...Object.fromEntries(CONDITION_KEYS.map(([k])=>[k,m[k]])),resultado:hasBad(m)?'OBSERVADO':'CONFORME',observacion:hasBad(m)?norm(m.observacion):null,foto_ruta:photoPath,foto_descripcion:photoPath?(norm(m.observacion)||`Evidencia ${a.codigo_extintor}`):null,medida_control:hasBad(m)?norm(m.medida_control):null,responsable_control_id:hasBad(m)?m.responsable_control_id:null,responsable_control_nombre:hasBad(m)&&resp?`${resp.nombres||''} ${resp.apellidos||''}`.trim():null,fecha_verificacion:hasBad(m)?m.fecha_verificacion:null};
        const {data:d,error:de}=await sb.from('inspeccion_extintor_detalles').insert(detailPayload).select('*').single();if(de)throw de;
        await sb.from('extintores').update({fecha_recarga_actual:a.fecha_recarga_actual||null,fecha_recarga_proxima:a.fecha_recarga_proxima||null,fecha_hidrostatica_actual:a.fecha_hidrostatica_actual||null,fecha_hidrostatica_proxima:a.fecha_hidrostatica_proxima||null,actualizado_en:new Date().toISOString()}).eq('id',a.id);
        if(hasBad(m)) await createOccurrence(header,d,m,a,resp);
      }
      msg(formMessage,`Inspección ${code(header.numero)} guardada correctamente.`,true);await Promise.all([loadAssets(),loadInspections()]);setTimeout(()=>openDetail(header.id),700);
    }catch(err){console.error(err);msg(formMessage,'No se pudo guardar: '+(err.message||err));if(header?.id){try{if(uploaded.length)await sb.storage.from('evidencias-ssomac').remove(uploaded);await sb.from('inspecciones_extintores').delete().eq('id',header.id);}catch(_){}}}
    finally{btn.disabled=false;btn.textContent='Guardar inspección mensual';}
  }

  async function createOccurrence(header,detail,m,a,resp){
    const [or,type]=await Promise.all([sb.from('origenes_hallazgo').select('id,nombre').eq('activo',true),sb.from('tipos_hallazgo').select('id,codigo,nombre').eq('activo',true)]);if(or.error)throw or.error;if(type.error)throw type.error;
    const origin=(or.data||[]).find(x=>upper(x.nombre)==='INSPECCION');const condition=(type.data||[]).find(x=>upper(x.codigo)==='CONDICION'||upper(x.nombre).includes('CONDICION'));if(!origin||!condition)throw new Error('No se encontró INSPECCION / CONDICION en los catálogos.');
    const failed=CONDITION_KEYS.filter(([k])=>m[k]==='MAL').map(([,label])=>label);const description=`Inspección mensual de extintor ${a.codigo_extintor}. Condiciones en mal estado: ${failed.join(', ')}.${m.observacion?` Observación: ${m.observacion}`:''}`;
    const payload={proyecto_id:header.proyecto_id,fecha:header.fecha_inspeccion,origen_hallazgo_id:origin.id,tipo_hallazgo_id:condition.id,lugar_hallazgo:a.ubicacion_nombre||'Extintor',lugar_id:a.lugar_id||null,area_hallazgo_proyecto_id:a.area_proyecto_id||null,descripcion,acciones_implementar:norm(m.medida_control),responsable_correccion_id:resp?.id||null,responsable_correccion:resp?`${resp.nombres||''} ${resp.apellidos||''}`.trim():null,area_proyecto_id:a.area_proyecto_id||null,fecha_levantamiento:m.fecha_verificacion,modalidad_levantamiento:'ASIGNADO',extintor_detalle_id:detail.id,reportado_por_id:session.user.id};
    const {data:occ,error:oe}=await sb.from('ocurrencias').insert(payload).select('id,numero').single();if(oe)throw oe;await sb.from('inspeccion_extintor_detalles').update({ocurrencia_id:occ.id}).eq('id',detail.id);
    if(detail.foto_ruta){const {error:ee}=await sb.from('evidencias').insert({ocurrencia_id:occ.id,tipo_evidencia:'HALLAZGO',ruta_archivo:detail.foto_ruta,comentario:m.observacion||a.codigo_extintor,creado_por_id:session.user.id});if(ee)throw ee;}
    if(resp){const {data:ad,error:ae}=await sb.rpc('crear_asignacion_levantamiento',{p_ocurrencia_id:occ.id,p_responsable_id:resp.id,p_fecha_limite:m.fecha_verificacion});if(!ae){const ass=Array.isArray(ad)?ad[0]:ad;const project=projects.find(p=>p.id===header.proyecto_id);try{await sendAssignmentEmail({codigo_reporte:`OC-${String(occ.numero).padStart(6,'0')}`,correo_responsable:resp.email,nombre_responsable:`${resp.nombres||''} ${resp.apellidos||''}`.trim(),proyecto:project?.nombre||'',fecha:fmt(header.fecha_inspeccion),reportado_por:header.inspector_nombre,lugar:a.ubicacion_nombre||'',tipo_hallazgo:'CONDICION SUBESTANDAR',descripcion,accion:m.medida_control,fecha_limite:fmt(m.fecha_verificacion),link_levantamiento:buildLiftLink(ass.token_levantamiento)});await markAssignmentEmailSent(ass.asignacion_id);}catch(mailErr){console.warn('Correo extintor no enviado',mailErr);}}}
  }

  async function loadInspections(){
    const {data,error}=await sb.from('inspecciones_extintores').select('*,proyecto:proyectos(id,nombre,cliente)').order('creado_en',{ascending:false});if(error){msg(listMessage,'No se pudieron cargar las inspecciones: '+error.message);list.innerHTML='';return;}
    inspections=data||[];$('e49KpiTotal').textContent=inspections.length;$('e49KpiOk').textContent=inspections.filter(x=>x.estado==='CONFORME').length;$('e49KpiObs').textContent=inspections.filter(x=>x.estado==='OBSERVADO').length;renderInspections();
  }
  function renderInspections(){const pf=$('e49FilterProject').value,sf=$('e49FilterStatus').value,q=norm($('e49FilterText').value).toLowerCase();const rows=inspections.filter(x=>(!pf||x.proyecto_id===pf)&&(!sf||x.estado===sf)&&(!q||`${code(x.numero)} ${x.proyecto?.nombre||''} ${x.inspector_nombre||''} ${x.vb_residente||''}`.toLowerCase().includes(q)));if(!rows.length){list.innerHTML='<div class="list-item">No hay inspecciones con esos filtros.</div>';return;}list.innerHTML=rows.map(x=>`<article class="e49-card"><div><div class="e49-card-top"><strong>${esc(code(x.numero))} · ${esc(x.proyecto?.nombre||'')}</strong><span class="e49-status ${x.estado}">${esc(x.estado)}</span></div><h3>${esc(fmt(x.fecha_inspeccion))}</h3><p>Inspector: ${esc(x.inspector_nombre||'')} ${x.vb_residente?`· V°B°: ${esc(x.vb_residente)}`:''}</p></div><div class="e49-actions"><button class="secondary e49-view" data-id="${x.id}">Ver / fichas</button><button class="e49-pdf" data-id="${x.id}">PDF global</button></div></article>`).join('');list.querySelectorAll('.e49-view').forEach(b=>b.onclick=()=>openDetail(b.dataset.id));list.querySelectorAll('.e49-pdf').forEach(b=>b.onclick=()=>downloadGlobalPdf(b.dataset.id,b));}

  async function getFull(id){
    const {data:h,error}=await sb.from('inspecciones_extintores')
      .select('*,proyecto:proyectos(id,nombre,cliente)')
      .eq('id',id).single();
    if(error)throw error;

    // No embebemos ocurrencias aquí porque existe una relación en ambos sentidos:
    // inspeccion_extintor_detalles.ocurrencia_id -> ocurrencias.id
    // ocurrencias.extintor_detalle_id -> inspeccion_extintor_detalles.id
    // PostgREST la considera ambigua. Se cargan en una segunda consulta por ID.
    const {data:d,error:de}=await sb.from('inspeccion_extintor_detalles')
      .select('*,responsable:responsables_correccion(id,nombres,apellidos,cargo,email)')
      .eq('inspeccion_id',id).order('orden');
    if(de)throw de;

    const detalles=d||[];
    const occurrenceIds=[...new Set(detalles.map(x=>x.ocurrencia_id).filter(Boolean))];
    let occMap=new Map();
    if(occurrenceIds.length){
      const {data:occ,error:oe}=await sb.from('ocurrencias')
        .select('id,numero').in('id',occurrenceIds);
      if(oe)throw oe;
      occMap=new Map((occ||[]).map(o=>[o.id,o]));
    }
    h.detalles=detalles.map(x=>({...x,ocurrencia:x.ocurrencia_id?occMap.get(x.ocurrencia_id)||null:null}));
    return h;
  }
  async function openDetail(id){hideAll();detailCard.classList.remove('hidden');msg(detailMessage,'');try{detailCurrent=await getFull(id);$('e49DetailTitle').textContent=`${code(detailCurrent.numero)} · ${detailCurrent.proyecto?.nombre||''}`;$('e49Detail').innerHTML=`<div class="detail-grid"><div class="detail-item"><span>Proyecto</span><strong>${esc(detailCurrent.proyecto?.nombre||'')}</strong></div><div class="detail-item"><span>Fecha</span><strong>${esc(fmt(detailCurrent.fecha_inspeccion))}</strong></div><div class="detail-item"><span>Inspector</span><strong>${esc(detailCurrent.inspector_nombre||'')}</strong></div><div class="detail-item"><span>V°B° Residente</span><strong>${esc(detailCurrent.vb_residente||'—')}</strong></div></div><div class="e49-detail-list">${detailCurrent.detalles.map(d=>`<article class="e49-detail-ext"><div><div class="e49-card-top"><strong>${esc(d.codigo_extintor)}</strong><span class="e49-status ${d.resultado}">${esc(d.resultado)}</span></div><h3>${esc(d.ubicacion_nombre||'')}</h3><p>${esc(d.tipo_extintor||'')} · ${esc(d.agente_extintor||'')} · ${esc(d.capacidad||'')}</p>${d.observacion?`<small>${esc(d.observacion)}</small>`:''}</div><div class="e49-actions"><button class="secondary e49-individual-pdf" data-id="${d.id}">PDF individual</button>${d.ocurrencia?`<a class="button-link secondary-link" href="detalle-ocurrencia.html?id=${d.ocurrencia.id}">OC-${String(d.ocurrencia.numero).padStart(6,'0')}</a>`:''}</div></article>`).join('')}</div>`;$('e49Detail').querySelectorAll('.e49-individual-pdf').forEach(b=>b.onclick=()=>downloadIndividualPdf(detailCurrent,b.dataset.id,b));}catch(err){msg(detailMessage,'No se pudo cargar: '+(err.message||err));}}

  // ---------------- PDF helpers ----------------
  async function signed(path){if(!path)return'';const {data}=await sb.storage.from('evidencias-ssomac').createSignedUrl(path,1800);return data?.signedUrl||'';}
  async function dataUrl(url){if(!url)return'';try{const r=await fetch(url);if(!r.ok)return'';const blob=await r.blob();return await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>res('');fr.readAsDataURL(blob);});}catch{return'';}}
  async function waitImages(root){await Promise.all([...root.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;})));}
  async function logoData(){return await dataUrl('assets/img/logo-corporativo.jpg');}
  async function canvasToPdfPage(root,pdf,addPage){await waitImages(root);const canvas=await html2canvas(root,{scale:1.55,backgroundColor:'#fff',useCORS:true,logging:false});if(addPage)pdf.addPage('a4','landscape');const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();const ratio=Math.min((pw-6)/canvas.width,(ph-6)/canvas.height);const w=canvas.width*ratio,h=canvas.height*ratio;pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',(pw-w)/2,(ph-h)/2,w,h,'','FAST');}
  function globalHeader(h,logo){return `<table class="e49p-table"><tr><td rowspan="4" colspan="4" class="e49p-logo">${logo?`<img src="${logo}">`:''}</td><td colspan="13" class="e49p-sig">SIG - SSOMAC</td><td colspan="2" class="e49p-meta">Código:</td><td colspan="3">EDP-SIG-SSOMAC-RE-PO-181</td></tr><tr><td colspan="13"></td><td colspan="2" class="e49p-meta">N°:</td><td colspan="3">3</td></tr><tr><td colspan="13" class="e49p-title">INSPECCIÓN MENSUAL DE EXTINTORES</td><td colspan="2" class="e49p-meta">Versión:</td><td colspan="3">4</td></tr><tr><td colspan="13"></td><td colspan="2" class="e49p-meta">Fecha Act:</td><td colspan="3">Jul-25</td></tr><tr><td colspan="11" class="e49p-left"><b>Inspeccionado por:</b> ${esc(h.inspector_nombre||'')}</td><td colspan="11" class="e49p-left"><b>V°B° Residente:</b> ${esc(h.vb_residente||'')}</td></tr><tr><td colspan="11" class="e49p-left"><b>Proyecto:</b> ${esc(h.proyecto?.nombre||'')}</td><td colspan="11" class="e49p-left"><b>Fecha de Inspección:</b> ${esc(fmt(h.fecha_inspeccion))}</td></tr>`;}
  const globalColumns=`<tr class="e49p-h1"><th rowspan="2">Item</th><th rowspan="2">Código de extintor</th><th rowspan="2">Ubicación</th><th rowspan="2">Tipo de extintor</th><th rowspan="2">Agente extintor</th><th rowspan="2">Capacidad</th><th colspan="2">Marca</th><th colspan="2">Fecha de recarga</th><th colspan="2">Fecha de P. Hidrostática</th><th colspan="3">ETIQUETA</th><th rowspan="2">Collar de verificación</th><th rowspan="2">Tarjeta de inspección</th><th colspan="5">CONDICIÓN DEL EXTINTOR</th></tr><tr class="e49p-h2"><th>Extintor</th><th>Recarga</th><th>Actual</th><th>Próxima</th><th>Actual</th><th>Próxima</th><th>Mantenimiento</th><th>Instrucciones de uso</th><th>Prueba hidrostática</th><th>Manómetro</th><th>Botella</th><th>Válvula</th><th>Manguera</th><th>Precinto de Seguridad</th></tr>`;
  function globalRow(d,i){return `<tr><td>${i}</td><td>${esc(d.codigo_extintor)}</td><td>${esc(d.ubicacion_nombre||'')}</td><td>${esc(d.tipo_extintor||'')}</td><td>${esc(d.agente_extintor||'')}</td><td>${esc(d.capacidad||'')}</td><td>${esc(d.marca_extintor||'')}</td><td>${esc(d.marca_recarga||'')}</td><td>${esc(fmt(d.fecha_recarga_actual))}</td><td>${esc(fmt(d.fecha_recarga_proxima))}</td><td>${esc(fmt(d.fecha_hidrostatica_actual))}</td><td>${esc(fmt(d.fecha_hidrostatica_proxima))}</td>${['etiqueta_mantenimiento','instrucciones_uso','prueba_hidrostatica','collar_verificacion','tarjeta_inspeccion','manometro','botella','valvula','manguera','precinto_seguridad'].map(k=>`<td>${mark(d[k])}</td>`).join('')}</tr>`;}
  function planHtml(rows){const obs=rows.filter(x=>x.resultado==='OBSERVADO');return `<tr><td colspan="22" class="e49p-legend">(√) Buen estado &nbsp;&nbsp;&nbsp; (x) Mal estado &nbsp;&nbsp;&nbsp; (N/A) No aplica</td></tr><tr><td colspan="22" class="e49p-plan-title">Plan de Acción</td></tr><tr class="e49p-plan-head"><th>Item</th><th colspan="16">Medida de Control</th><th colspan="3">Responsable de control</th><th colspan="2">Fecha de Verificación</th></tr>${obs.length?obs.map((d,i)=>`<tr class="e49p-plan-row"><td>${i+1}</td><td colspan="16">${esc(d.medida_control||'')}</td><td colspan="3">${esc(d.responsable_control_nombre||'')}</td><td colspan="2">${esc(fmt(d.fecha_verificacion))}</td></tr>`).join(''):`<tr class="e49p-plan-row"><td>—</td><td colspan="16">Sin observaciones</td><td colspan="3">—</td><td colspan="2">—</td></tr>`}`;}
  async function downloadGlobalPdf(id,button){if(!id)return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Generando...';}let root=null;try{const h=await getFull(id),logo=await logoData();const chunks=[];for(let i=0;i<h.detalles.length;i+=16)chunks.push(h.detalles.slice(i,i+16));if(!chunks.length)chunks.push([]);const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});for(let p=0;p<chunks.length;p++){root=document.createElement('div');root.className='e49-pdf-root';const start=p*16;root.innerHTML=`<div class="e49p-sheet">${globalHeader(h,logo)}${globalColumns}${chunks[p].map((d,i)=>globalRow(d,start+i+1)).join('')}${p===chunks.length-1?planHtml(h.detalles):'<tr><td colspan="22" class="e49p-legend">Continúa en la siguiente página</td></tr>'}</table></div>`;document.body.appendChild(root);await canvasToPdfPage(root,pdf,p>0);root.remove();root=null;}pdf.save(`EDP-SIG-SSOMAC-RE-PO-181-03_${code(h.numero)}_${h.fecha_inspeccion}.pdf`);}catch(err){console.error(err);msg(detailCard.classList.contains('hidden')?listMessage:detailMessage,'No se pudo generar el PDF global: '+(err.message||err));}finally{root?.remove();if(button){button.disabled=false;button.textContent=old;}}}
  async function downloadIndividualPdf(h,detailId,button){const d=h.detalles.find(x=>x.id===detailId);if(!d)return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Generando...';}let root=null;try{const logo=await logoData(),photo=d.foto_ruta?await dataUrl(await signed(d.foto_ruta)):'';root=document.createElement('div');root.className='e49-pdf-root';root.innerHTML=`<div class="e49i-sheet"><table><tr><td rowspan="3" class="e49i-logo">${logo?`<img src="${logo}">`:''}</td><td class="e49i-sig">SIG - SSOMAC</td><td class="e49i-code">${esc(d.codigo_extintor)}</td></tr><tr><td class="e49i-title">FICHA INDIVIDUAL DE INSPECCIÓN DE EXTINTOR</td><td>Registro digital complementario</td></tr><tr><td colspan="2">Inspección mensual ${esc(code(h.numero))} · ${esc(fmt(h.fecha_inspeccion))}</td></tr></table><div class="e49i-meta"><div><span>Proyecto</span><b>${esc(h.proyecto?.nombre||'')}</b></div><div><span>Ubicación</span><b>${esc(d.ubicacion_nombre||'')}</b></div><div><span>Tipo</span><b>${esc(d.tipo_extintor||'')}</b></div><div><span>Agente</span><b>${esc(d.agente_extintor||'')}</b></div><div><span>Capacidad</span><b>${esc(d.capacidad||'')}</b></div><div><span>Marca</span><b>${esc(d.marca_extintor||'—')}</b></div><div><span>Recarga actual / próxima</span><b>${esc(fmt(d.fecha_recarga_actual))} / ${esc(fmt(d.fecha_recarga_proxima))}</b></div><div><span>P. hidrostática actual / próxima</span><b>${esc(fmt(d.fecha_hidrostatica_actual))} / ${esc(fmt(d.fecha_hidrostatica_proxima))}</b></div></div><table class="e49i-check"><tr><th>Criterio</th><th>Resultado</th><th>Criterio</th><th>Resultado</th></tr>${Array.from({length:5},(_,i)=>{const a=CONDITION_KEYS[i],b=CONDITION_KEYS[i+5];return `<tr><td>${esc(a[1])}</td><td>${mark(d[a[0]])}</td><td>${esc(b[1])}</td><td>${mark(d[b[0]])}</td></tr>`;}).join('')}</table><div class="e49i-result"><b>RESULTADO: ${esc(d.resultado)}</b></div>${photo||d.observacion?`<div class="e49i-photo"><b>Evidencia / observación</b>${photo?`<img src="${photo}">`:''}<p>${esc(d.foto_descripcion||d.observacion||'')}</p></div>`:''}${d.resultado==='OBSERVADO'?`<div class="e49i-action"><b>Plan de acción</b><p>${esc(d.medida_control||'')}</p><div>Responsable: <strong>${esc(d.responsable_control_nombre||'')}</strong> · Verificación: <strong>${esc(fmt(d.fecha_verificacion))}</strong></div></div>`:''}<div class="e49i-footer">Inspeccionado por: <b>${esc(h.inspector_nombre||'')}</b>${h.vb_residente?` · V°B° Residente: <b>${esc(h.vb_residente)}</b>`:''}</div></div>`;document.body.appendChild(root);await waitImages(root);const canvas=await html2canvas(root,{scale:1.7,backgroundColor:'#fff',useCORS:true,logging:false});const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight(),r=Math.min((pw-10)/canvas.width,(ph-10)/canvas.height),w=canvas.width*r,hh=canvas.height*r;pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',(pw-w)/2,(ph-hh)/2,w,hh,'','FAST');pdf.save(`Ficha_Extintor_${d.codigo_extintor}_${h.fecha_inspeccion}.pdf`);}catch(err){console.error(err);msg(detailMessage,'No se pudo generar el PDF individual: '+(err.message||err));}finally{root?.remove();if(button){button.disabled=false;button.textContent=old;}}}

  boot().catch(err=>{console.error(err);msg(listMessage,'No se pudo iniciar el módulo: '+(err.message||err));});
})();
