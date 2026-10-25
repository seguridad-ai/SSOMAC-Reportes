// ============================================================
// V11.8.1 - ETAPA 47 REVISADA
// Inspección General corporativa - EDP-SIG-SSOMAC-RE-PA-191-03
// NO genera ocurrencias.
// ============================================================
const E47_ACT_CAUSES=["Operar equipos sin autorización.", "Omisión a los sistemas de advertencia.", "Omisión de asegurar.", "Operación o manejo a velocidad inapropiada.", "Desactivar los instrumentos de seguridad.", "Uso de equipo defectuoso.", "No usar o usa inadecuadamente el EPP.", "Hacer mantenimiento con el equipo en funcionamiento.", "Ajustar equipo en funcionamiento.", "Carga  inadecuada.", "Posición  inadecuada.", "Levantamiento inadecuado.", "Ubicación inadecuada para la tarea.", "Hacer bromas, juegos", "Trabajar bajo la influencia del alcohol.", "Uso inadecuado de equipo, herramienta, materiales", "Autorizar uso de equipos defectuosos", "Incumplimiento de estandares, procedimientos", "Ingresar a áreas restringidas", "Supervisión inadecuada"];
const E47_COND_CAUSES=["Protecciones  y barreras ausentes o  inadecuadas.", "Equipo de protección inadecuado o impropio.", "Herramienta, equipo o material defectuoso.", "Congestión o acción restringida.", "Sistema inadecuado de advertencia.", "Peligro de explosión o incendio.", "Orden y limpieza deficientes", "Atmósferas peligrosas.", "Exposiciones al ruido.", "Exposiciones a la radiación.", "Exposiciones a temperaturas altas o bajas.", "Iluminación excesiva o deficiente.", "Ventilación inadecuada.", "Productos químicos reactivos.", "Condición ambiental peligrosa", "Paredes, tejados, techos inestables", "Caminos, pisos, superficies inadecuadas", "Niveles inseguros de polvo, humos, vapores, gases", "Equipos disergonomicos"];
const E47_PERSONAL_CAUSES=["Altura, peso, talla, fuerza, alcance inapropiado.", "Capacidad movimiento corporal limitada.", "Capacidad limitada para mantenerse en determinadas posiciones corporales.", "Sensibilidad a substancias o alergias.", "Sensibilidad a temperatura, sonido….", "Visión defectuosa.", "Audición defectuosa.", "Otras deficiencias sensitivas (tacto, gusto, olfato, equilibrio).", "Incapacidad respiratoria.", "Otras incapacidades físicas permanentes.", "Incapacidades temporales.", "Temores y fobias.", "Disturbios emocionales.", "Enfermedad mental.", "Nivel de inteligencia.", "Incapacidad para comprender.", "Falta de juicio.", "Escasa coordinación.", "Bajo tiempo de reacción.", "Poca aptitud mecánica.", "Poca aptitud de aprendizaje.", "Problemas de memoria.", "Lesión o enfermedad.", "Fatiga debida a la carga o duración de la tarea.", "Fatiga debida a la falta de descanso.", "Fatiga debida a sobrecarga sensitiva.", "Exposición a riesgos contra la salud.", "Exposición a temperaturas extremas.", "Insuficiencia de oxígeno.", "Variación de la presión atmosférica", "Movimiento restringido", "Insuficiencia de azúcar en la sangre", "Ingestión de drogas", "Sobrecarga emocional", "Fatiga debida a la carga o a las limitaciones de tiempo de la tarea mental.", "Obligaciones que exigen un juicio o toma de decisiones extremas.", "Rutina, monotonía, exigencias para un cargo sin trascendencia"];
const E47_WORK_CAUSES=["Evaluación insuficiente de las exposiciones a pérdidas.", "Poca preocupación por los factores ergonómicos o humanos.", "Estándares especificaciones o criterios de diseño inadecuados", "Control e inspecciones inadecuadas de los equipos, materiales, areas de trabajo.", "Evaluación deficiente de la condición conveniente para operar.", "Especificaciones deficientes en cuanto a los requerimientos.", "Investigación deficiente respecto a materiales o equipos.", "Modalidad, ruta o carguío inadecuados.", "Comunicación inadecuada de las informaciones (datos) sobre aspectos de seguridad y salud.", "Manejo inadecuado de los materiales.", "Almacenamiento inadecuado de los materiales.", "Transporte inadecuado de los materiales.", "Identificación deficiente de  riesgos.", "Sistemas deficientes de recuperación o de eliminación de desechos.", "Aspectos correctivos inapropiados para comunicación de necesidades, programación del trabajo, revisión de las piezas, reemplazo de partes defectuosas.", "Evaluación deficiente de las necesidades y de los riesgos", "Preocupación deficiente en cuanto a los factores Humanos", "Estándares o especificaciones inadecuadas", "Disponibilidad inadecuada de herramientas, materiales y equipos", "Ajustes / reparación / mantenimiento deficiente", "Sistema deficiente de reparación y recuperación de materiales", "Eliminación y reemplazo inapropiado de piezas defectuosas", "Desarrollo inadecuado de normas para. inventario y evaluación de exposiciones y necesidades; compromiso del trabajador; estándares / procedimientos / reglas inconsistentes", "Comunicación inadecuada de las normas. publicación, distribución, adaptación a las lenguas respectivas, entrenamiento, reforzamiento mediante afiches, código de colores y ayudas para el trabajo.", "Mantenimiento inadecuado de las normas. seguimiento del flujo de trabajo, actualización, control del uso de normas / procedimientos / reglamentos.", "Planificación inadecuada del uso de estandares, PETS", "Prolongación excesiva de la vida útil del elemento", "Inspección o control deficientes", "Sobrecarga o proporción de uso excesivo", "Mantenimiento deficiente", "Empleo del elemento por personas no calificadas o sin preparación", "Empleo inadecuado para otros propósitos", "Permitidos por la supervisión. intencional / no intencional", "No permitidos por la supervisión. intencional / no intencional"];
const E47_TEMPLATE='assets/templates/formato-inspecciones-general.xlsx';

function e47Options(items,value=''){
  return '<option value="">N.A.</option>'+items.map(x=>`<option value="${escapeHtml(x)}" ${x===value?'selected':''}>${escapeHtml(x)}</option>`).join('');
}
function e47FmtDate(v){
  if(!v)return '—';
  const [y,m,d]=String(v).slice(0,10).split('-');
  return `${d}/${m}/${y}`;
}
function e47Code(n){return `IG-${String(n||0).padStart(6,'0')}`;}
function e47TypeLabel(v){return ({IP:'Inspección planeada',INP:'Inspección no planeada',IC:'Inspección cruzada'})[v]||v||'—';}

async function e47Signed(path,seconds=3600){
  if(!path)return '';
  const {data,error}=await sb.storage.from('evidencias-ssomac').createSignedUrl(path,seconds);
  return error?'':(data?.signedUrl||'');
}

async function e47Init(){
  const session=await requireSession();if(!session)return;
  const ctx=await getAccessContextV43(session);
  const profile=ctx.profile;
  const listCard=document.getElementById('e47ListCard');
  const formCard=document.getElementById('e47FormCard');
  const msg=document.getElementById('e47Message');
  const list=document.getElementById('e47List');
  const filterProject=document.getElementById('e47FilterProject');
  const filterStatus=document.getElementById('e47FilterStatus');
  const filterText=document.getElementById('e47FilterText');
  const form=document.getElementById('e47Form');
  const formMsg=document.getElementById('e47FormMessage');
  const projectEl=document.getElementById('e47Project');
  const itemsBox=document.getElementById('e47Items');
  const signatureCanvas=document.getElementById('e47Signature');
  const signaturePad=createSignaturePad(signatureCanvas,document.getElementById('e47ClearSignature'));
  let rows=[];
  let editId=null;
  let existingSignaturePath='';
  let itemModels=[];

  const projects=ctx.projects||[];
  const projectOptions=projects.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  filterProject.innerHTML=(ctx.isProject?'':'<option value="">Todos</option>')+projectOptions;
  projectEl.innerHTML='<option value="">Seleccione...</option>'+projectOptions;
  if(ctx.isProject&&projects.length===1){
    filterProject.value=projects[0].id;filterProject.disabled=true;
    projectEl.value=projects[0].id;projectEl.disabled=true;
  }

  document.getElementById('e47Inspector').value=`${profile.nombres||''} ${profile.apellidos||''}`.trim();
  document.getElementById('e47RecordName').value=`${profile.nombres||''} ${profile.apellidos||''}`.trim();
  document.getElementById('e47RecordRole').value=profile.cargo||'';
  document.getElementById('e47Date').value=today();
  document.getElementById('e47RecordDate').value=today();

  function emptyItem(){
    return {descripcion:'',causa_acto:'',causa_condicion:'',factor_trabajo:'',factor_personal:'',observacion_foto_ruta:'',accion_correctiva:'',correccion_foto_ruta:'',responsable:'',potencial_riesgo:'C',fecha_correccion:''};
  }

  function renderItems(){
    itemsBox.innerHTML=itemModels.map((it,i)=>`
      <article class="e47-item-card" data-item-index="${i}">
        <div class="e47-item-head">
          <div><span>ITEM ${i+1}</span><strong>Observación / hallazgo de inspección</strong></div>
          ${itemModels.length>1?`<button type="button" class="e47-remove-item" data-remove-item="${i}">Quitar</button>`:''}
        </div>
        <div class="field full"><label>Condición o práctica subestándar *</label><textarea rows="2" data-f="descripcion" placeholder="Describa claramente la observación...">${escapeHtml(it.descripcion||'')}</textarea></div>
        <div class="e47-grid-2">
          <div class="field"><label>Causa inmediata · Acto subestándar</label><select data-f="causa_acto">${e47Options(E47_ACT_CAUSES,it.causa_acto)}</select></div>
          <div class="field"><label>Causa inmediata · Condición subestándar</label><select data-f="causa_condicion">${e47Options(E47_COND_CAUSES,it.causa_condicion)}</select></div>
          <div class="field"><label>Causa básica · Factor de trabajo</label><select data-f="factor_trabajo">${e47Options(E47_WORK_CAUSES,it.factor_trabajo)}</select></div>
          <div class="field"><label>Causa básica · Factor personal</label><select data-f="factor_personal">${e47Options(E47_PERSONAL_CAUSES,it.factor_personal)}</select></div>
        </div>
        <div class="e47-grid-2">
          <div class="field"><label>Fotografía de la observación</label><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-file="observacion"><div class="e47-photo-preview" data-preview="observacion">${it.observacion_foto_ruta?'<span>Cargando fotografía...</span>':'<span>Sin fotografía</span>'}</div></div>
          <div class="field"><label>Corrección ejecutada</label><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-file="correccion"><div class="e47-photo-preview" data-preview="correccion">${it.correccion_foto_ruta?'<span>Cargando fotografía...</span>':'<span>Sin fotografía de corrección</span>'}</div></div>
        </div>
        <div class="field full"><label>Acción mitigadora / acción correctiva *</label><textarea rows="2" data-f="accion_correctiva" placeholder="Indique la acción definida...">${escapeHtml(it.accion_correctiva||'')}</textarea></div>
        <div class="e47-grid-3">
          <div class="field"><label>Responsable *</label><input data-f="responsable" value="${escapeHtml(it.responsable||'')}"></div>
          <div class="field"><label>Potencial de riesgo *</label><select data-f="potencial_riesgo"><option value="A" ${it.potencial_riesgo==='A'?'selected':''}>A · Alto (24 h)</option><option value="B" ${it.potencial_riesgo==='B'?'selected':''}>B · Medio (72 h)</option><option value="C" ${it.potencial_riesgo==='C'?'selected':''}>C · Bajo (2 semanas)</option></select></div>
          <div class="field"><label>Fecha de corrección</label><input type="date" data-f="fecha_correccion" value="${escapeHtml(it.fecha_correccion||'')}"></div>
        </div>
      </article>`).join('');

    itemsBox.querySelectorAll('[data-item-index]').forEach(card=>{
      const idx=Number(card.dataset.itemIndex);
      card.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('input',()=>{itemModels[idx][el.dataset.f]=el.value;}));
      card.querySelectorAll('[data-file]').forEach(el=>el.addEventListener('change',()=>{
        const file=el.files?.[0];if(!file)return;
        itemModels[idx][el.dataset.file+'_file']=file;
        const preview=card.querySelector(`[data-preview="${el.dataset.file}"]`);
        preview.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Vista previa">`;
      }));
      const rm=card.querySelector('[data-remove-item]');
      rm?.addEventListener('click',()=>{itemModels.splice(idx,1);renderItems();});
      (async()=>{
        for(const kind of ['observacion','correccion']){
          const path=itemModels[idx][kind+'_foto_ruta'];if(!path)continue;
          const url=await e47Signed(path);
          const preview=card.querySelector(`[data-preview="${kind}"]`);
          if(preview)preview.innerHTML=url?`<img src="${url}" alt="Evidencia existente">`:'<span>No se pudo cargar la fotografía.</span>';
        }
      })();
    });
  }

  document.getElementById('e47AddItem').addEventListener('click',()=>{
    if(itemModels.length>=10){showMessage(formMsg,'El formato corporativo permite un máximo de 10 ítems.');return;}
    itemModels.push(emptyItem());renderItems();
  });

  function showList(){
    formCard.classList.add('hidden');listCard.classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
  }
  function showForm(){
    listCard.classList.add('hidden');formCard.classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
  }

  document.getElementById('e47Cancel').addEventListener('click',()=>{history.replaceState(null,'','inspecciones.html');showList();});
  document.getElementById('e47NewBtn').addEventListener('click',()=>openNew());

  async function openNew(){
    editId=null;existingSignaturePath='';form.reset();signaturePad?.clear();
    document.getElementById('e47FormTitle').textContent='Nueva inspección general';
    document.getElementById('e47Inspector').value=`${profile.nombres||''} ${profile.apellidos||''}`.trim();
    document.getElementById('e47RecordName').value=`${profile.nombres||''} ${profile.apellidos||''}`.trim();
    document.getElementById('e47RecordRole').value=profile.cargo||'';
    document.getElementById('e47Date').value=today();document.getElementById('e47RecordDate').value=today();
    if(ctx.isProject&&projects.length===1)projectEl.value=projects[0].id;
    itemModels=[emptyItem()];renderItems();showMessage(formMsg,'');showForm();
  }

  async function openEdit(id){
    showMessage(formMsg,'Cargando...',true);
    const {data,error}=await sb.from('inspecciones_generales').select(`*,proyecto:proyectos(id,nombre),items:inspeccion_general_items(*)`).eq('id',id).single();
    if(error){showMessage(msg,'No se pudo abrir la inspección: '+error.message);return;}
    editId=id;existingSignaturePath=data.firma_ruta||'';signaturePad?.clear();
    document.getElementById('e47FormTitle').textContent=`Editar ${e47Code(data.numero)}`;
    projectEl.value=data.proyecto_id;document.getElementById('e47Inspector').value=data.inspector_nombre||'';document.getElementById('e47Area').value=data.area_inspeccionada||'';document.getElementById('e47Date').value=data.fecha_inspeccion||today();document.getElementById('e47Type').value=data.tipo_inspeccion||'IP';document.getElementById('e47Workers').value=data.numero_trabajadores??'';document.getElementById('e47RecordName').value=data.responsable_registro_nombre||'';document.getElementById('e47RecordRole').value=data.responsable_registro_cargo||'';document.getElementById('e47RecordDate').value=data.responsable_registro_fecha||today();
    itemModels=(data.items||[]).sort((a,b)=>a.item_no-b.item_no).map(x=>({...x,fecha_correccion:x.fecha_correccion||''}));if(!itemModels.length)itemModels=[emptyItem()];
    renderItems();
    const sigBox=document.getElementById('e47ExistingSignature');sigBox.innerHTML='';
    if(existingSignaturePath){const url=await e47Signed(existingSignaturePath);sigBox.innerHTML=url?`<span>Firma registrada</span><img src="${url}" alt="Firma registrada">`:'<span>Firma existente registrada.</span>';}
    showMessage(formMsg,'');showForm();
  }

  async function uploadImage(file,path){
    if(!file)return null;
    const blob=await optimizeImage(file);
    const {error}=await sb.storage.from('evidencias-ssomac').upload(path,blob,{contentType:'image/webp',upsert:false});
    if(error)throw error;return path;
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();showMessage(formMsg,'');
    itemModels.forEach((it,i)=>{document.querySelectorAll(`[data-item-index="${i}"] [data-f]`).forEach(el=>it[el.dataset.f]=el.value);});
    const populated=itemModels.filter(it=>String(it.descripcion||'').trim());
    if(!projectEl.value||!document.getElementById('e47Inspector').value.trim()||!document.getElementById('e47Area').value.trim()||!populated.length){showMessage(formMsg,'Completa los datos de la inspección y registra al menos una observación.');return;}
    for(const [i,it] of populated.entries()){if(!String(it.accion_correctiva||'').trim()||!String(it.responsable||'').trim()||!it.potencial_riesgo){showMessage(formMsg,`Completa acción, responsable y potencial del ítem ${i+1}.`);return;}}
    if(!editId&&signaturePad?.isEmpty()){showMessage(formMsg,'Registra la firma del responsable del registro.');return;}
    const btn=document.getElementById('e47Save');btn.disabled=true;btn.textContent='Guardando...';
    try{
      const header={proyecto_id:projectEl.value,inspector_nombre:document.getElementById('e47Inspector').value.trim(),area_inspeccionada:document.getElementById('e47Area').value.trim(),fecha_inspeccion:document.getElementById('e47Date').value,tipo_inspeccion:document.getElementById('e47Type').value,numero_trabajadores:document.getElementById('e47Workers').value?Number(document.getElementById('e47Workers').value):null,responsable_registro_nombre:document.getElementById('e47RecordName').value.trim(),responsable_registro_cargo:document.getElementById('e47RecordRole').value.trim()||null,responsable_registro_fecha:document.getElementById('e47RecordDate').value};
      let inspection;
      if(editId){const {data,error}=await sb.from('inspecciones_generales').update(header).eq('id',editId).select('id,numero').single();if(error)throw error;inspection=data;}
      else{const {data,error}=await sb.from('inspecciones_generales').insert({...header,creado_por_id:session.user.id}).select('id,numero').single();if(error)throw error;inspection=data;editId=data.id;}

      let firmaPath=existingSignaturePath;
      if(signaturePad&&!signaturePad.isEmpty()){
        const blob=await signaturePad.toBlob();firmaPath=`inspecciones-generales/${inspection.id}/firma/${Date.now()}_${uid()}.webp`;
        const {error}=await sb.storage.from('evidencias-ssomac').upload(firmaPath,blob,{contentType:'image/webp',upsert:false});if(error)throw error;
      }

      const payload=[];
      for(let i=0;i<populated.length;i++){
        const it=populated[i];let obs=it.observacion_foto_ruta||null,corr=it.correccion_foto_ruta||null;
        if(it.observacion_file)obs=await uploadImage(it.observacion_file,`inspecciones-generales/${inspection.id}/item-${i+1}/observacion/${Date.now()}_${uid()}.webp`);
        if(it.correccion_file)corr=await uploadImage(it.correccion_file,`inspecciones-generales/${inspection.id}/item-${i+1}/correccion/${Date.now()}_${uid()}.webp`);
        payload.push({inspeccion_id:inspection.id,item_no:i+1,descripcion:String(it.descripcion||'').trim(),causa_acto:it.causa_acto||null,causa_condicion:it.causa_condicion||null,factor_trabajo:it.factor_trabajo||null,factor_personal:it.factor_personal||null,observacion_foto_ruta:obs,accion_correctiva:String(it.accion_correctiva||'').trim(),correccion_foto_ruta:corr,responsable:String(it.responsable||'').trim(),potencial_riesgo:it.potencial_riesgo,fecha_correccion:it.fecha_correccion||null});
      }
      const pending=payload.some(x=>!x.correccion_foto_ruta||!x.fecha_correccion);
      const {error:de}=await sb.from('inspeccion_general_items').delete().eq('inspeccion_id',inspection.id);if(de)throw de;
      const {error:ie}=await sb.from('inspeccion_general_items').insert(payload);if(ie)throw ie;
      const {error:ue}=await sb.from('inspecciones_generales').update({firma_ruta:firmaPath||null,estado:pending?'PENDIENTE_CORRECCION':'COMPLETADA'}).eq('id',inspection.id);if(ue)throw ue;
      showMessage(formMsg,`Inspección ${e47Code(inspection.numero)} guardada.`,true);
      await loadRows();setTimeout(()=>{location.href=`inspecciones.html?saved=${inspection.id}`; },500);
    }catch(err){console.error(err);showMessage(formMsg,'No se pudo guardar: '+(err.message||err));}
    finally{btn.disabled=false;btn.textContent='Guardar inspección';}
  });

  async function loadRows(){
    const {data,error}=await sb.from('inspecciones_generales').select(`id,numero,proyecto_id,inspector_nombre,area_inspeccionada,fecha_inspeccion,tipo_inspeccion,estado,actualizado_en,proyecto:proyectos(id,nombre)`).order('numero',{ascending:false});
    if(error){showMessage(msg,'No se pudieron cargar las inspecciones: '+error.message);return;}
    rows=data||[];renderList();
  }
  function renderList(){
    const q=(filterText.value||'').trim().toLowerCase(),p=filterProject.value,s=filterStatus.value;
    const f=rows.filter(r=>(!p||r.proyecto_id===p)&&(!s||r.estado===s)&&(!q||`${e47Code(r.numero)} ${r.proyecto?.nombre||''} ${r.inspector_nombre||''} ${r.area_inspeccionada||''}`.toLowerCase().includes(q)));
    document.getElementById('e47KpiTotal').textContent=rows.length;document.getElementById('e47KpiPending').textContent=rows.filter(r=>r.estado==='PENDIENTE_CORRECCION').length;document.getElementById('e47KpiClosed').textContent=rows.filter(r=>r.estado==='COMPLETADA').length;
    list.innerHTML=f.length?f.map(r=>`<article class="e47-list-card"><div><div class="e47-list-top"><strong>${e47Code(r.numero)} · ${escapeHtml(r.proyecto?.nombre||'')}</strong><span class="e47-status ${r.estado}">${r.estado==='COMPLETADA'?'COMPLETADA':'PENDIENTE DE CORRECCIÓN'}</span></div><h3>${escapeHtml(r.area_inspeccionada||'')}</h3><div class="occurrence-meta"><span>${e47FmtDate(r.fecha_inspeccion)}</span><span>${escapeHtml(e47TypeLabel(r.tipo_inspeccion))}</span><span>Inspector: ${escapeHtml(r.inspector_nombre||'')}</span></div></div><div class="e47-list-actions"><button type="button" class="secondary" data-e47-edit="${r.id}">Editar / completar</button><button type="button" data-e47-excel="${r.id}">Descargar Excel</button></div></article>`).join(''):'<div class="list-item">No hay inspecciones con esos filtros.</div>';
    list.querySelectorAll('[data-e47-edit]').forEach(b=>b.addEventListener('click',()=>openEdit(b.dataset.e47Edit)));
    list.querySelectorAll('[data-e47-excel]').forEach(b=>b.addEventListener('click',()=>exportExcel(b.dataset.e47Excel,b)));
  }
  filterProject.addEventListener('change',renderList);filterStatus.addEventListener('change',renderList);filterText.addEventListener('input',renderList);

  async function getFull(id){
    const {data,error}=await sb.from('inspecciones_generales').select(`*,proyecto:proyectos(id,nombre,codigo),items:inspeccion_general_items(*)`).eq('id',id).single();
    if(error)throw error;data.items=(data.items||[]).sort((a,b)=>a.item_no-b.item_no);return data;
  }
  function excelDate(v){if(!v)return null;const [y,m,d]=String(v).slice(0,10).split('-').map(Number);return new Date(y,m-1,d);}
  async function insertExcelImage(book,sheet,path,col,row,width=160,height=72){
    if(!path)return;
    const url=await e47Signed(path,1800);if(!url)return;
    const png=await urlImageToPngDataUrl(url);if(!png)return;
    const id=book.addImage({base64:png,extension:'png'});
    sheet.addImage(id,{tl:{col,row:row-1},ext:{width,height},editAs:'oneCell'});
  }
  async function exportExcel(id,button=null){
    const old=button?.textContent;if(button){button.disabled=true;button.textContent='Generando...';}
    try{
      if(typeof ExcelJS==='undefined')throw new Error('No se cargó el generador de Excel.');
      const data=await getFull(id);
      const response=await fetch(E47_TEMPLATE+'?v=1');if(!response.ok)throw new Error('No se pudo cargar la plantilla corporativa.');
      const ab=await response.arrayBuffer();const book=new ExcelJS.Workbook();await book.xlsx.load(ab);
      const sheet=book.getWorksheet('EDP-SIG-SSOMAC-RE-PA-191-03')||book.worksheets[0];
      sheet.getCell('C8').value=data.inspector_nombre||'';
      sheet.getCell('C9').value=data.area_inspeccionada||'';
      sheet.getCell('C10').value=excelDate(data.fecha_inspeccion);sheet.getCell('C10').numFmt='dd/mm/yyyy';
      sheet.getCell('E10').value=e47Code(data.numero);
      if(data.numero_trabajadores!=null)sheet.getCell('K6').value=Number(data.numero_trabajadores);
      sheet.getCell('G8').value=(data.tipo_inspeccion==='IP'?'X  ':'')+'INSPECIONES PLANEADAS: IP';
      sheet.getCell('G9').value=(data.tipo_inspeccion==='INP'?'X  ':'')+'INSPECCIONES NO PLANEADAS: INP';
      sheet.getCell('G10').value=(data.tipo_inspeccion==='IC'?'X  ':'')+'INSPECCIONES CRUZADAS: IC';

      for(let i=0;i<10;i++){
        const row=14+i,it=data.items[i];if(!it)continue;
        sheet.getCell(`B${row}`).value=it.descripcion||'';
        sheet.getCell(`C${row}`).value=it.causa_acto||'';
        sheet.getCell(`D${row}`).value=it.causa_condicion||'';
        sheet.getCell(`E${row}`).value=it.factor_trabajo||'';
        sheet.getCell(`F${row}`).value=it.factor_personal||'';
        sheet.getCell(`H${row}`).value=it.accion_correctiva||'';
        sheet.getCell(`K${row}`).value=it.responsable||'';
        sheet.getCell(`L${row}`).value=it.potencial_riesgo==='A'?'X':'';
        sheet.getCell(`M${row}`).value=it.potencial_riesgo==='B'?'X':'';
        sheet.getCell(`N${row}`).value=it.potencial_riesgo==='C'?'X':'';
        if(it.fecha_correccion){sheet.getCell(`O${row}`).value=excelDate(it.fecha_correccion);sheet.getCell(`O${row}`).numFmt='dd/mm/yyyy';}else sheet.getCell(`O${row}`).value='';
        await insertExcelImage(book,sheet,it.observacion_foto_ruta,6,row,150,68);
        await insertExcelImage(book,sheet,it.correccion_foto_ruta,9,row,135,68);
      }
      sheet.getCell('C25').value=data.responsable_registro_nombre||'';
      sheet.getCell('C26').value=data.responsable_registro_cargo||'';
      sheet.getCell('F26').value='FECHA: '+e47FmtDate(data.responsable_registro_fecha);
      if(data.firma_ruta)await insertExcelImage(book,sheet,data.firma_ruta,7,25,190,38);
      const buffer=await book.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;const safe=(data.proyecto?.nombre||'PROYECTO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'-');a.download=`EDP-SIG-SSOMAC-RE-PA-191-03_${e47Code(data.numero)}_${safe}_${data.fecha_inspeccion}.xlsx`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    }catch(err){console.error(err);showMessage(msg,'No se pudo generar el Excel: '+(err.message||err));}
    finally{if(button){button.disabled=false;button.textContent=old;}}
  }

  await loadRows();
  const params=new URLSearchParams(location.search);
  if(params.get('new')==='1')await openNew();
  else if(params.get('id'))await openEdit(params.get('id'));
  else showList();
  if(params.get('saved'))showMessage(msg,'Inspección guardada correctamente. Puedes descargar el Excel corporativo desde la lista.',true);
}
if(document.body.dataset.page==='inspections')e47Init();
