// ============================================================
// V11.9.1 - ETAPA 48 · INSPECCION DE BOTIQUINES
// Basado en EDP-SIG-SSOMAC-RE-PO-181-01
// ============================================================
(function(){
  'use strict';
  const page=document.body?.dataset?.page;
  if(page!=='first-aid-inspections')return;

  const $=id=>document.getElementById(id);
  const norm=s=>String(s||'').trim();
  const upper=s=>norm(s).toUpperCase();
  const code=n=>`BTQ-${String(n||0).padStart(6,'0')}`;
  const fmt=v=>typeof formatDateEsV6==='function'?formatDateEsV6(v):String(v||'');
  const esc=v=>typeof escapeHtml==='function'?escapeHtml(v):String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const msg=(el,text='',ok=false)=>typeof showMessage==='function'?showMessage(el,text,ok):(el.textContent=text);

  let session,profile,role='';
  let projects=[],places=[],areas=[],responsibles=[],potentials=[];
  let inspections=[],occurrenceByInspection=new Map();
  let checklistModels=[];
  let detailCurrent=null;
  let signaturePad=null;
  let generalPhotoFile=null;
  let generalPhotoPreviewUrl='';

  class SignaturePad48{
    constructor(canvas){
      this.canvas=canvas;this.ctx=canvas.getContext('2d');this.drawing=false;this.hasStroke=false;this.last=null;
      this.ctx.lineWidth=4;this.ctx.lineCap='round';this.ctx.lineJoin='round';this.ctx.strokeStyle='#17263c';
      this.clear();
      canvas.addEventListener('pointerdown',e=>this.start(e));
      canvas.addEventListener('pointermove',e=>this.move(e));
      canvas.addEventListener('pointerup',e=>this.stop(e));
      canvas.addEventListener('pointercancel',e=>this.stop(e));
      canvas.addEventListener('pointerleave',e=>{if(this.drawing)this.stop(e);});
    }
    point(e){const r=this.canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(this.canvas.width/r.width),y:(e.clientY-r.top)*(this.canvas.height/r.height)};}
    start(e){e.preventDefault();this.drawing=true;this.hasStroke=true;this.last=this.point(e);this.ctx.beginPath();this.ctx.moveTo(this.last.x,this.last.y);try{this.canvas.setPointerCapture(e.pointerId);}catch{}}
    move(e){if(!this.drawing)return;e.preventDefault();const p=this.point(e);this.ctx.lineTo(p.x,p.y);this.ctx.stroke();this.last=p;}
    stop(e){if(!this.drawing)return;e?.preventDefault?.();this.drawing=false;this.ctx.closePath();}
    clear(){this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.ctx.fillStyle='#fff';this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);this.ctx.strokeStyle='#17263c';this.hasStroke=false;}
    isEmpty(){return !this.hasStroke;}
    async toBlob(){return await new Promise(resolve=>this.canvas.toBlob(resolve,'image/webp',0.9));}
  }

  const listCard=$('e48ListCard'),formCard=$('e48FormCard'),configCard=$('e48ConfigCard'),detailCard=$('e48DetailCard');
  const list=$('e48List'),listMessage=$('e48ListMessage'),formMessage=$('e48FormMessage'),cfgMessage=$('e48CfgMessage'),detailMessage=$('e48DetailMessage');

  async function boot(){
    session=await requireSession();if(!session)return;
    $('logoutBtn')?.addEventListener('click',logout);
    profile=await getProfile(session.user.id);role=upper(profile?.rol);
    signaturePad=new SignaturePad48($('e48Signature'));
    $('e48ClearSignature').addEventListener('click',()=>signaturePad.clear());

    const [pr,rr,po]=await Promise.all([
      sb.rpc('listar_proyectos_autorizados_actual',{p_incluir_inactivos:false}),
      sb.from('responsables_correccion').select('id,proyecto_id,nombres,apellidos,cargo,email,area_nombre,aplica_todos_proyectos,activo').eq('activo',true).order('apellidos'),
      sb.from('potenciales_perdida').select('id,codigo,nombre,orden').eq('activo',true).order('orden')
    ]);
    if(pr.error)throw pr.error;if(rr.error)throw rr.error;if(po.error)throw po.error;
    projects=pr.data||[];responsibles=rr.data||[];potentials=po.data||[];

    fillProjectSelects();
    $('e48Potential').innerHTML='<option value="">Seleccione...</option>'+potentials.map(p=>`<option value="${p.id}" data-code="${esc(p.codigo||'')}">${esc(p.codigo||'')} · ${esc(p.nombre||'')}</option>`).join('');
    bindEvents();
    applyConfigPermission();
    resetForm();
    await loadInspections();
    if(new URLSearchParams(location.search).get('new')==='1')openForm();
  }

  function fillProjectSelects(){
    const opts=projects.map(p=>`<option value="${p.id}">${esc(p.nombre)}${p.cliente?` · ${esc(p.cliente)}`:''}</option>`).join('');
    $('e48Project').innerHTML='<option value="">Seleccione...</option>'+opts;
    $('e48CfgProject').innerHTML='<option value="">Seleccione...</option>'+opts;
    $('e48FilterProject').innerHTML='<option value="">Todos</option>'+opts;
    if(projects.length===1){$('e48Project').value=projects[0].id;$('e48CfgProject').value=projects[0].id;}
  }

  function applyConfigPermission(){
    const canConfig=['ADMIN','PROYECTO','ING_SEGURIDAD'].includes(role);
    $('e48ConfigBtn').classList.toggle('hidden',!canConfig);
  }

  function bindEvents(){
    $('e48NewBtn').addEventListener('click',openForm);
    $('e48Cancel').addEventListener('click',showList);
    $('e48DetailBack').addEventListener('click',showList);
    $('e48DetailPdf').addEventListener('click',()=>detailCurrent&&downloadPdf(detailCurrent.id,$('e48DetailPdf')));
    $('e48ConfigBtn').addEventListener('click',openConfig);
    $('e48CloseConfig').addEventListener('click',showList);
    $('e48CfgType').addEventListener('change',syncCfgType);
    $('e48CfgProject').addEventListener('change',loadConfigRows);
    $('e48CfgPlate').addEventListener('change',loadConfigRows);
    $('e48CfgPlate').addEventListener('blur',loadConfigRows);
    $('e48CfgAdd').addEventListener('click',()=>addCfgRow());
    $('e48CfgSave').addEventListener('click',saveConfig);
    $('e48CfgRestore').addEventListener('click',restoreConfig);
    $('e48Project').addEventListener('change',async()=>{await loadProjectContext();await loadEffectiveChecklist();});
    $('e48Type').addEventListener('change',async()=>{syncInspectionType();await loadEffectiveChecklist();});
    $('e48Plate').addEventListener('blur',loadEffectiveChecklist);
    $('e48Potential').addEventListener('change',syncDueDateByPotential);
    $('e48GeneralPhoto').addEventListener('change',handleGeneralPhotoChange);
    $('e48Form').addEventListener('submit',saveInspection);
    $('e48FilterProject').addEventListener('change',renderList);
    $('e48FilterType').addEventListener('change',renderList);
    $('e48FilterStatus').addEventListener('change',renderList);
    $('e48FilterText').addEventListener('input',renderList);
  }

  function showOnly(el){[listCard,formCard,configCard,detailCard].forEach(x=>x.classList.toggle('hidden',x!==el));window.scrollTo({top:0,behavior:'smooth'});}
  function showList(){showOnly(listCard);}

  async function openForm(){
    resetForm();showOnly(formCard);
    if(projects.length===1){$('e48Project').value=projects[0].id;await loadProjectContext();await loadEffectiveChecklist();}
  }

  function resetForm(){
    $('e48Form').reset();$('e48Date').value=today();$('e48Inspector').value=`${profile?.nombres||''} ${profile?.apellidos||''}`.trim();$('e48InspectorRole').value=profile?.cargo||'';
    $('e48Type').value='UBICACION';$('e48Action').value='Reponer, completar o regularizar los componentes observados del botiquín y evidenciar su corrección.';
    checklistModels=[];$('e48Checklist').innerHTML='<div class="list-item">Selecciona un proyecto para cargar los componentes.</div>';
    if(generalPhotoPreviewUrl){try{URL.revokeObjectURL(generalPhotoPreviewUrl);}catch{}}
    generalPhotoFile=null;generalPhotoPreviewUrl='';
    $('e48GeneralPhoto').value='';$('e48GeneralPhotoDescription').value='';
    $('e48GeneralPhotoPreview').innerHTML='Sin fotografía general';
    signaturePad?.clear();syncInspectionType();syncTreatment();msg(formMessage,'');
  }

  function handleGeneralPhotoChange(e){
    const f=e.target.files?.[0]||null;
    if(generalPhotoPreviewUrl){try{URL.revokeObjectURL(generalPhotoPreviewUrl);}catch{}}
    generalPhotoFile=f;generalPhotoPreviewUrl=f?URL.createObjectURL(f):'';
    $('e48GeneralPhotoPreview').innerHTML=f?`<img src="${generalPhotoPreviewUrl}" alt="Fotografía general del botiquín">`:'Sin fotografía general';
    if(f&&!norm($('e48GeneralPhotoDescription').value))$('e48GeneralPhotoDescription').value='Foto general del botiquín';
  }

  function syncInspectionType(){
    const vehicle=$('e48Type').value==='VEHICULO';
    $('e48PlaceField').classList.toggle('hidden',vehicle);$('e48CodeField').classList.toggle('hidden',vehicle);$('e48PlateField').classList.toggle('hidden',!vehicle);
    $('e48Place').required=!vehicle;$('e48Plate').required=vehicle;
  }

  async function loadProjectContext(){
    const projectId=$('e48Project').value;
    places=[];areas=[];
    if(!projectId){$('e48Place').innerHTML='<option value="">Selecciona primero el proyecto...</option>';return;}
    const [pl,ar]=await Promise.all([
      sb.from('lugares_proyecto').select('id,nombre,area_proyecto_id,activo').eq('proyecto_id',projectId).eq('activo',true).order('nombre'),
      sb.from('areas_proyecto').select('id,nombre,activo').eq('proyecto_id',projectId).eq('activo',true).order('nombre')
    ]);
    if(pl.error)throw pl.error;if(ar.error)throw ar.error;places=pl.data||[];areas=ar.data||[];
    $('e48Place').innerHTML='<option value="">Seleccione...</option>'+places.map(x=>`<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
    $('e48ResponsibleArea').innerHTML='<option value="">Seleccione...</option>'+areas.map(x=>`<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
    const available=responsibles.filter(r=>r.aplica_todos_proyectos===true||r.proyecto_id===projectId);
    $('e48CorrectionResponsible').innerHTML='<option value="">Seleccione...</option>'+available.map(r=>`<option value="${r.id}">${esc(`${r.nombres||''} ${r.apellidos||''}`.trim())} · ${esc(r.cargo||'')} · ${esc(r.area_nombre||'')}</option>`).join('');
  }

  async function loadEffectiveChecklist(){
    const projectId=$('e48Project').value,type=$('e48Type').value;
    if(!projectId)return;
    const plate=type==='VEHICULO'?upper($('e48Plate').value):null;
    const {data,error}=await sb.rpc('obtener_componentes_botiquin_efectivos',{p_proyecto_id:projectId,p_tipo:type,p_placa_vehiculo:plate||null});
    if(error){msg(formMessage,'No se pudieron cargar los componentes: '+error.message);return;}
    const rows=data||[];checklistModels=rows.map(r=>({orden:r.orden,nombre:r.nombre,cantidad:r.cantidad,resultado:'',observacion:'',file:null,preview:''}));
    const source=rows[0]?.origen||'CORPORATIVA';$('e48TemplateSource').textContent=source==='PERSONALIZADA'?'Configuración personalizada':'Formato corporativo';
    renderChecklist();
  }

  function renderChecklist(){
    if(!checklistModels.length){$('e48Checklist').innerHTML='<div class="list-item">No hay componentes configurados.</div>';return;}
    $('e48Checklist').innerHTML=checklistModels.map((m,i)=>`
      <article class="e48-item" data-index="${i}">
        <div class="e48-item-main"><span class="e48-item-no">${i+1}</span><div><strong>${esc(m.nombre)}</strong><small>Cantidad requerida: ${Number(m.cantidad||0)}</small></div></div>
        <div class="e48-result"><label><input type="radio" name="e48res${i}" value="SI" ${m.resultado==='SI'?'checked':''}> SI</label><label><input type="radio" name="e48res${i}" value="NO" ${m.resultado==='NO'?'checked':''}> NO</label></div>
        <div class="e48-observation ${m.resultado==='NO'?'':'hidden'}">
          <div class="field"><label>Descripción de la observación *</label><textarea data-obs rows="2" placeholder="Describe qué falta, está vencido, deteriorado o no cumple.">${esc(m.observacion||'')}</textarea></div>
          <div class="field"><label>Fotografía</label><input data-photo type="file" accept="image/jpeg,image/png,image/webp"><small>La foto se mostrará centrada en el PDF con esta descripción.</small></div>
          <div class="e48-photo-preview">${m.preview?`<img src="${m.preview}" alt="Evidencia">`:'Sin fotografía'}</div>
        </div>
      </article>`).join('');
    $('e48Checklist').querySelectorAll('.e48-item').forEach(card=>{
      const i=Number(card.dataset.index);
      card.querySelectorAll('input[type="radio"]').forEach(r=>r.addEventListener('change',()=>{checklistModels[i].resultado=r.value;renderChecklist();syncTreatment();}));
      card.querySelector('[data-obs]')?.addEventListener('input',e=>checklistModels[i].observacion=e.target.value);
      card.querySelector('[data-photo]')?.addEventListener('change',e=>{const f=e.target.files?.[0]||null;checklistModels[i].file=f;checklistModels[i].preview=f?URL.createObjectURL(f):'';renderChecklist();});
    });
  }

  function noItems(){return checklistModels.filter(x=>x.resultado==='NO');}
  function syncTreatment(){
    const has=noItems().length>0;$('e48Treatment').classList.toggle('hidden',!has);
    ['e48CorrectionResponsible','e48ResponsibleArea','e48Potential','e48DueDate','e48Action'].forEach(id=>$(id).required=has);
  }

  function syncDueDateByPotential(){
    const opt=$('e48Potential').selectedOptions[0];const c=upper(opt?.dataset?.code);if(!c)return;
    const days=c==='A'?1:c==='B'?3:c==='C'?14:0;if(!days)return;
    const d=new Date(($('e48Date').value||today())+'T12:00:00');d.setDate(d.getDate()+days);$('e48DueDate').value=d.toISOString().slice(0,10);
  }

  async function saveInspection(e){
    e.preventDefault();msg(formMessage,'');
    if(!checklistModels.length){msg(formMessage,'No hay componentes para inspeccionar.');return;}
    const pending=checklistModels.filter(x=>!x.resultado);if(pending.length){msg(formMessage,`Falta marcar SI o NO en ${pending.length} componente(s).`);return;}
    const no=noItems();const missingObs=no.filter(x=>norm(x.observacion).length<3);if(missingObs.length){msg(formMessage,'Todo componente marcado NO debe tener una descripción de la observación.');return;}
    if(signaturePad.isEmpty()){msg(formMessage,'Registra la firma del inspector.');return;}
    const vehicle=$('e48Type').value==='VEHICULO';
    if(vehicle&&!norm($('e48Plate').value)){msg(formMessage,'Ingresa la placa del vehículo.');return;}
    if(!vehicle&&!$('e48Place').value){msg(formMessage,'Selecciona el lugar / ubicación del botiquín.');return;}
    if(no.length&&(!$('e48CorrectionResponsible').value||!$('e48ResponsibleArea').value||!$('e48Potential').value||!$('e48DueDate').value||norm($('e48Action').value).length<5)){msg(formMessage,'Completa el tratamiento de las observaciones para generar su ocurrencia.');return;}

    const btn=$('e48Save');btn.disabled=true;btn.textContent='Guardando...';
    let inspection=null;const uploaded=[];
    try{
      const projectId=$('e48Project').value;const place=places.find(x=>x.id===$('e48Place').value);const status=no.length?'OBSERVADO':'CONFORME';
      const header={
        proyecto_id:projectId,tipo:$('e48Type').value,lugar_id:vehicle?null:(place?.id||null),area_proyecto_id:vehicle?null:(place?.area_proyecto_id||null),ubicacion_nombre:vehicle?`VEHÍCULO ${upper($('e48Plate').value)}`:(place?.nombre||''),codigo_botiquin:vehicle?null:(norm($('e48Code').value)||null),placa_vehiculo:vehicle?upper($('e48Plate').value):null,responsable_botiquin:norm($('e48Responsible').value),fecha_inspeccion:$('e48Date').value,inspector_id:session.user.id,inspector_nombre:norm($('e48Inspector').value),inspector_cargo:norm($('e48InspectorRole').value)||null,foto_botiquin_descripcion:generalPhotoFile?(norm($('e48GeneralPhotoDescription').value)||'Foto general del botiquín'):null,estado:status,responsable_correccion_id:no.length?$('e48CorrectionResponsible').value:null,area_responsable_proyecto_id:no.length?$('e48ResponsibleArea').value:null,accion_requerida:no.length?norm($('e48Action').value):null,potencial_perdida_id:no.length?$('e48Potential').value:null,fecha_limite:no.length?$('e48DueDate').value:null,creado_por:session.user.id
      };
      const {data:h,error:he}=await sb.from('inspecciones_botiquin').insert(header).select('*').single();if(he)throw he;inspection=h;

      const sigBlob=await signaturePad.toBlob();const sigPath=`inspecciones-botiquin/${inspection.id}/firma/${Date.now()}_${uid()}.webp`;const {error:se}=await sb.storage.from('evidencias-ssomac').upload(sigPath,sigBlob,{contentType:'image/webp',upsert:false});if(se)throw se;uploaded.push(sigPath);await sb.from('inspecciones_botiquin').update({firma_ruta:sigPath}).eq('id',inspection.id);inspection.firma_ruta=sigPath;

      if(generalPhotoFile){
        const photoBlob=await optimizeImage(generalPhotoFile);
        const photoPath=`inspecciones-botiquin/${inspection.id}/general/${Date.now()}_${uid()}.webp`;
        const {error:gpe}=await sb.storage.from('evidencias-ssomac').upload(photoPath,photoBlob,{contentType:'image/webp',upsert:false});if(gpe)throw gpe;
        uploaded.push(photoPath);
        const {error:gpu}=await sb.from('inspecciones_botiquin').update({foto_botiquin_ruta:photoPath,foto_botiquin_descripcion:norm($('e48GeneralPhotoDescription').value)||'Foto general del botiquín'}).eq('id',inspection.id);if(gpu)throw gpu;
        inspection.foto_botiquin_ruta=photoPath;inspection.foto_botiquin_descripcion=norm($('e48GeneralPhotoDescription').value)||'Foto general del botiquín';
      }

      const saved=[];
      for(let i=0;i<checklistModels.length;i++){
        const m=checklistModels[i];const {data:item,error:ie}=await sb.from('inspeccion_botiquin_items').insert({inspeccion_id:inspection.id,orden:i+1,componente:m.nombre,cantidad_requerida:Number(m.cantidad||0),resultado:m.resultado,observacion:m.resultado==='NO'?norm(m.observacion):null}).select('*').single();if(ie)throw ie;
        if(m.resultado==='NO'&&m.file){const blob=await optimizeImage(m.file);const path=`inspecciones-botiquin/${inspection.id}/item-${i+1}/${Date.now()}_${uid()}.webp`;const {error:ue}=await sb.storage.from('evidencias-ssomac').upload(path,blob,{contentType:'image/webp',upsert:false});if(ue)throw ue;uploaded.push(path);const {data:up,error:upe}=await sb.from('inspeccion_botiquin_items').update({foto_ruta:path}).eq('id',item.id).select('*').single();if(upe)throw upe;saved.push(up);}else saved.push(item);
      }

      let emailNote='';
      if(no.length){emailNote=await createOccurrence(inspection,saved);}
      msg(formMessage,`Inspección ${code(inspection.numero)} guardada correctamente.${emailNote}`,!emailNote.includes('NO pudo'));
      await loadInspections();
      setTimeout(()=>openDetail(inspection.id),1000);
    }catch(err){
      console.error(err);msg(formMessage,'No se pudo guardar: '+(err.message||err));
      if(inspection?.id){try{if(uploaded.length)await sb.storage.from('evidencias-ssomac').remove(uploaded);await sb.from('inspecciones_botiquin').delete().eq('id',inspection.id);}catch(_){}}
    }finally{btn.disabled=false;btn.textContent='Guardar inspección';}
  }

  async function createOccurrence(inspection,savedItems){
    const no=savedItems.filter(x=>x.resultado==='NO');
    const [or,type]=await Promise.all([
      sb.from('origenes_hallazgo').select('id,nombre').eq('activo',true),
      sb.from('tipos_hallazgo').select('id,codigo,nombre').eq('activo',true)
    ]);
    if(or.error)throw or.error;if(type.error)throw type.error;
    const origin=(or.data||[]).find(x=>upper(x.nombre)==='INSPECCION');
    const condition=(type.data||[]).find(x=>upper(x.codigo)==='CONDICION'||upper(x.nombre).includes('CONDICION'));
    if(!origin||!condition)throw new Error('No se encontró el catálogo INSPECCION / CONDICION para generar la ocurrencia.');
    const resp=responsibles.find(x=>x.id===$('e48CorrectionResponsible').value);const project=projects.find(x=>x.id===inspection.proyecto_id);const place=inspection.tipo==='VEHICULO'?`Vehículo ${inspection.placa_vehiculo}`:inspection.ubicacion_nombre;
    const listNo=no.map((x,i)=>`${i+1}. ${x.componente}${x.observacion?` – ${x.observacion}`:''}`).join('\n');
    const description=`Inspección de botiquín ${code(inspection.numero)} con ${no.length} componente(s) no conforme(s):\n${listNo}`;
    const payload={proyecto_id:inspection.proyecto_id,fecha:inspection.fecha_inspeccion,origen_hallazgo_id:origin.id,tipo_hallazgo_id:condition.id,lugar_hallazgo:place,lugar_id:inspection.lugar_id||null,area_hallazgo_proyecto_id:inspection.area_proyecto_id||null,descripcion,acciones_implementar:norm($('e48Action').value),potencial_perdida_id:$('e48Potential').value,responsable_correccion_id:resp?.id||null,responsable_correccion:resp?`${resp.nombres||''} ${resp.apellidos||''}`.trim():null,area_proyecto_id:$('e48ResponsibleArea').value,fecha_levantamiento:$('e48DueDate').value,modalidad_levantamiento:'ASIGNADO',botiquin_inspeccion_id:inspection.id,reportado_por_id:session.user.id};
    const {data:occ,error:oe}=await sb.from('ocurrencias').insert(payload).select('id,numero').single();if(oe)throw oe;
    const photoRows=no.filter(x=>x.foto_ruta).map(x=>({ocurrencia_id:occ.id,tipo_evidencia:'HALLAZGO',ruta_archivo:x.foto_ruta,comentario:x.observacion||x.componente,creado_por_id:session.user.id}));if(photoRows.length){const {error:ee}=await sb.from('evidencias').insert(photoRows);if(ee)throw ee;}
    await sb.from('inspecciones_botiquin').update({estado:'OCURRENCIA_GENERADA'}).eq('id',inspection.id);
    let note=` Se generó la ocurrencia OC-${String(occ.numero).padStart(6,'0')}.`;
    if(resp){
      const {data:ad,error:ae}=await sb.rpc('crear_asignacion_levantamiento',{p_ocurrencia_id:occ.id,p_responsable_id:resp.id,p_fecha_limite:$('e48DueDate').value});
      if(ae)return note+' La asignación quedó pendiente: '+ae.message;
      const ass=Array.isArray(ad)?ad[0]:ad;
      try{await sendAssignmentEmail({codigo_reporte:`OC-${String(occ.numero).padStart(6,'0')}`,correo_responsable:resp.email,nombre_responsable:`${resp.nombres||''} ${resp.apellidos||''}`.trim(),proyecto:project?.nombre||'',fecha:fmt(inspection.fecha_inspeccion),reportado_por:inspection.inspector_nombre,lugar:place,tipo_hallazgo:'CONDICION SUBESTANDAR',descripcion,accion:norm($('e48Action').value),fecha_limite:fmt($('e48DueDate').value),link_levantamiento:buildLiftLink(ass.token_levantamiento)});await markAssignmentEmailSent(ass.asignacion_id);note+=' Correo de levantamiento enviado al responsable.';}catch(mailErr){note+=' La ocurrencia se creó, pero el correo NO pudo enviarse: '+(mailErr.message||mailErr);}
    }
    return note;
  }

  async function loadInspections(){
    list.innerHTML='Cargando...';msg(listMessage,'');
    const {data,error}=await sb.from('inspecciones_botiquin').select('id,numero,proyecto_id,tipo,lugar_id,area_proyecto_id,ubicacion_nombre,codigo_botiquin,placa_vehiculo,responsable_botiquin,fecha_inspeccion,inspector_nombre,inspector_cargo,firma_ruta,foto_botiquin_ruta,foto_botiquin_descripcion,estado,creado_en,proyecto:proyectos(id,nombre,cliente),lugar:lugares_proyecto(id,nombre),area:areas_proyecto!inspecciones_botiquin_area_proyecto_id_fkey(id,nombre)').order('creado_en',{ascending:false});
    if(error){msg(listMessage,'No se pudieron cargar las inspecciones: '+error.message);list.innerHTML='';return;}
    inspections=data||[];occurrenceByInspection=new Map();
    if(inspections.length){const ids=inspections.map(x=>x.id);const {data:oc}=await sb.from('ocurrencias').select('id,numero,botiquin_inspeccion_id').in('botiquin_inspeccion_id',ids);(oc||[]).forEach(o=>occurrenceByInspection.set(o.botiquin_inspeccion_id,o));}
    $('e48KpiTotal').textContent=inspections.length;$('e48KpiOk').textContent=inspections.filter(x=>x.estado==='CONFORME').length;$('e48KpiObs').textContent=inspections.filter(x=>x.estado==='OBSERVADO').length;$('e48KpiOcc').textContent=inspections.filter(x=>occurrenceByInspection.has(x.id)).length;renderList();
  }

  function renderList(){
    const pf=$('e48FilterProject').value,tf=$('e48FilterType').value,sf=$('e48FilterStatus').value,q=norm($('e48FilterText').value).toLowerCase();
    const rows=inspections.filter(x=>(!pf||x.proyecto_id===pf)&&(!tf||x.tipo===tf)&&(!sf||x.estado===sf)&&(!q||`${code(x.numero)} ${x.proyecto?.nombre||''} ${x.ubicacion_nombre||''} ${x.placa_vehiculo||''} ${x.responsable_botiquin||''} ${x.inspector_nombre||''}`.toLowerCase().includes(q)));
    if(!rows.length){list.innerHTML='<div class="list-item">No hay inspecciones con esos filtros.</div>';return;}
    list.innerHTML=rows.map(x=>{const occ=occurrenceByInspection.get(x.id);return `<article class="e48-card"><div><div class="e48-card-top"><strong>${esc(code(x.numero))} · ${esc(x.proyecto?.nombre||'')}</strong><span class="e48-status ${esc(x.estado)}">${esc(x.estado.replaceAll('_',' '))}</span></div><h3>${esc(x.tipo==='VEHICULO'?`Vehículo ${x.placa_vehiculo||''}`:(x.ubicacion_nombre||'Botiquín'))}</h3><p>${esc(fmt(x.fecha_inspeccion))} · Inspector: ${esc(x.inspector_nombre||'')}</p></div><div class="e48-card-actions"><button class="secondary e48-view" data-id="${x.id}">Ver</button><button class="e48-pdf" data-id="${x.id}">Descargar PDF</button>${occ?`<a class="button-link secondary-link" href="detalle-ocurrencia.html?id=${occ.id}">OC-${String(occ.numero).padStart(6,'0')}</a>`:''}</div></article>`;}).join('');
    list.querySelectorAll('.e48-view').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.id)));list.querySelectorAll('.e48-pdf').forEach(b=>b.addEventListener('click',()=>downloadPdf(b.dataset.id,b)));
  }

  async function getFull(id){
    const {data:h,error}=await sb.from('inspecciones_botiquin').select('*,proyecto:proyectos(id,nombre,cliente),lugar:lugares_proyecto(id,nombre),area:areas_proyecto!inspecciones_botiquin_area_proyecto_id_fkey(id,nombre),area_responsable:areas_proyecto!inspecciones_botiquin_area_responsable_proyecto_id_fkey(id,nombre),potencial:potenciales_perdida(id,codigo,nombre),responsable_correccion:responsables_correccion(id,nombres,apellidos,cargo,email)').eq('id',id).single();if(error)throw error;
    const {data:items,error:ie}=await sb.from('inspeccion_botiquin_items').select('*').eq('inspeccion_id',id).order('orden');if(ie)throw ie;
    const {data:occ}=await sb.from('ocurrencias').select('id,numero').eq('botiquin_inspeccion_id',id).maybeSingle();h.items=items||[];h.ocurrencia=occ||null;return h;
  }

  async function openDetail(id){
    msg(detailMessage,'');try{detailCurrent=await getFull(id);$('e48DetailTitle').textContent=`${code(detailCurrent.numero)} · ${detailCurrent.tipo==='VEHICULO'?'Botiquín vehicular':'Botiquín de ubicación'}`;$('e48DetailOccurrence').classList.toggle('hidden',!detailCurrent.ocurrencia);if(detailCurrent.ocurrencia)$('e48DetailOccurrence').href=`detalle-ocurrencia.html?id=${detailCurrent.ocurrencia.id}`;
      const rows=[];for(const it of detailCurrent.items){let photo='';if(it.foto_ruta){const {data:s}=await sb.storage.from('evidencias-ssomac').createSignedUrl(it.foto_ruta,1800);photo=s?.signedUrl||'';}rows.push(`<tr><td>${it.orden}</td><td>${esc(it.componente)}</td><td>${it.cantidad_requerida}</td><td><strong class="${it.resultado==='SI'?'ok':'bad'}">${it.resultado}</strong></td><td>${esc(it.observacion||'—')}${photo?`<img class="e48-detail-photo" src="${photo}" alt="Evidencia">`:''}</td></tr>`);}let generalPhotoHtml='';if(detailCurrent.foto_botiquin_ruta){const {data:gs}=await sb.storage.from('evidencias-ssomac').createSignedUrl(detailCurrent.foto_botiquin_ruta,1800);if(gs?.signedUrl)generalPhotoHtml=`<div class="e48-general-detail"><strong>Fotografía general del botiquín</strong><img src="${gs.signedUrl}" alt="Fotografía general del botiquín"><small>${esc(detailCurrent.foto_botiquin_descripcion||'Foto general del botiquín')}</small></div>`;}const where=detailCurrent.tipo==='VEHICULO'?`Placa: ${detailCurrent.placa_vehiculo||'—'}`:`Ubicación: ${detailCurrent.ubicacion_nombre||'—'}${detailCurrent.codigo_botiquin?` · Código: ${detailCurrent.codigo_botiquin}`:''}`;$('e48Detail').innerHTML=`<div class="detail-grid"><div class="detail-item"><span>Proyecto / sede</span><strong>${esc(detailCurrent.proyecto?.nombre||'')}</strong></div><div class="detail-item"><span>Tipo</span><strong>${esc(detailCurrent.tipo)}</strong></div><div class="detail-item"><span>Ubicación / vehículo</span><strong>${esc(where)}</strong></div><div class="detail-item"><span>Responsable</span><strong>${esc(detailCurrent.responsable_botiquin||'')}</strong></div><div class="detail-item"><span>Fecha</span><strong>${esc(fmt(detailCurrent.fecha_inspeccion))}</strong></div><div class="detail-item"><span>Inspector</span><strong>${esc(detailCurrent.inspector_nombre||'')}</strong></div></div>${generalPhotoHtml}<div class="table-wrap"><table class="e48-detail-table"><thead><tr><th>Item</th><th>Componente</th><th>Cantidad</th><th>Resultado</th><th>Observación / evidencia</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;showOnly(detailCard);
    }catch(err){msg(detailMessage,'No se pudo abrir la inspección: '+(err.message||err));}
  }

  // ---------------- CONFIGURACION ----------------
  async function openConfig(){showOnly(configCard);syncCfgType();if(projects.length===1)$('e48CfgProject').value=projects[0].id;await loadConfigRows();}
  function syncCfgType(){const veh=$('e48CfgType').value==='VEHICULO';$('e48CfgPlateField').classList.toggle('hidden',!veh);if(!veh)$('e48CfgPlate').value='';loadConfigRows();}
  async function loadConfigRows(){
    const projectId=$('e48CfgProject').value;if(!projectId){$('e48CfgRows').innerHTML='<div class="list-item">Selecciona un proyecto.</div>';return;}
    const type=$('e48CfgType').value,plate=type==='VEHICULO'?upper($('e48CfgPlate').value):null;const {data,error}=await sb.rpc('obtener_componentes_botiquin_efectivos',{p_proyecto_id:projectId,p_tipo:type,p_placa_vehiculo:plate||null});if(error){msg(cfgMessage,'No se pudo cargar la configuración: '+error.message);return;}
    const rows=(data||[]).map(x=>({nombre:x.nombre,cantidad:x.cantidad}));$('e48CfgSource').textContent=(data?.[0]?.origen||'CORPORATIVA')==='PERSONALIZADA'?'PERSONALIZADA':'CORPORATIVA';renderCfgRows(rows);
  }
  function renderCfgRows(rows){$('e48CfgRows').innerHTML=rows.map((x,i)=>cfgRowHtml(x,i)).join('');bindCfgRows();}
  function cfgRowHtml(x={},i=0){return `<div class="e48-config-row" data-i="${i}"><span class="e48-drag-no">${i+1}</span><input data-name value="${esc(x.nombre||'')}" placeholder="Nombre del componente"><input data-qty type="number" min="0" value="${Number(x.cantidad??1)}"><button type="button" class="secondary" data-up title="Subir">↑</button><button type="button" class="secondary" data-down title="Bajar">↓</button><button type="button" class="warning" data-remove>Quitar</button></div>`;}
  function readCfgRows(){return [...$('e48CfgRows').querySelectorAll('.e48-config-row')].map(r=>({nombre:norm(r.querySelector('[data-name]').value),cantidad:Math.max(0,Number(r.querySelector('[data-qty]').value||0))})).filter(x=>x.nombre);}
  function bindCfgRows(){$('e48CfgRows').querySelectorAll('.e48-config-row').forEach((r,i)=>{r.querySelector('[data-remove]').onclick=()=>{const rows=readCfgRows();rows.splice(i,1);renderCfgRows(rows);};r.querySelector('[data-up]').onclick=()=>{const rows=readCfgRows();if(i>0){[rows[i-1],rows[i]]=[rows[i],rows[i-1]];renderCfgRows(rows);}};r.querySelector('[data-down]').onclick=()=>{const rows=readCfgRows();if(i<rows.length-1){[rows[i+1],rows[i]]=[rows[i],rows[i+1]];renderCfgRows(rows);}};});}
  function addCfgRow(){const rows=readCfgRows();rows.push({nombre:'',cantidad:1});renderCfgRows(rows);const inputs=$('e48CfgRows').querySelectorAll('[data-name]');inputs[inputs.length-1]?.focus();}
  async function saveConfig(){const projectId=$('e48CfgProject').value;if(!projectId){msg(cfgMessage,'Selecciona el proyecto.');return;}const rows=readCfgRows();if(!rows.length){msg(cfgMessage,'Debe quedar al menos un componente.');return;}const type=$('e48CfgType').value,plate=type==='VEHICULO'?upper($('e48CfgPlate').value):null;const b=$('e48CfgSave');b.disabled=true;b.textContent='Guardando...';const {error}=await sb.rpc('guardar_configuracion_botiquin',{p_proyecto_id:projectId,p_tipo:type,p_placa_vehiculo:plate||null,p_componentes:rows});b.disabled=false;b.textContent='Guardar configuración';if(error){msg(cfgMessage,'No se pudo guardar: '+error.message);return;}msg(cfgMessage,'Configuración guardada correctamente.',true);await loadConfigRows();}
  async function restoreConfig(){const projectId=$('e48CfgProject').value;if(!projectId)return;if(!confirm('¿Restaurar los componentes del formato corporativo para este alcance?'))return;const type=$('e48CfgType').value,plate=type==='VEHICULO'?upper($('e48CfgPlate').value):null;const {error}=await sb.rpc('restaurar_configuracion_botiquin',{p_proyecto_id:projectId,p_tipo:type,p_placa_vehiculo:plate||null});if(error){msg(cfgMessage,'No se pudo restaurar: '+error.message);return;}msg(cfgMessage,'Se restauró el formato corporativo.',true);await loadConfigRows();}

  // ---------------- PDF ----------------
  async function signed(path){if(!path)return'';const {data}=await sb.storage.from('evidencias-ssomac').createSignedUrl(path,1800);return data?.signedUrl||'';}
  async function dataUrlFromUrl(url){if(!url)return'';try{const r=await fetch(url);if(!r.ok)return'';const blob=await r.blob();return await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=()=>resolve('');fr.readAsDataURL(blob);});}catch{return'';}}
  async function waitImages(root){await Promise.all([...root.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;})));}
  async function downloadPdf(id,button){
    const old=button?.textContent;if(button){button.disabled=true;button.textContent='Generando PDF...';}
    let root=null;try{
      const d=await getFull(id);const items=[];for(const it of d.items){items.push({...it,photo:it.foto_ruta?await dataUrlFromUrl(await signed(it.foto_ruta)):''});}const sig=d.firma_ruta?await dataUrlFromUrl(await signed(d.firma_ruta)):'';const generalPhoto=d.foto_botiquin_ruta?await dataUrlFromUrl(await signed(d.foto_botiquin_ruta)):'';let logo='';try{logo=await dataUrlFromUrl('assets/img/logo-corporativo.jpg');}catch{}
      root=document.createElement('div');root.className='e48-pdf-root';root.innerHTML=d.tipo==='VEHICULO'?vehiclePdfHtml(d,items,sig,logo,generalPhoto):locationPdfHtml(d,items,sig,logo,generalPhoto);document.body.appendChild(root);await waitImages(root);const canvas=await html2canvas(root,{scale:1.45,backgroundColor:'#ffffff',useCORS:true,logging:false});const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();const ratio=Math.min((pw-8)/canvas.width,(ph-8)/canvas.height);const w=canvas.width*ratio,h=canvas.height*ratio;pdf.addImage(canvas.toDataURL('image/jpeg',0.92),'JPEG',(pw-w)/2,(ph-h)/2,w,h,'','FAST');pdf.save(`EDP-SIG-SSOMAC-RE-PO-181-01_${code(d.numero)}_${d.fecha_inspeccion}.pdf`);
    }catch(err){console.error(err);const target=detailCard.classList.contains('hidden')?listMessage:detailMessage;msg(target,'No se pudo generar el PDF: '+(err.message||err));}finally{root?.remove();if(button){button.disabled=false;button.textContent=old;}}
  }

  function photoGallery(d,items,generalPhoto){const entries=[];if(generalPhoto)entries.push({photo:generalPhoto,caption:d.foto_botiquin_descripcion||'Foto general del botiquín'});items.filter(x=>x.resultado==='NO'&&(x.photo||norm(x.observacion))).forEach(x=>entries.push({photo:x.photo,caption:x.observacion||x.componente}));if(!entries.length)return'<div class="e48p-empty">Sin observaciones</div>';return `<div class="e48p-gallery">${entries.map(x=>`<figure>${x.photo?`<img src="${x.photo}" alt="Evidencia">`:''}<figcaption>${esc(x.caption)}</figcaption></figure>`).join('')}</div>`;}
  function locationPdfHtml(d,items,sig,logo,generalPhoto){const n=Math.max(1,items.length);return `<div class="e48p-sheet e48p-location"><table><tr><td rowspan="4" class="e48p-logo">${logo?`<img src="${logo}">`:''}</td><td colspan="5" class="e48p-sig">SIG - SSOMAC</td><td class="e48p-meta">Código:</td><td class="e48p-meta-v">EDP-SIG-SSOMAC-RE-PO-181</td></tr><tr><td colspan="5"></td><td class="e48p-meta">N°:</td><td class="e48p-meta-v">1</td></tr><tr><td colspan="5" class="e48p-title red">CHECK LIST DE BOTIQUIN</td><td class="e48p-meta">Versión:</td><td class="e48p-meta-v">7</td></tr><tr><td colspan="5"></td><td class="e48p-meta">Fecha Act:</td><td class="e48p-meta-v">Jan-27</td></tr><tr><td colspan="8" class="e48p-left"><b>UBICACIÓN:</b> ${esc(d.ubicacion_nombre||'')} &nbsp;&nbsp;&nbsp; <b>CODIGO:</b> ${esc(d.codigo_botiquin||'')}</td></tr><tr><td colspan="8" class="e48p-left"><b>RESPONSABLE:</b> ${esc(d.responsable_botiquin||'')}</td></tr><tr><td colspan="8" class="e48p-left"><b>FECHA DE INSPECCION:</b> ${esc(fmt(d.fecha_inspeccion))}</td></tr><tr class="e48p-head"><th>ITEM</th><th colspan="3">COMPONENTES DE BOTIQUIN</th><th>CANTIDAD</th><th>SI</th><th>NO</th><th>OBSERVACIONES (Fotos)</th></tr>${items.map((it,i)=>`<tr class="e48p-item"><td>${i+1}</td><td colspan="3" class="left">${esc(it.componente)}</td><td>${it.cantidad_requerida}</td><td>${it.resultado==='SI'?'X':''}</td><td>${it.resultado==='NO'?'X':''}</td>${i===0?`<td rowspan="${n}" class="e48p-photos">${photoGallery(d,items,generalPhoto)}</td>`:''}</tr>`).join('')}<tr><td colspan="8" class="e48p-note"><b>NOTA:</b> Formato para realizar las inspecciones mensuales de los botiquines</td></tr><tr><td colspan="4" class="e48p-sign-cell"><div>Inspeccionado por: <b>${esc(d.inspector_nombre||'')}</b></div></td><td colspan="4" class="e48p-sign-cell"><div class="e48p-sign-title">Firma</div>${sig?`<img src="${sig}" class="e48p-sign-img">`:''}<div>${esc(d.inspector_cargo||'')}</div></td></tr></table></div>`;}
  function vehiclePdfHtml(d,items,sig,logo,generalPhoto){return `<div class="e48p-sheet e48p-vehicle"><table><tr><td rowspan="4" class="e48p-logo">${logo?`<img src="${logo}">`:''}</td><td colspan="5" class="e48p-sig">SISTEMA INTEGRADO DE GESTION DE SEGURIDAD, SALUD OCUPACIONAL, MEDIO AMBIENTE Y CALIDAD - SIG SSOMAC</td><td class="e48p-meta-v">RE-PO181-01</td></tr><tr><td colspan="5"></td><td class="e48p-meta-v">Versión : 01</td></tr><tr><td colspan="5" class="e48p-title yellow">CHECK LIST DE BOTIQUIN VEHICULOS</td><td class="e48p-meta-v">Fecha de Aprobación: Enero 2021</td></tr><tr><td colspan="5"></td><td class="e48p-meta-v">Página: 1 de 1</td></tr><tr><td colspan="7" class="e48p-left"><b>PLACA DE VEHICULO:</b> ${esc(d.placa_vehiculo||'')}</td></tr><tr><td colspan="7" class="e48p-left"><b>RESPONSABLE:</b> ${esc(d.responsable_botiquin||'')}</td></tr><tr><td colspan="7" class="e48p-left"><b>FECHA DE INSPECCION:</b> ${esc(fmt(d.fecha_inspeccion))}</td></tr><tr class="e48p-head"><th>ITEM</th><th colspan="2">COMPONENTES DE BOTIQUIN</th><th>CANTIDAD</th><th>SI</th><th>NO</th><th>OBSERVACIONES</th></tr>${items.map((it,i)=>`<tr class="e48p-item vehicle"><td>${i+1}</td><td colspan="2" class="left">${esc(it.componente)}</td><td>${it.cantidad_requerida}</td><td>${it.resultado==='SI'?'X':''}</td><td>${it.resultado==='NO'?'X':''}</td><td class="e48p-vehicle-obs">${it.observacion?`<div>${esc(it.observacion)}</div>`:''}${it.photo?`<img src="${it.photo}" alt="Evidencia">`:''}</td></tr>`).join('')}${generalPhoto?`<tr><td colspan="7" class="e48p-general-vehicle"><div class="e48p-sign-title">Fotografía general del botiquín</div><img src="${generalPhoto}" alt="Fotografía general del botiquín"><div>${esc(d.foto_botiquin_descripcion||'Foto general del botiquín')}</div></td></tr>`:''}<tr><td colspan="4" class="e48p-sign-cell"><b>Nombre Inspector:</b> ${esc(d.inspector_nombre||'')}</td><td colspan="3" class="e48p-sign-cell"><b>Firma:</b>${sig?`<img src="${sig}" class="e48p-sign-img">`:''}</td></tr></table></div>`;}

  boot().catch(err=>{console.error(err);msg(listMessage,'No se pudo iniciar el módulo: '+(err.message||err));});
})();
