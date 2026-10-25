async function initAreasV472(){
  const session=await requireSession();if(!session)return;
  document.getElementById('logoutBtn')?.addEventListener('click',logout);
  const ctx=await getAccessContextV43(session);
  const canManage=ctx.isAdmin||['PROYECTO','ING_SEGURIDAD'].includes(ctx.role);
  const list=document.getElementById('areasList'),msg=document.getElementById('areasMessage');
  const filterProject=document.getElementById('areaFilterProject'),filterStatus=document.getElementById('areaFilterStatus'),search=document.getElementById('areaSearch');
  const formCard=document.getElementById('areaFormCard'),form=document.getElementById('areaForm'),projectEl=document.getElementById('areaProject'),formMsg=document.getElementById('areaFormMessage');
  const newBtn=document.getElementById('newAreaBtn');
  let rows=[];
  const projects=ctx.projects||[];
  const projectOptions=projects.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  filterProject.innerHTML=(ctx.isProject?'':'<option value="ALL">Todos</option>')+projectOptions;
  projectEl.innerHTML='<option value="">Seleccione...</option>'+projectOptions;
  if(ctx.isProject&&projects.length===1){filterProject.value=projects[0].id;filterProject.disabled=true;projectEl.value=projects[0].id;projectEl.disabled=true;}
  if(!canManage){newBtn?.classList.add('hidden');showMessage(msg,'Tu perfil puede consultar áreas, pero no modificarlas.');}

  function openForm(r=null){
    if(!canManage)return;
    form.reset();document.getElementById('areaEditId').value=r?.id||'';document.getElementById('areaFormTitle').textContent=r?'Editar área / proceso':'Nueva área / proceso';
    document.getElementById('areaName').value=r?.nombre||'';
    if(ctx.isProject&&projects.length===1)projectEl.value=projects[0].id;else projectEl.value=r?.proyecto_id||'';
    showMessage(formMsg,'');formCard.classList.remove('hidden');formCard.scrollIntoView({behavior:'smooth',block:'start'});
  }
  newBtn?.addEventListener('click',()=>openForm());
  document.getElementById('cancelAreaBtn')?.addEventListener('click',()=>formCard.classList.add('hidden'));

  async function load(){
    list.innerHTML='Cargando...';
    const {data,error}=await sb.from('areas_proyecto').select('id,proyecto_id,nombre,activo,creado_en,proyecto:proyectos(id,nombre)').order('nombre');
    if(error){showMessage(msg,'No se pudieron cargar las áreas / procesos: '+error.message);list.innerHTML='';return;}
    rows=data||[];render();
  }
  function render(){
    const q=(search.value||'').trim().toLowerCase(),p=filterProject.value,s=filterStatus.value;
    const filtered=rows.filter(r=>(p==='ALL'||!p||r.proyecto_id===p)&&(s==='ALL'||(s==='ACTIVE'&&r.activo)||(s==='INACTIVE'&&!r.activo))&&(!q||`${r.nombre||''} ${r.proyecto?.nombre||''}`.toLowerCase().includes(q)));
    list.innerHTML=filtered.length?filtered.map(r=>`<article class="responsible-card ${r.activo?'':'responsible-inactive'}"><div class="responsible-main"><div class="responsible-title-row"><h3>${escapeHtml(r.nombre||'')}</h3><span class="badge ${r.activo?'CERRADO':'ABIERTO'}">${r.activo?'ACTIVA':'INACTIVA'}</span></div><div class="responsible-meta"><span>${escapeHtml(r.proyecto?.nombre||'')}</span></div></div><div class="responsible-actions">${canManage?`<button type="button" class="secondary" data-area-edit="${r.id}">Editar</button><button type="button" class="${r.activo?'warning':'success'}" data-area-toggle="${r.id}" data-active="${r.activo}">${r.activo?'Desactivar':'Reactivar'}</button>`:''}</div></article>`).join(''):'<div class="list-item">No hay áreas con esos filtros.</div>';
    list.querySelectorAll('[data-area-edit]').forEach(b=>b.addEventListener('click',()=>openForm(rows.find(r=>r.id===b.dataset.areaEdit))));
    list.querySelectorAll('[data-area-toggle]').forEach(b=>b.addEventListener('click',async()=>{const r=rows.find(x=>x.id===b.dataset.areaToggle);if(!r)return;const {error}=await sb.from('areas_proyecto').update({activo:!r.activo}).eq('id',r.id);if(error){showMessage(msg,'No se pudo actualizar: '+error.message);return;}await load();}));
  }
  filterProject.addEventListener('change',render);filterStatus.addEventListener('change',render);search.addEventListener('input',render);
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!canManage)return;showMessage(formMsg,'');
    const id=document.getElementById('areaEditId').value,name=document.getElementById('areaName').value.trim().toUpperCase(),projectId=projectEl.value;
    if(!projectId||!name){showMessage(formMsg,'Completa proyecto y nombre del área / proceso.');return;}
    const btn=document.getElementById('saveAreaBtn');btn.disabled=true;btn.textContent='Guardando...';
    try{
      const payload={proyecto_id:projectId,nombre:name};
      const result=id?await sb.from('areas_proyecto').update(payload).eq('id',id):await sb.from('areas_proyecto').insert({...payload,creado_por_id:session.user.id,activo:true});
      if(result.error)throw result.error;showMessage(formMsg,id?'Área / proceso actualizada.':'Área / proceso agregada.',true);await load();setTimeout(()=>formCard.classList.add('hidden'),450);
    }catch(err){showMessage(formMsg,'No se pudo guardar: '+((err.message||'').includes('duplicate')?'Ya existe esta área / proceso en el proyecto.':(err.message||err)));}
    finally{btn.disabled=false;btn.textContent='Guardar área / proceso';}
  });
  await load();
}
if(document.body.dataset.page==='areas-admin')initAreasV472();
