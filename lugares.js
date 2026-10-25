// ============================================================
// V11.8.3 · Lugares / ubicaciones por proyecto / sede
// ============================================================
async function initPlacesV483(){
  const session=await requireSession();if(!session)return;
  document.getElementById('logoutBtn')?.addEventListener('click',logout);
  const ctx=await getAccessContextV43(session);
  const canManage=ctx.isAdmin||['PROYECTO','ING_SEGURIDAD'].includes(ctx.role);
  const list=document.getElementById('placesList'),msg=document.getElementById('placesMessage');
  const filterProject=document.getElementById('placeFilterProject'),filterArea=document.getElementById('placeFilterArea'),filterStatus=document.getElementById('placeFilterStatus'),search=document.getElementById('placeSearch');
  const formCard=document.getElementById('placeFormCard'),form=document.getElementById('placeForm'),projectEl=document.getElementById('placeProject'),areaEl=document.getElementById('placeArea'),formMsg=document.getElementById('placeFormMessage'),newBtn=document.getElementById('newPlaceBtn');
  const projects=ctx.projects||[];let rows=[],areas=[];
  const projectOptions=projects.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  filterProject.innerHTML=(ctx.isProject?'':'<option value="ALL">Todos</option>')+projectOptions;
  projectEl.innerHTML='<option value="">Seleccione...</option>'+projectOptions;
  if(ctx.isProject&&projects.length===1){filterProject.value=projects[0].id;filterProject.disabled=true;projectEl.value=projects[0].id;projectEl.disabled=true;}
  if(!canManage){newBtn?.classList.add('hidden');showMessage(msg,'Tu perfil puede consultar lugares, pero no modificarlos.');}

  async function loadAreas(projectId,selected=''){
    areas=[];areaEl.innerHTML='<option value="">Sin área asociada / N.A.</option>';
    if(!projectId)return;
    try{areas=await getProjectAreasV472(projectId,false);areaEl.innerHTML='<option value="">Sin área asociada / N.A.</option>'+areas.map(a=>`<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');if(selected&&areas.some(a=>a.id===selected))areaEl.value=selected;}
    catch(err){console.warn(err);areaEl.innerHTML='<option value="">No se pudieron cargar las áreas / procesos</option>';}
  }
  async function loadFilterAreas(){
    const pid=filterProject.value;let all=[];
    try{
      if(pid&&pid!=='ALL')all=await getProjectAreasV472(pid,false);
      else{for(const p of projects){const arr=await getProjectAreasV472(p.id,false);all.push(...arr.map(a=>({...a,projectName:p.nombre})));}}
    }catch(err){console.warn(err);}
    const seen=new Map();all.forEach(a=>{const key=a.id;seen.set(key,a);});
    filterArea.innerHTML='<option value="ALL">Todas</option><option value="NONE">Sin área asociada</option>'+[...seen.values()].map(a=>`<option value="${a.id}">${escapeHtml(a.nombre)}${a.projectName?` · ${escapeHtml(a.projectName)}`:''}</option>`).join('');
  }
  async function openForm(r=null){
    if(!canManage)return;form.reset();document.getElementById('placeEditId').value=r?.id||'';document.getElementById('placeFormTitle').textContent=r?'Editar lugar / ubicación':'Nuevo lugar / ubicación';document.getElementById('placeName').value=r?.nombre||'';
    if(ctx.isProject&&projects.length===1)projectEl.value=projects[0].id;else projectEl.value=r?.proyecto_id||'';
    await loadAreas(projectEl.value,r?.area_proyecto_id||'');showMessage(formMsg,'');formCard.classList.remove('hidden');formCard.scrollIntoView({behavior:'smooth',block:'start'});
  }
  newBtn?.addEventListener('click',()=>openForm());document.getElementById('cancelPlaceBtn')?.addEventListener('click',()=>formCard.classList.add('hidden'));
  projectEl.addEventListener('change',()=>loadAreas(projectEl.value));

  async function load(){
    list.innerHTML='Cargando...';
    const {data,error}=await sb.from('lugares_proyecto').select('id,proyecto_id,area_proyecto_id,nombre,activo,creado_en,proyecto:proyectos(id,nombre),area:areas_proyecto(id,nombre)').order('nombre');
    if(error){showMessage(msg,'No se pudieron cargar los lugares: '+error.message);list.innerHTML='';return;}rows=data||[];render();
  }
  function render(){
    const q=(search.value||'').trim().toLowerCase(),p=filterProject.value,a=filterArea.value,s=filterStatus.value;
    const filtered=rows.filter(r=>(p==='ALL'||!p||r.proyecto_id===p)&&(a==='ALL'||(a==='NONE'?!r.area_proyecto_id:r.area_proyecto_id===a))&&(s==='ALL'||(s==='ACTIVE'&&r.activo)||(s==='INACTIVE'&&!r.activo))&&(!q||`${r.nombre||''} ${r.proyecto?.nombre||''} ${r.area?.nombre||''}`.toLowerCase().includes(q)));
    list.innerHTML=filtered.length?filtered.map(r=>`<article class="responsible-card ${r.activo?'':'responsible-inactive'}"><div class="responsible-main"><div class="responsible-title-row"><h3>${escapeHtml(r.nombre||'')}</h3><span class="badge ${r.activo?'CERRADO':'ABIERTO'}">${r.activo?'ACTIVO':'INACTIVO'}</span></div><div class="responsible-meta"><span>${escapeHtml(r.proyecto?.nombre||'')}</span><span>Área / proceso: ${escapeHtml(r.area?.nombre||'N.A. / SIN ÁREA ASOCIADA')}</span></div></div><div class="responsible-actions">${canManage?`<button type="button" class="secondary" data-place-edit="${r.id}">Editar</button><button type="button" class="${r.activo?'warning':'success'}" data-place-toggle="${r.id}">${r.activo?'Desactivar':'Reactivar'}</button>`:''}</div></article>`).join(''):'<div class="list-item">No hay lugares con esos filtros.</div>';
    list.querySelectorAll('[data-place-edit]').forEach(b=>b.addEventListener('click',()=>openForm(rows.find(r=>r.id===b.dataset.placeEdit))));
    list.querySelectorAll('[data-place-toggle]').forEach(b=>b.addEventListener('click',async()=>{const r=rows.find(x=>x.id===b.dataset.placeToggle);if(!r)return;const {error}=await sb.from('lugares_proyecto').update({activo:!r.activo}).eq('id',r.id);if(error){showMessage(msg,'No se pudo actualizar: '+error.message);return;}await load();}));
  }
  filterProject.addEventListener('change',async()=>{await loadFilterAreas();render();});filterArea.addEventListener('change',render);filterStatus.addEventListener('change',render);search.addEventListener('input',render);
  form.addEventListener('submit',async e=>{e.preventDefault();if(!canManage)return;showMessage(formMsg,'');const id=document.getElementById('placeEditId').value,name=document.getElementById('placeName').value.trim().toUpperCase(),projectId=projectEl.value,areaId=areaEl.value||null;if(!projectId||!name){showMessage(formMsg,'Completa proyecto y nombre del lugar.');return;}const btn=document.getElementById('savePlaceBtn');btn.disabled=true;btn.textContent='Guardando...';try{const payload={proyecto_id:projectId,area_proyecto_id:areaId,nombre:name};const result=id?await sb.from('lugares_proyecto').update(payload).eq('id',id):await sb.from('lugares_proyecto').insert({...payload,creado_por_id:session.user.id,activo:true});if(result.error)throw result.error;showMessage(formMsg,id?'Lugar actualizado.':'Lugar agregado.',true);await load();await loadFilterAreas();setTimeout(()=>formCard.classList.add('hidden'),450);}catch(err){showMessage(formMsg,'No se pudo guardar: '+((err.message||'').includes('duplicate')?'Ya existe este lugar en el proyecto.':(err.message||err)));}finally{btn.disabled=false;btn.textContent='Guardar lugar';}});
  await loadFilterAreas();await load();
}
if(document.body.dataset.page==='places-admin')initPlacesV483();
