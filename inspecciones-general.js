// ============================================================
// V11.8.7 - ETAPA 47 · PDF DE HOJA COMPLETA CON ENCABEZADO
// Inspección General corporativa - EDP-SIG-SSOMAC-RE-PA-191-03
// NO genera ocurrencias.
// ============================================================
const E47_ACT_CAUSES=["Operar equipo sin autorización", "Omisión de advertir", "Omisión de asegurar", "Operar a velocidad indebida", "Desactivar dispositivos de seguridad", "Usar equipo defectuoso", "No usar el EPP correctamente", "Carga incorrecta", "Colocación incorrecta", "Levantar incorrectamente", "Posición indebida", "Dar servicio a equipo en funcionamiento", "Jugueteo", "Bajo la influencia del alcohol y/u otras drogas", "Uso indebido del Equipo", "Otros"];
const E47_COND_CAUSES=["Guardas o Barreras inadecuadas", "Equipo de protección incorrecto o inadecuado", "Herramientas, Equipo o Materiales defectuosos", "Congestión o Acción Restringida", "Sistema de advertencia inadecuado", "Peligros de Incendio y Explosión", "Orden y Limpieza deficientes / Desorden", "Exposición al Ruido", "Exposición a la Radiación", "Temperaturas Extremas", "Iluminación deficiente o excesiva", "Ventilación inadecuada", "Condiciones ambientales peligrosas", "Otros"];
const E47_PERSONAL_CAUSES=["01.01 Estatura, peso, tamaño, fuerza, alcance, etc. Inadecuados.", "01.02 Rango limitado de movimiento corporal.", "01.03 Capacidad limitada para mantener posiciones del cuerpo.", "01.04 Alergias o sensibilidad a sustancias.", "01.05 Sensibilidad a extremos sensoriales.", "01.06 Defecto de visión", "01.07 Defecto de Audición", "01.08 Otras defectos sensoriales (tacto, gusto, olfato, equilibrio).", "01.09 Incapacidad respiratoria.", "01.10 Otras capacidades físicas permanentes.", "01.11 Incapacidades temporales.", "02.01 Miedos y fobias", "02.02 Perturbación Emocional", "02.03 Enfermedad mental", "02.04 Nivel de inteligencia.", "02.05 Incapacidad para comprender.", "02.06 Mal discernimiento.", "02.07 Mala coordinación.", "02.08 Tiempo lento de reacción.", "02.09 Baja aptitud mecánica", "02.10 Baja aptitud para el aprendizaje", "02.11 Fallas de memoria.", "03.01 Lesión o enfermedad.", "03.02 Fatiga debida a carga o duración de la tarea.", "03.03 Fatiga debida a falta de descanso.", "03.04 Fatiga debida a sobrecarga sensorial.", "03.05 Exposición a peligros para la salud.", "03.06 Exposición a temperaturas extremas.", "03.07 Deficiencia de oxígeno.", "03.08 Variación de la presión atmosférica.", "03.09 Movimiento restringido", "03.10 Insuficiencia de azúcar en la sangre.", "03.11 Drogas", "04.01 Sobrecarga emocional.", "04.02 Fatiga debido a la velocidad o carga de trabajo mental", "04.03 Exigencias extremas de discernimiento/decisión", "04.04 Rutina, monotonía, demanda de vigilancia aburrida", "04.05 Exigencia extrema de concentración/percepción", "04.06 Actividad sin “sentido” o “degradantes”.", "04.07 Instrucciones / exigencias confusas.", "04.08 Exigencias / instrucciones contradictorias", "04.09 Preocupación por problemas", "04.10 Frustración.", "04.11 Enfermedad mental", "05.01 Falta de experiencia", "05.02 Orientación inadecuada", "05.03 Entrenamiento inicial inadecuado.", "05.04 Entrenamiento de actualización inadecuado.", "05.05 Instrucciones malentendidas", "06.01 Instrucción inicial inadecuada.", "06.02 Procedimiento inadecuado", "06.03 Desempeño infrecuente.", "06.04 Falta de orientación", "06.05 Instrucciones de revisión inadecuadas", "07.01 El desempeño incorrecto es premiado.", "07.02 El desempeño correcto es castigado.", "07.03 Falta de incentivos.", "07.04 Frustración excesiva", "07.05 Agresión indebida", "07.06 Intento incorrecto de ahorra tiempo o esfuerzo", "07.07 Intento incorrecto de evitar incomodidad", "07.08 Intento incorrecto de llamar la atención", "07.09 Disciplina inadecuada", "07.10 Presión indebida de los compañeros", "07.11 Ejemplo indebido de la supervisión", "07.12 Retroalimentación inadecuada del desempeño", "07.13 Refuerzo inadecuado de la conducta correcta", "07.14 Incentivos de producción incorrectos"];
const E47_WORK_CAUSES=["08.01 Relaciones jerárquicas confusas o contradictorias.", "08.02 Asignación confusas o conflictivas de responsabilidades.", "08.03 Delegación inapropiada o insuficiente.", "08.04 Dar política, procedimiento, práctica o pautas inadecuadas", "08.05 Dar objetivos, metas o estándares contradictorios.", "08.06 Planificación o programación inadecuada del trabajo.", "08.07 Instrucciones, orientación y/o entrenamiento inadecuado.", "08.08 Proveer documentos de referencia, directivas y publicaciones de orientación inadecuada.", "08.09 Identificación y evaluación inadecuada de exposición a pérdidas.", "08.10 Falta de conocimiento del trabajo por la supervisión / gerencia.", "08.11 Calificaciones individuales incompatibles con los requisitos del trabajo/tarea.", "08.12 Medición y evaluación inadecuada del desempeño.", "08.13 Retroalimentación inadecuada o incorrecta del desempeño.", "09.01 Evaluación inadecuada de exposición a pérdidas", "09.02 Consideración inadecuada de factores humanos / ergonomía", "09.03 Estándares, especificaciones y/o criterios de diseño inadecuados.", "09.04 Inadecuado monitoreo de la construcción", "09.05 Evaluación inadecuada de la preparación operativa.", "09.06 Controles inadecuados o incorrectos.", "09.07 Monitoreo inadecuado de la operación inicial.", "09.08 Evaluación inadecuada de los cambios.", "10.01 Especificaciones inadecuadas en las requisiciones.", "10.02 Investigación inadecuada de materiales o equipos.", "10.03 Especificaciones inadecuadas a los vendedores.", "10.04 Modo o ruta de embarque inadecuado", "10.05 Inspección y aceptación de recibos inadecuados.", "10.06 Comunicación inadecuada de datos de salud y seguridad", "10.07 Manipulación incorrecta de materiales.", "10.08 Almacenamiento incorrecto de materiales.", "10.09 Transporte incorrecto de materiales.", "10.10 Identificación inadecuada de artículos peligrosos.", "10.11 Salvamento y/o eliminación de desechos incorrecta", "10.12 Selección inadecuada de contratistas.", "11.01 Preventivo Inadecuado", "11.1.2 Lubricación y servicios", "11.1.3 Ajuste / Montaje", "11.1.4 Limpieza o recubrimiento de superficie", "11.2 Reparación inadecuada", "11.2.1 Comunicaciones de necesidades", "11.2.2 Programación del trabajo", "11.2.3 Examen de las unidades", "11.2.4 Sustitución de piezas", "12.01 Evaluación inadecuada de necesidades y riesgos", "12.02 Consideración inadecuada de factores humanos / ergonomía", "12.03 Estándares o especificaciones inadecuadas", "12.04 Disponibilidad inadecuada", "12.05 Ajuste / reparación / mantenimiento inadecuados", "12.06 Recuperación y rehabilitación inadecuadas", "12.07 Remoción y reemplazo inadecuado de artículos inapropiados", "13.1.1 Inventario y evaluación de exposiciones y necesidades", "13.1.2 Coordinación con el diseño en proceso", "13.1.3 Participación del personal", "13.1.4 Procedimientos prácticas / reglas", "13.2.1 Publicación", "13.2.2 Distribución", "13.2.3 Traducción a idiomas apropiados", "13.2.4 Entrenamiento", "13.2.5 Refuerzo con señales, códigos de color y ayuda del trabajo", "13.3.1 Seguimiento del flujo del trabajo", "13.3.2 Actualización", "13.3.3 Monitorear el uso de procedimientos / prácticas / reglas", "13.3.4 Monitoreo inadecuado del cumplimiento", "14.01 Planificación inadecuada del uso", "14.02 Ampliación indebida de la vida útil", "14.03 Inspección y/o monitoreo inadecuados", "14.04 Carga o velocidad de uso incorrectas", "14.05 Mantenimiento inadecuado", "14.06 Uso por personal no calificado o no entrenado", "14.07 Uso para el propósito equivocado", "15.1.1 Intencional", "15.1.2 No intencional", "15.2.1 Intencional", "15.2.2 No intencional"];
const E47_PERSONAL_GROUPS={
  '01':'01. CAPACIDAD FÍSICA/FISIOLÓGICA INADECUADA',
  '02':'02. CAPACIDAD MENTAL/PSICOLÓGICA INADECUADA',
  '03':'03. TENSIÓN FÍSICA O FISIOLÓGICA',
  '04':'04. TENSIÓN MENTAL O PSICOLÓGICA',
  '05':'05. FALTA DE CONOCIMIENTO',
  '06':'06. FALTA DE HABILIDAD',
  '07':'07. MOTIVACIÓN INCORRECTA'
};
const E47_WORK_GROUPS={
  '08':'08. LIDERAZGO Y/O SUPERVISIÓN INADECUADOS',
  '09':'09. INGENIERÍA INADECUADA',
  '10':'10. COMPRAS INADECUADAS',
  '11':'11. MANTENIMIENTO INADECUADO',
  '12':'12. HERRAMIENTAS Y EQUIPO INADECUADOS',
  '13':'13. ESTÁNDARES DE TRABAJO INADECUADOS',
  '14':'14. DESGASTE EXCESIVO',
  '15':'15. ABUSO O MAL USO'
};
const E47_TEMPLATE='assets/templates/formato-inspecciones-general.xlsx';

// V11.8.4 - Compatibilidad con formulas compartidas del formato corporativo.
// El Excel original usa una formula compartida en O14:O23. ExcelJS puede fallar
// al cargar sus celdas clonadas (p.ej. O15). Como SSOMAC Digital escribe luego
// la fecha de correccion real en O14:O23, limpiamos solo formulas compartidas
// antes de entregar el archivo a ExcelJS, preservando formato, imagenes y hojas.
async function e47LoadCorporateTemplate(){
  const response=await fetch(E47_TEMPLATE+'?v=4');
  if(!response.ok)throw new Error('No se pudo cargar la plantilla corporativa.');
  const original=await response.arrayBuffer();
  const book=new ExcelJS.Workbook();

  try{
    await book.xlsx.load(original);
    return book;
  }catch(firstError){
    const message=String(firstError?.message||firstError||'');
    if(!/Shared Formula master/i.test(message))throw firstError;
    if(typeof JSZip==='undefined')throw new Error('La plantilla contiene formulas compartidas y no se cargo el componente de compatibilidad JSZip.');

    const zip=await JSZip.loadAsync(original);
    const sheetPaths=Object.keys(zip.files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
    for(const path of sheetPaths){
      const file=zip.file(path);
      if(!file)continue;
      let xml=await file.async('string');
      // Quita exclusivamente formulas de tipo shared; conserva valores, estilos,
      // combinaciones, imagenes, validaciones y el resto de la plantilla.
      xml=xml.replace(/<f[^>]*t="shared"[^>]*\/>/gi,'');
      xml=xml.replace(/<f[^>]*t="shared"[^>]*>[\s\S]*?<\/f>/gi,'');
      zip.file(path,xml);
    }
    const patched=await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
    const cleanBook=new ExcelJS.Workbook();
    await cleanBook.xlsx.load(patched);
    return cleanBook;
  }
}

const E472_PHOTO_TTL=60*60*24*365;
function e47Options(items,value=''){
  return '<option value="">N.A.</option>'+items.map(x=>`<option value="${escapeHtml(x)}" ${x===value?'selected':''}>${escapeHtml(x)}</option>`).join('');
}
function e47GroupedOptions(items,groups,value=''){
  let html='<option value="">N.A.</option>';
  for(const [code,label] of Object.entries(groups)){
    const subset=items.filter(x=>String(x).startsWith(code+'.'));
    if(!subset.length)continue;
    html+=`<optgroup label="${escapeHtml(label)}">`+subset.map(x=>`<option value="${escapeHtml(x)}" ${x===value?'selected':''}>${escapeHtml(x)}</option>`).join('')+'</optgroup>';
  }
  return html;
}
function e47FmtDate(v){if(!v)return '—';const [y,m,d]=String(v).slice(0,10).split('-');return `${d}/${m}/${y}`;}
function e47Code(n){return `IG-${String(n||0).padStart(6,'0')}`;}
function e47TypeLabel(v){return ({IP:'Inspección planeada',INP:'Inspección no planeada',IC:'Inspección cruzada'})[v]||v||'—';}
function e47StateLabel(v){return ({PENDIENTE_CORRECCION:'PENDIENTE DE CORRECCIÓN',PENDIENTE_VALIDACION:'PENDIENTE DE VALIDACIÓN',COMPLETADA:'COMPLETADA'})[v]||String(v||'').replaceAll('_',' ');}
function e47ItemStateLabel(v){return ({PENDIENTE:'PENDIENTE',ASIGNADO:'ASIGNADO',CORREO_ENVIADO:'CORREO ENVIADO',PENDIENTE_VALIDACION:'PENDIENTE DE VALIDACIÓN',CORRECCION_REQUERIDA:'CORRECCIÓN REQUERIDA',CERRADO:'CERRADO'})[v]||String(v||'').replaceAll('_',' ');}
async function e47Signed(path,seconds=3600){if(!path)return '';const {data,error}=await sb.storage.from('evidencias-ssomac').createSignedUrl(path,seconds);return error?'':(data?.signedUrl||'');}
function e47InspectionLiftLink(token){return `${getPublicAppBaseUrl()}/levantamiento-inspeccion.html?t=${encodeURIComponent(token)}`;}
function e47LocalYmd(d){if(!(d instanceof Date)||Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function e47DueFromPotential(base,potential){if(!base)return '';const d=parseYmdLocal(base);if(!d)return '';d.setDate(d.getDate()+(potential==='A'?1:potential==='B'?3:14));return e47LocalYmd(d);}

async function e47Init(){
  const session=await requireSession();if(!session)return;
  const ctx=await getAccessContextV43(session),profile=ctx.profile;
  const listCard=document.getElementById('e47ListCard'),formCard=document.getElementById('e47FormCard'),msg=document.getElementById('e47Message'),list=document.getElementById('e47List'),filterProject=document.getElementById('e47FilterProject'),filterStatus=document.getElementById('e47FilterStatus'),filterText=document.getElementById('e47FilterText'),form=document.getElementById('e47Form'),formMsg=document.getElementById('e47FormMessage'),projectEl=document.getElementById('e47Project'),placeEl=document.getElementById('e47Place'),areaEl=document.getElementById('e47Area'),itemsBox=document.getElementById('e47Items'),addItemBtn=document.getElementById('e47AddItem');
  const signaturePad=createSignaturePad(document.getElementById('e47Signature'),document.getElementById('e47ClearSignature'));
  let rows=[],editId=null,existingSignaturePath='',itemModels=[],projectAreas=[],projectPlaces=[];
  const projects=ctx.projects||[];
  const [{data:responsibles,error:re}]=await Promise.all([sb.from('responsables_correccion').select('id,proyecto_id,nombres,apellidos,cargo,area_nombre,email,aplica_todos_proyectos,activo').eq('activo',true).order('apellidos')]);
  if(re){showMessage(msg,'No se pudieron cargar los responsables: '+re.message);return;}
  const projectOptions=projects.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  filterProject.innerHTML=(ctx.isProject?'':'<option value="">Todos</option>')+projectOptions;projectEl.innerHTML='<option value="">Seleccione...</option>'+projectOptions;
  if(ctx.isProject&&projects.length===1){filterProject.value=projects[0].id;filterProject.disabled=true;projectEl.value=projects[0].id;projectEl.disabled=true;}
  document.getElementById('e47Inspector').value=`${profile.nombres||''} ${profile.apellidos||''}`.trim();document.getElementById('e47RecordName').value=`${profile.nombres||''} ${profile.apellidos||''}`.trim();document.getElementById('e47RecordRole').value=profile.cargo||'';document.getElementById('e47Date').value=today();document.getElementById('e47RecordDate').value=today();

  function emptyItem(){return{id:null,descripcion:'',causa_acto:'',causa_condicion:'',factor_trabajo:'',factor_personal:'',observacion_foto_ruta:'',accion_correctiva:'',responsable_id:'',responsable:'',potencial_riesgo:'C',fecha_limite:'',estado_levantamiento:'PENDIENTE',correccion_foto_ruta:'',fecha_correccion:'',levantamiento_comentario:'',levantamiento_firma_ruta:'',levantamiento_firmante:'',observacion_validacion:'',asignacion:null};}
  function availableResponsibles(){const pid=projectEl.value;return (responsibles||[]).filter(r=>r.aplica_todos_proyectos===true||(pid&&r.proyecto_id===pid));}
  function responsibleOptions(value=''){return '<option value="">Seleccione...</option>'+availableResponsibles().map(r=>{const name=`${r.nombres||''} ${r.apellidos||''}`.trim();return `<option value="${r.id}" ${r.id===value?'selected':''}>${escapeHtml(name)} · ${escapeHtml(r.cargo||'')} · ${escapeHtml(r.area_nombre||'SIN ÁREA')}</option>`;}).join('');}
  async function loadAreas(selected=''){
    projectAreas=[];if(!projectEl.value){areaEl.innerHTML='<option value="">N.A. / Sin área asociada</option>';areaEl.disabled=true;return;}
    try{projectAreas=await getProjectAreasV472(projectEl.value,false);areaEl.innerHTML='<option value="">N.A. / Sin área asociada</option>'+projectAreas.map(a=>`<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');areaEl.disabled=true;if(selected&&projectAreas.some(a=>a.id===selected))areaEl.value=selected;}
    catch(err){areaEl.innerHTML='<option value="">No se pudieron cargar las áreas / procesos</option>';areaEl.disabled=true;console.warn(err);}
  }
  async function loadPlaces(selected=''){
    projectPlaces=[];if(!projectEl.value){placeEl.innerHTML='<option value="">Selecciona primero el proyecto...</option>';placeEl.disabled=true;return;}
    try{projectPlaces=await getProjectPlacesV483(projectEl.value,false);placeEl.innerHTML='<option value="">Seleccione...</option>'+projectPlaces.map(l=>`<option value="${l.id}">${escapeHtml(l.nombre)}</option>`).join('');placeEl.disabled=false;if(selected&&projectPlaces.some(l=>l.id===selected))placeEl.value=selected;if(!projectPlaces.length)placeEl.innerHTML='<option value="">No hay lugares configurados para este proyecto</option>';syncPlaceArea();}
    catch(err){placeEl.innerHTML='<option value="">No se pudieron cargar los lugares</option>';placeEl.disabled=true;console.warn(err);}
  }
  function selectedPlace(){return projectPlaces.find(l=>l.id===placeEl.value)||null;}
  function syncPlaceArea(){const l=selectedPlace();areaEl.value=l?.area_proyecto_id||'';}
  function syncCauseMode(card,idx){
    const it=itemModels[idx],act=card.querySelector('[data-f="causa_acto"]'),cond=card.querySelector('[data-f="causa_condicion"]'),work=card.querySelector('[data-f="factor_trabajo"]'),personal=card.querySelector('[data-f="factor_personal"]');
    const hasAct=Boolean(act?.value),hasCond=Boolean(cond?.value);
    if(hasAct){cond.value='';it.causa_condicion='';cond.disabled=true;work.value='';it.factor_trabajo='';work.disabled=true;personal.disabled=false;act.disabled=false;}
    else if(hasCond){act.value='';it.causa_acto='';act.disabled=true;personal.value='';it.factor_personal='';personal.disabled=true;work.disabled=false;cond.disabled=false;}
    else{act.disabled=false;cond.disabled=false;work.disabled=true;personal.disabled=true;work.value='';personal.value='';it.factor_trabajo='';it.factor_personal='';}
  }
  async function hydrateEvidence(card,it){
    const pairs=[['observacion',it.observacion_foto_ruta],['correccion',it.correccion_foto_ruta],['firma',it.levantamiento_firma_ruta]];
    for(const [kind,path] of pairs){if(!path)continue;const url=await e47Signed(path);const box=card.querySelector(`[data-existing="${kind}"]`);if(box)box.innerHTML=url?`<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Evidencia"></a>`:'<span>No se pudo cargar.</span>';}
  }
  function renderItems(){
    itemsBox.innerHTML=itemModels.map((it,i)=>{const locked=Boolean(it.id);const state=it.estado_levantamiento||'PENDIENTE';return `
      <article class="e47-item-card" data-item-index="${i}">
        <div class="e47-item-head"><div><span>ITEM ${i+1}</span><strong>Observación / hallazgo de inspección</strong></div><span class="e47-status ${state}">${escapeHtml(e47ItemStateLabel(state))}</span>${!locked&&itemModels.length>1?`<button type="button" class="e47-remove-item" data-remove-item="${i}">Quitar</button>`:''}</div>
        <div class="field full"><label>Condición o práctica subestándar *</label><textarea rows="2" data-f="descripcion" ${locked?'disabled':''}>${escapeHtml(it.descripcion||'')}</textarea></div>
        <div class="e47-grid-2">
          <div class="field"><label>Causa inmediata · Acto subestándar</label><select data-f="causa_acto" ${locked?'disabled':''}>${e47Options(E47_ACT_CAUSES,it.causa_acto)}</select></div>
          <div class="field"><label>Causa inmediata · Condición subestándar</label><select data-f="causa_condicion" ${locked?'disabled':''}>${e47Options(E47_COND_CAUSES,it.causa_condicion)}</select></div>
          <div class="field"><label>Causa básica · Factor de trabajo</label><select data-f="factor_trabajo" ${locked?'disabled':''}>${e47GroupedOptions(E47_WORK_CAUSES,E47_WORK_GROUPS,it.factor_trabajo)}</select></div>
          <div class="field"><label>Causa básica · Factor personal</label><select data-f="factor_personal" ${locked?'disabled':''}>${e47GroupedOptions(E47_PERSONAL_CAUSES,E47_PERSONAL_GROUPS,it.factor_personal)}</select></div>
        </div>
        <div class="field"><label>Fotografía de la observación</label>${locked?'':`<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-file="observacion">`}<div class="e47-photo-preview" data-existing="observacion">${it.observacion_foto_ruta?'<span>Cargando fotografía...</span>':'<span>Sin fotografía</span>'}</div></div>
        <div class="field full"><label>Acción mitigadora / acción correctiva *</label><textarea rows="2" data-f="accion_correctiva" ${locked?'disabled':''}>${escapeHtml(it.accion_correctiva||'')}</textarea></div>
        <div class="e47-grid-3">
          <div class="field"><label>Responsable del levantamiento *</label><select data-f="responsable_id" ${locked?'disabled':''}>${responsibleOptions(it.responsable_id)}</select></div>
          <div class="field"><label>Potencial de riesgo *</label><select data-f="potencial_riesgo" ${locked?'disabled':''}><option value="A" ${it.potencial_riesgo==='A'?'selected':''}>A · Alto (24 h)</option><option value="B" ${it.potencial_riesgo==='B'?'selected':''}>B · Medio (72 h)</option><option value="C" ${it.potencial_riesgo==='C'?'selected':''}>C · Bajo (2 semanas)</option></select></div>
          <div class="field"><label>Fecha límite de levantamiento *</label><input type="date" data-f="fecha_limite" value="${escapeHtml(it.fecha_limite||'')}" ${locked?'disabled':''}></div>
        </div>
        ${locked?`<div class="e472-followup"><div class="e47-section-title">Seguimiento del levantamiento</div><div class="detail-grid"><div class="detail-item"><span>Responsable</span><strong>${escapeHtml(it.responsable||'—')}</strong></div><div class="detail-item"><span>Fecha límite</span><strong>${e47FmtDate(it.fecha_limite)}</strong></div>${it.levantamiento_comentario?`<div class="detail-item full"><span>Acción correctiva realizada</span><strong>${escapeHtml(it.levantamiento_comentario)}</strong></div>`:''}${it.levantamiento_firmante?`<div class="detail-item"><span>Levantado por</span><strong>${escapeHtml(it.levantamiento_firmante)}</strong></div>`:''}${it.fecha_correccion?`<div class="detail-item"><span>Fecha ejecutada</span><strong>${e47FmtDate(it.fecha_correccion)}</strong></div>`:''}${it.observacion_validacion?`<div class="detail-item full"><span>Observación de validación</span><strong>${escapeHtml(it.observacion_validacion)}</strong></div>`:''}</div>${it.correccion_foto_ruta?`<div class="e47-grid-2"><div class="field"><label>Fotografía del levantamiento</label><div class="e47-photo-preview" data-existing="correccion"><span>Cargando...</span></div></div><div class="field"><label>Firma del levantamiento</label><div class="e47-photo-preview" data-existing="firma"><span>Cargando...</span></div></div></div>`:''}${state==='PENDIENTE_VALIDACION'?`<div class="field full"><label>Observación de validación</label><textarea rows="2" data-validation-note="${it.id}" placeholder="Conformidad u observación..."></textarea></div><div class="workflow-actions"><button type="button" class="success" data-validate-item="${it.id}">Validar y cerrar</button><button type="button" class="warning" data-reject-item="${it.id}">Devolver a corrección</button></div>`:''}${['ASIGNADO','CORREO_ENVIADO','CORRECCION_REQUERIDA'].includes(state)?`<div class="workflow-actions"><button type="button" class="secondary" data-resend-item="${it.id}">Reenviar correo de levantamiento</button></div>`:''}</div>`:''}
      </article>`;}).join('');
    itemsBox.querySelectorAll('[data-item-index]').forEach(card=>{const idx=Number(card.dataset.itemIndex),it=itemModels[idx];card.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('change',()=>{it[el.dataset.f]=el.value;if(el.dataset.f==='causa_acto'||el.dataset.f==='causa_condicion')syncCauseMode(card,idx);if(el.dataset.f==='potencial_riesgo'){it.fecha_limite=e47DueFromPotential(document.getElementById('e47Date').value,it.potencial_riesgo);const due=card.querySelector('[data-f="fecha_limite"]');if(due)due.value=it.fecha_limite;}}));card.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('input',()=>{it[el.dataset.f]=el.value;}));const file=card.querySelector('[data-file="observacion"]');file?.addEventListener('change',()=>{const f=file.files?.[0];if(!f)return;it.observacion_file=f;const box=card.querySelector('[data-existing="observacion"]');box.innerHTML=`<img src="${URL.createObjectURL(f)}" alt="Vista previa">`;});const rm=card.querySelector('[data-remove-item]');rm?.addEventListener('click',()=>{itemModels.splice(idx,1);renderItems();});syncCauseMode(card,idx);hydrateEvidence(card,it);});
    itemsBox.querySelectorAll('[data-validate-item]').forEach(b=>b.addEventListener('click',()=>validateLift(b.dataset.validateItem,true)));
    itemsBox.querySelectorAll('[data-reject-item]').forEach(b=>b.addEventListener('click',()=>validateLift(b.dataset.rejectItem,false)));
    itemsBox.querySelectorAll('[data-resend-item]').forEach(b=>b.addEventListener('click',()=>resendEmail(b.dataset.resendItem,b)));
  }
  addItemBtn.addEventListener('click',()=>{if(editId){showMessage(formMsg,'Para conservar la trazabilidad, no se agregan nuevos ítems después de emitir la inspección.');return;}if(itemModels.length>=10){showMessage(formMsg,'El formato corporativo permite un máximo de 10 ítems.');return;}itemModels.push(emptyItem());renderItems();});
  projectEl.addEventListener('change',async()=>{await loadAreas();await loadPlaces();renderItems();});
  placeEl.addEventListener('change',syncPlaceArea);
  document.getElementById('e47Date').addEventListener('change',()=>{if(editId)return;itemModels.forEach(it=>{it.fecha_limite=e47DueFromPotential(document.getElementById('e47Date').value,it.potencial_riesgo);});renderItems();});

  function showList(){formCard.classList.add('hidden');listCard.classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});}
  function showForm(){listCard.classList.add('hidden');formCard.classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});}
  document.getElementById('e47Cancel').addEventListener('click',()=>{history.replaceState(null,'','inspecciones.html');showList();});document.getElementById('e47NewBtn').addEventListener('click',()=>openNew());
  async function openNew(){editId=null;existingSignaturePath='';form.reset();signaturePad?.clear();addItemBtn.disabled=false;document.getElementById('e47FormTitle').textContent='Nueva inspección general';document.getElementById('e47Inspector').value=`${profile.nombres||''} ${profile.apellidos||''}`.trim();document.getElementById('e47RecordName').value=`${profile.nombres||''} ${profile.apellidos||''}`.trim();document.getElementById('e47RecordRole').value=profile.cargo||'';document.getElementById('e47Date').value=today();document.getElementById('e47RecordDate').value=today();if(ctx.isProject&&projects.length===1)projectEl.value=projects[0].id;await loadAreas();await loadPlaces();itemModels=[emptyItem()];itemModels[0].fecha_limite=e47DueFromPotential(today(),'C');renderItems();showMessage(formMsg,'');showForm();}
  async function getFull(id){const {data,error}=await sb.from('inspecciones_generales').select(`*,proyecto:proyectos(id,nombre,codigo),areaProyecto:areas_proyecto(id,nombre),lugar:lugares_proyecto(id,nombre,area_proyecto_id),items:inspeccion_general_items(*)`).eq('id',id).single();if(error)throw error;data.items=(data.items||[]).sort((a,b)=>a.item_no-b.item_no);if(data.items.length){const ids=data.items.map(x=>x.id);const {data:asigs}=await sb.from('inspeccion_general_asignaciones').select('id,item_id,responsable_id,token,fecha_limite,estado,correo_enviado_en').in('item_id',ids);const map=new Map((asigs||[]).map(a=>[a.item_id,a]));data.items.forEach(x=>x.asignacion=map.get(x.id)||null);}return data;}
  async function openEdit(id){showMessage(formMsg,'Cargando...',true);try{const data=await getFull(id);editId=id;existingSignaturePath=data.firma_ruta||'';signaturePad?.clear();addItemBtn.disabled=true;document.getElementById('e47FormTitle').textContent=`Seguimiento ${e47Code(data.numero)}`;projectEl.value=data.proyecto_id;await loadAreas(data.area_proyecto_id||'');await loadPlaces(data.lugar_id||'');if(!data.lugar_id&&data.area_inspeccionada){const m=projectPlaces.find(l=>String(l.nombre||'').trim().toUpperCase()===String(data.area_inspeccionada||'').trim().toUpperCase());if(m){placeEl.value=m.id;syncPlaceArea();}}document.getElementById('e47Inspector').value=data.inspector_nombre||'';document.getElementById('e47Date').value=data.fecha_inspeccion||today();document.getElementById('e47Type').value=data.tipo_inspeccion||'IP';document.getElementById('e47Workers').value=data.numero_trabajadores??'';document.getElementById('e47RecordName').value=data.responsable_registro_nombre||'';document.getElementById('e47RecordRole').value=data.responsable_registro_cargo||'';document.getElementById('e47RecordDate').value=data.responsable_registro_fecha||today();itemModels=data.items.length?data.items.map(x=>({...emptyItem(),...x,responsable_id:x.responsable_id||x.asignacion?.responsable_id||'',fecha_limite:x.fecha_limite||x.asignacion?.fecha_limite||''})):[emptyItem()];renderItems();const sigBox=document.getElementById('e47ExistingSignature');sigBox.innerHTML='';if(existingSignaturePath){const url=await e47Signed(existingSignaturePath);sigBox.innerHTML=url?`<span>Firma registrada</span><img src="${url}" alt="Firma registrada">`:'<span>Firma existente registrada.</span>';}showMessage(formMsg,'');showForm();}catch(err){showMessage(msg,'No se pudo abrir la inspección: '+err.message);}}
  async function uploadImage(file,path){if(!file)return null;const blob=await optimizeImage(file);const {error}=await sb.storage.from('evidencias-ssomac').upload(path,blob,{contentType:'image/webp',upsert:false});if(error)throw error;return path;}
  async function preparePublicPhoto(assignmentId,path){if(!assignmentId||!path)return;const {data,error}=await sb.storage.from('evidencias-ssomac').createSignedUrl(path,E472_PHOTO_TTL);if(error)throw error;const exp=new Date(Date.now()+E472_PHOTO_TTL*1000).toISOString();const {error:ue}=await sb.from('inspeccion_general_asignaciones').update({url_foto_observacion_firmada:data?.signedUrl||null,foto_observacion_url_expira_en:exp}).eq('id',assignmentId);if(ue)throw ue;}
  async function sendItemEmail(inspection,item,assignment){const resp=(responsibles||[]).find(r=>r.id===item.responsable_id);if(!resp?.email)throw new Error('El responsable no tiene correo configurado.');const project=projects.find(p=>p.id===inspection.proyecto_id),area=projectAreas.find(a=>a.id===inspection.area_proyecto_id);await preparePublicPhoto(assignment.asignacion_id,item.observacion_foto_ruta);await sendAssignmentEmail({codigo_reporte:`${e47Code(inspection.numero)} / Ítem ${item.item_no}`,correo_responsable:resp.email,nombre_responsable:`${resp.nombres||''} ${resp.apellidos||''}`.trim(),proyecto:project?.nombre||'',fecha:e47FmtDate(inspection.fecha_inspeccion),lugar:selectedPlace()?.nombre||inspection.area_inspeccionada||'',tipo_hallazgo:item.causa_acto?'ACTO SUBESTÁNDAR':'CONDICIÓN SUBESTÁNDAR',descripcion:item.descripcion||'',accion:item.accion_correctiva||'',fecha_limite:e47FmtDate(item.fecha_limite),link_levantamiento:e47InspectionLiftLink(assignment.token)});await sb.rpc('marcar_correo_inspeccion_general',{p_asignacion_id:assignment.asignacion_id});}
  async function resendEmail(itemId,button){const it=itemModels.find(x=>x.id===itemId);if(!it?.asignacion)return;const old=button.textContent;button.disabled=true;button.textContent='Enviando...';try{const inspection={id:editId,numero:Number((document.getElementById('e47FormTitle').textContent.match(/\d+/)||['0'])[0]),proyecto_id:projectEl.value,area_proyecto_id:areaEl.value||null,lugar_id:placeEl.value||null,area_inspeccionada:selectedPlace()?.nombre||'',fecha_inspeccion:document.getElementById('e47Date').value};await sendItemEmail(inspection,it,{asignacion_id:it.asignacion.id,token:it.asignacion.token});showMessage(formMsg,'Correo reenviado correctamente.',true);}catch(err){showMessage(formMsg,'No se pudo reenviar: '+(err.message||err));}finally{button.disabled=false;button.textContent=old;}}
  async function validateLift(itemId,approve){const note=itemsBox.querySelector(`[data-validation-note="${itemId}"]`)?.value.trim()||'';if(!approve&&note.length<5){showMessage(formMsg,'Indica el motivo de devolución.');return;}try{const {error}=await sb.rpc('validar_levantamiento_inspeccion_general',{p_item_id:itemId,p_aprobar:approve,p_observacion:note||null});if(error)throw error;showMessage(formMsg,approve?'Levantamiento validado y cerrado.':'Levantamiento devuelto al responsable.',true);await openEdit(editId);await loadRows();}catch(err){showMessage(formMsg,'No se pudo actualizar: '+(err.message||err));}}

  form.addEventListener('submit',async e=>{e.preventDefault();showMessage(formMsg,'');itemModels.forEach((it,i)=>{document.querySelectorAll(`[data-item-index="${i}"] [data-f]`).forEach(el=>{if(!el.disabled)it[el.dataset.f]=el.value;});});const populated=itemModels.filter(it=>String(it.descripcion||'').trim());if(!projectEl.value||!placeEl.value||!document.getElementById('e47Inspector').value.trim()||!populated.length){showMessage(formMsg,'Completa proyecto, lugar / ubicación y registra al menos una observación.');return;}if(!editId){for(const [i,it] of populated.entries()){if(!it.causa_acto&&!it.causa_condicion){showMessage(formMsg,`Selecciona Acto o Condición en el ítem ${i+1}.`);return;}if(it.causa_acto&&!it.factor_personal){showMessage(formMsg,`Selecciona Factor personal en el ítem ${i+1}.`);return;}if(it.causa_condicion&&!it.factor_trabajo){showMessage(formMsg,`Selecciona Factor de trabajo en el ítem ${i+1}.`);return;}if(!String(it.accion_correctiva||'').trim()||!it.responsable_id||!it.potencial_riesgo||!it.fecha_limite){showMessage(formMsg,`Completa acción, responsable, potencial y fecha límite del ítem ${i+1}.`);return;}}if(signaturePad?.isEmpty()){showMessage(formMsg,'Registra la firma del responsable del registro.');return;}}
    const btn=document.getElementById('e47Save');btn.disabled=true;btn.textContent='Guardando...';try{const place=selectedPlace();const header={proyecto_id:projectEl.value,lugar_id:placeEl.value,area_proyecto_id:place?.area_proyecto_id||null,area_inspeccionada:place?.nombre||'',inspector_nombre:document.getElementById('e47Inspector').value.trim(),fecha_inspeccion:document.getElementById('e47Date').value,tipo_inspeccion:document.getElementById('e47Type').value,numero_trabajadores:document.getElementById('e47Workers').value?Number(document.getElementById('e47Workers').value):null,responsable_registro_nombre:document.getElementById('e47RecordName').value.trim(),responsable_registro_cargo:document.getElementById('e47RecordRole').value.trim()||null,responsable_registro_fecha:document.getElementById('e47RecordDate').value};let inspection;if(editId){const {data,error}=await sb.from('inspecciones_generales').update(header).eq('id',editId).select('id,numero,proyecto_id,lugar_id,area_proyecto_id,area_inspeccionada,fecha_inspeccion').single();if(error)throw error;inspection=data;}else{const {data,error}=await sb.from('inspecciones_generales').insert({...header,creado_por_id:session.user.id}).select('id,numero,proyecto_id,lugar_id,area_proyecto_id,area_inspeccionada,fecha_inspeccion').single();if(error)throw error;inspection=data;editId=data.id;}
      let firmaPath=existingSignaturePath;if(signaturePad&&!signaturePad.isEmpty()){const blob=await signaturePad.toBlob();firmaPath=`inspecciones-generales/${inspection.id}/firma/${Date.now()}_${uid()}.webp`;const {error}=await sb.storage.from('evidencias-ssomac').upload(firmaPath,blob,{contentType:'image/webp',upsert:false});if(error)throw error;await sb.from('inspecciones_generales').update({firma_ruta:firmaPath}).eq('id',inspection.id);existingSignaturePath=firmaPath;}
      let sent=0,warnings=[];
      if(!itemModels.some(x=>x.id)){for(let i=0;i<populated.length;i++){const it=populated[i],resp=(responsibles||[]).find(r=>r.id===it.responsable_id);let obs=null;if(it.observacion_file)obs=await uploadImage(it.observacion_file,`inspecciones-generales/${inspection.id}/item-${i+1}/observacion/${Date.now()}_${uid()}.webp`);const payload={inspeccion_id:inspection.id,item_no:i+1,descripcion:String(it.descripcion||'').trim(),causa_acto:it.causa_acto||null,causa_condicion:it.causa_condicion||null,factor_trabajo:it.factor_trabajo||null,factor_personal:it.factor_personal||null,observacion_foto_ruta:obs,accion_correctiva:String(it.accion_correctiva||'').trim(),responsable_id:it.responsable_id,responsable:resp?`${resp.nombres||''} ${resp.apellidos||''}`.trim():'',potencial_riesgo:it.potencial_riesgo,fecha_limite:it.fecha_limite,estado_levantamiento:'PENDIENTE'};const {data:row,error}=await sb.from('inspeccion_general_items').insert(payload).select('*').single();if(error)throw error;const {data:ad,error:ae}=await sb.rpc('crear_asignacion_inspeccion_general',{p_item_id:row.id,p_responsable_id:it.responsable_id,p_fecha_limite:it.fecha_limite});if(ae)throw ae;const assignment=Array.isArray(ad)?ad[0]:ad;try{await sendItemEmail(inspection,{...row,responsable_id:it.responsable_id,item_no:i+1},assignment);sent++;}catch(mailErr){warnings.push(`Ítem ${i+1}: ${mailErr.message||mailErr}`);}}await sb.rpc('e472_actualizar_estado_inspeccion',{p_inspeccion_id:inspection.id});}
      showMessage(formMsg,`Inspección ${e47Code(inspection.numero)} guardada.${sent?` ${sent} correo(s) de levantamiento enviado(s).`:''}${warnings.length?' '+warnings.join(' | '):''}`,warnings.length===0);await loadRows();setTimeout(()=>{location.href=`inspecciones.html?id=${inspection.id}`;},warnings.length?2500:700);
    }catch(err){console.error(err);showMessage(formMsg,'No se pudo guardar: '+(err.message||err));}finally{btn.disabled=false;btn.textContent='Guardar inspección';}
  });

  async function loadRows(){const {data,error}=await sb.from('inspecciones_generales').select(`id,numero,proyecto_id,lugar_id,inspector_nombre,area_inspeccionada,fecha_inspeccion,tipo_inspeccion,estado,actualizado_en,proyecto:proyectos(id,nombre),areaProyecto:areas_proyecto(id,nombre),lugar:lugares_proyecto(id,nombre)`).order('numero',{ascending:false});if(error){showMessage(msg,'No se pudieron cargar las inspecciones: '+error.message);return;}rows=data||[];renderList();}
  function renderList(){const q=(filterText.value||'').trim().toLowerCase(),p=filterProject.value,s=filterStatus.value;const f=rows.filter(r=>(!p||r.proyecto_id===p)&&(!s||r.estado===s)&&(!q||`${e47Code(r.numero)} ${r.proyecto?.nombre||''} ${r.inspector_nombre||''} ${r.lugar?.nombre||r.area_inspeccionada||''} ${r.areaProyecto?.nombre||''}`.toLowerCase().includes(q)));document.getElementById('e47KpiTotal').textContent=rows.length;document.getElementById('e47KpiPending').textContent=rows.filter(r=>r.estado!=='COMPLETADA').length;document.getElementById('e47KpiClosed').textContent=rows.filter(r=>r.estado==='COMPLETADA').length;list.innerHTML=f.length?f.map(r=>`<article class="e47-list-card"><div><div class="e47-list-top"><strong>${e47Code(r.numero)} · ${escapeHtml(r.proyecto?.nombre||'')}</strong><span class="e47-status ${r.estado}">${escapeHtml(e47StateLabel(r.estado))}</span></div><h3>${escapeHtml(r.lugar?.nombre||r.area_inspeccionada||'')}</h3><div class="occurrence-meta"><span>Área / proceso: ${escapeHtml(r.areaProyecto?.nombre||'N.A.')}</span></div><div class="occurrence-meta"><span>${e47FmtDate(r.fecha_inspeccion)}</span><span>${escapeHtml(e47TypeLabel(r.tipo_inspeccion))}</span><span>Inspector: ${escapeHtml(r.inspector_nombre||'')}</span></div></div><div class="e47-list-actions"><button type="button" class="secondary" data-e47-edit="${r.id}">Ver / seguimiento</button><button type="button" data-e47-excel="${r.id}">Descargar Excel</button><button type="button" class="secondary" data-e47-pdf="${r.id}">Descargar PDF</button></div></article>`).join(''):'<div class="list-item">No hay inspecciones con esos filtros.</div>';list.querySelectorAll('[data-e47-edit]').forEach(b=>b.addEventListener('click',()=>openEdit(b.dataset.e47Edit)));list.querySelectorAll('[data-e47-excel]').forEach(b=>b.addEventListener('click',()=>exportExcel(b.dataset.e47Excel,b)));list.querySelectorAll('[data-e47-pdf]').forEach(b=>b.addEventListener('click',()=>exportPdf(b.dataset.e47Pdf,b)));}
  filterProject.addEventListener('change',renderList);filterStatus.addEventListener('change',renderList);filterText.addEventListener('input',renderList);
  function excelDate(v){if(!v)return null;const [y,m,d]=String(v).slice(0,10).split('-').map(Number);return new Date(y,m-1,d);}
  function e47CellPx(sheet,colIndex){const w=Number(sheet.getColumn(colIndex).width||10);return Math.max(28,Math.round(w*7));}
  function e47RowPx(sheet,rowIndex){const h=Number(sheet.getRow(rowIndex).height||93);return Math.max(26,Math.round(h*96/72));}
  function e47CenterCell(cell,{bold=false,size=null}={}){cell.alignment={horizontal:'center',vertical:'middle',wrapText:true,shrinkToFit:true};if(bold||size){cell.font={...(cell.font||{}),...(bold?{bold:true}:{}),...(size?{size}: {})};}}
  function e47ThinBorder(){return {top:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};}
  async function e47ImageSize(dataUrl){return await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth||img.width||1,height:img.naturalHeight||img.height||1});img.onerror=()=>resolve({width:1,height:1});img.src=dataUrl;});}
  async function insertExcelImageCentered(book,sheet,path,col,row,maxWidth=150,maxHeight=80){if(!path)return;const url=await e47Signed(path,1800);if(!url)return;const png=await urlImageToPngDataUrl(url);if(!png)return;const dim=await e47ImageSize(png);const cellW=e47CellPx(sheet,col),cellH=e47RowPx(sheet,row);const allowedW=Math.max(24,Math.min(maxWidth,cellW-12)),allowedH=Math.max(24,Math.min(maxHeight,cellH-12));const scale=Math.min(allowedW/dim.width,allowedH/dim.height);const width=Math.max(1,dim.width*scale),height=Math.max(1,dim.height*scale);const x=Math.max(0,(cellW-width)/2),y=Math.max(0,(cellH-height)/2);const id=book.addImage({base64:png,extension:'png'});sheet.addImage(id,{tl:{col:(col-1)+(x/cellW),row:(row-1)+(y/cellH)},ext:{width,height},editAs:'oneCell'});}
  async function insertExcelImageCenteredRange(book,sheet,path,startCol,endCol,startRow,endRow,maxWidth=200,maxHeight=55){if(!path)return;const url=await e47Signed(path,1800);if(!url)return;const png=await urlImageToPngDataUrl(url);if(!png)return;const dim=await e47ImageSize(png);let totalW=0,totalH=0;for(let c=startCol;c<=endCol;c++)totalW+=e47CellPx(sheet,c);for(let r=startRow;r<=endRow;r++)totalH+=e47RowPx(sheet,r);const allowedW=Math.max(24,Math.min(maxWidth,totalW-12)),allowedH=Math.max(24,Math.min(maxHeight,totalH-8));const scale=Math.min(allowedW/dim.width,allowedH/dim.height);const width=Math.max(1,dim.width*scale),height=Math.max(1,dim.height*scale);const x=Math.max(0,(totalW-width)/2),y=Math.max(0,(totalH-height)/2);const startCellW=e47CellPx(sheet,startCol),startRowH=e47RowPx(sheet,startRow);const id=book.addImage({base64:png,extension:'png'});sheet.addImage(id,{tl:{col:(startCol-1)+(x/startCellW),row:(startRow-1)+(y/startRowH)},ext:{width,height},editAs:'oneCell'});}
  function e47PrepareRiskCells(sheet,row){try{sheet.unMergeCells(`L${row}:N${row}`);}catch{}for(const col of ['L','M','N']){const cell=sheet.getCell(`${col}${row}`);cell.border=e47ThinBorder();e47CenterCell(cell,{bold:true,size:14});}}
  function e47StyleItemRow(sheet,row){for(const col of ['A','B','C','D','E','F','G','H','J','K','O'])e47CenterCell(sheet.getCell(`${col}${row}`));sheet.getCell(`A${row}`).font={...(sheet.getCell(`A${row}`).font||{}),bold:true};sheet.getCell(`B${row}`).alignment={horizontal:'center',vertical:'middle',wrapText:true,shrinkToFit:true};for(const col of ['C','D','E','F']){sheet.getCell(`${col}${row}`).alignment={horizontal:'center',vertical:'middle',wrapText:true,shrinkToFit:true};}sheet.getCell(`H${row}`).alignment={horizontal:'center',vertical:'middle',wrapText:true,shrinkToFit:true};sheet.getCell(`K${row}`).alignment={horizontal:'center',vertical:'middle',wrapText:true,shrinkToFit:true};sheet.getCell(`O${row}`).alignment={horizontal:'center',vertical:'middle',wrapText:true,shrinkToFit:true};}
  function e47InspectionTypeExcel(sheet,type){const rows=[['IP','G8','INSPECIONES PLANEADAS: IP'],['INP','G9','INSPECCIONES NO PLANEADAS: INP'],['IC','G10','INSPECCIONES CRUZADAS: IC']];for(const [code,ref,label] of rows){const cell=sheet.getCell(ref);cell.value=(type===code?'X   ':'    ')+label;cell.alignment={horizontal:'left',vertical:'middle',wrapText:true,shrinkToFit:true};cell.font={...(cell.font||{}),bold:type===code};}}
  async function exportExcel(id,button=null){const old=button?.textContent;if(button){button.disabled=true;button.textContent='Generando...';}try{if(typeof ExcelJS==='undefined')throw new Error('No se cargó el generador de Excel.');const data=await getFull(id);const book=await e47LoadCorporateTemplate();const sheet=book.getWorksheet('EDP-SIG-SSOMAC-RE-PA-191-03')||book.worksheets[0];
      sheet.getCell('C8').value=data.inspector_nombre||'';sheet.getCell('C9').value=data.lugar?.nombre||data.area_inspeccionada||'';sheet.getCell('C10').value=excelDate(data.fecha_inspeccion);sheet.getCell('C10').numFmt='dd/mm/yyyy';sheet.getCell('E10').value=e47Code(data.numero);if(data.numero_trabajadores!=null)sheet.getCell('K6').value=Number(data.numero_trabajadores);
      for(const ref of ['C8','C9','C10','E10','K6'])e47CenterCell(sheet.getCell(ref),{bold:['C8','C9','E10'].includes(ref)});e47InspectionTypeExcel(sheet,data.tipo_inspeccion);
      const items=(data.items||[]).filter(it=>String(it.descripcion||'').trim()||it.observacion_foto_ruta||it.correccion_foto_ruta||it.accion_correctiva||it.responsable);const used=Math.min(10,items.length);
      for(let i=0;i<used;i++){const row=14+i,it=items[i];sheet.getRow(row).hidden=false;sheet.getCell(`A${row}`).value=i+1;sheet.getCell(`B${row}`).value=it.descripcion||'';sheet.getCell(`C${row}`).value=it.causa_acto||'';sheet.getCell(`D${row}`).value=it.causa_condicion||'';sheet.getCell(`E${row}`).value=it.factor_trabajo||'';sheet.getCell(`F${row}`).value=it.factor_personal||'';sheet.getCell(`H${row}`).value=it.accion_correctiva||'';sheet.getCell(`K${row}`).value=it.responsable||'';e47PrepareRiskCells(sheet,row);sheet.getCell(`L${row}`).value=it.potencial_riesgo==='A'?'X':'';sheet.getCell(`M${row}`).value=it.potencial_riesgo==='B'?'X':'';sheet.getCell(`N${row}`).value=it.potencial_riesgo==='C'?'X':'';if(it.fecha_correccion){sheet.getCell(`O${row}`).value=excelDate(it.fecha_correccion);sheet.getCell(`O${row}`).numFmt='dd/mm/yyyy';}else sheet.getCell(`O${row}`).value='';e47StyleItemRow(sheet,row);await insertExcelImageCentered(book,sheet,it.observacion_foto_ruta,7,row,155,88);await insertExcelImageCentered(book,sheet,it.correccion_foto_ruta,10,row,145,88);}
      for(let row=14+used;row<=23;row++){sheet.getRow(row).hidden=true;}
      sheet.getCell('C25').value=data.responsable_registro_nombre||'';sheet.getCell('C26').value=data.responsable_registro_cargo||'';sheet.getCell('F26').value='FECHA: '+e47FmtDate(data.responsable_registro_fecha);for(const ref of ['C25','C26','F26'])e47CenterCell(sheet.getCell(ref));if(data.firma_ruta)await insertExcelImageCenteredRange(book,sheet,data.firma_ruta,6,15,25,25,220,34);
      sheet.pageSetup.orientation='landscape';sheet.pageSetup.fitToPage=true;sheet.pageSetup.fitToWidth=1;sheet.pageSetup.fitToHeight=1;sheet.pageSetup.printArea='A1:O26';
      const buffer=await book.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;const safe=(data.proyecto?.nombre||'PROYECTO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'-');a.download=`EDP-SIG-SSOMAC-RE-PA-191-03_${e47Code(data.numero)}_${safe}_${data.fecha_inspeccion}.xlsx`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    }catch(err){console.error(err);showMessage(msg,'No se pudo generar el Excel: '+(err.message||err));}finally{if(button){button.disabled=false;button.textContent=old;}}}
  async function e47PdfDataUrl(path){if(!path)return '';const url=await e47Signed(path,1800);if(!url)return '';return await urlImageToPngDataUrl(url)||'';}
  async function e47WaitImages(root){const imgs=[...root.querySelectorAll('img')];await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;})));}
  function e47PdfRisk(it,code){return it.potencial_riesgo===code?'X':'';}
  async function exportPdf(id,button=null){
    const old=button?.textContent;
    if(button){button.disabled=true;button.textContent='Generando PDF...';}
    let report=null;
    try{
      if(typeof html2canvas==='undefined'||!window.jspdf?.jsPDF)throw new Error('No se cargaron los componentes para generar PDF.');

      const data=await getFull(id);
      const items=(data.items||[]).filter(it=>
        String(it.descripcion||'').trim()||
        it.observacion_foto_ruta||
        it.correccion_foto_ruta||
        it.accion_correctiva||
        it.responsable
      );

      const enriched=[];
      for(const it of items){
        enriched.push({
          ...it,
          obsData:await e47PdfDataUrl(it.observacion_foto_ruta),
          corrData:await e47PdfDataUrl(it.correccion_foto_ruta)
        });
      }

      const sig=await e47PdfDataUrl(data.firma_ruta);

      let logo='';
      try{
        logo=await urlImageToPngDataUrl('assets/img/logo-corporativo.jpg')||'';
      }catch(_){
        try{logo=typeof EXPLO_LOGO_BASE64!=='undefined'?EXPLO_LOGO_BASE64:'';}catch(__){logo='';}
      }

      const typeRow=(code,label)=>`
        <div class="e47p-type-row">
          <span class="e47p-type-label">${label}</span>
          <span class="e47p-check">${data.tipo_inspeccion===code?'X':''}</span>
        </div>`;

      report=document.createElement('div');
      report.className='e47-pdf-report';
      report.innerHTML=`<style>
        .e47-pdf-report{
          position:absolute;left:-24000px;top:0;
          width:2100px;background:#fff;color:#000;
          font-family:Arial,Helvetica,sans-serif;
          padding:8px;box-sizing:border-box
        }
        .e47-pdf-report table{
          border-collapse:collapse;width:100%;table-layout:fixed
        }
        .e47-pdf-report td,.e47-pdf-report th{
          border:1.35px solid #111;
          padding:5px;
          text-align:center;vertical-align:middle;
          word-break:normal;overflow-wrap:break-word;
          box-sizing:border-box
        }
        .e47p-logo{
          padding:2px!important;
          background:#fff
        }
        .e47p-logo img{
          display:block;
          max-width:180px;
          max-height:75px;
          margin:0 auto;
          object-fit:contain
        }
        .e47p-sig{
          font-size:18px;font-weight:800
        }
        .e47p-form-title{
          font-size:20px;font-weight:800
        }
        .e47p-doc-label{
          font-size:11px;font-weight:800;background:#f2f2f2
        }
        .e47p-doc-value{
          font-size:11px;font-weight:700
        }
        .e47p-company-head{
          background:#d9d9d9;
          font-size:10px;font-weight:800
        }
        .e47p-company-value{
          font-size:11px;font-weight:700
        }
        .e47p-dark{
          background:#555;color:#fff;font-weight:800
        }
        .e47p-label{
          background:#d9d9d9;
          text-align:left!important;
          font-weight:800
        }
        .e47p-meta{
          font-size:12px;font-weight:700
        }
        .e47p-type-row{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          min-height:32px
        }
        .e47p-type-label{
          flex:1;
          text-align:left;
          font-weight:800
        }
        .e47p-check{
          width:28px;height:28px;
          display:inline-flex;
          align-items:center;justify-content:center;
          border:1.5px solid #111;
          font-size:20px;font-weight:900;
          flex:0 0 auto
        }
        .e47p-risk-a{background:#ff1f16;font-size:11px}
        .e47p-risk-b{background:#ffe400;font-size:11px}
        .e47p-risk-c{background:#00bf62;font-size:11px}
        .e47p-spacer td{height:9px;padding:0}
        .e47p-head{
          background:#d9d9d9;
          font-weight:800;font-size:10px
        }
        .e47p-item td{
          height:138px;
          font-size:10px;
          line-height:1.25
        }
        .e47p-img{
          display:block;
          max-width:98%;
          max-height:124px;
          margin:auto;
          object-fit:contain
        }
        .e47p-x{
          font-size:20px;font-weight:900
        }
        .e47p-footer{
          margin-top:7px
        }
        .e47p-sign{
          max-width:240px;
          max-height:58px;
          object-fit:contain;
          display:block;
          margin:3px auto
        }
        .e47p-resp-title{
          background:#555;color:#fff;
          font-weight:800;font-size:12px
        }
        .e47p-small{font-size:9px}
      </style>

      <table class="e47p-sheet">
        <tr>
          <td rowspan="4" colspan="2" class="e47p-logo">
            ${logo?`<img src="${logo}" alt="Explo Drilling Perú">`:''}
          </td>
          <td rowspan="2" colspan="10" class="e47p-sig">SIG - SSOMAC</td>
          <td colspan="2" class="e47p-doc-label">Código:</td>
          <td class="e47p-doc-value">EDP-SIG-SSOMAC-RE-EA-191</td>
        </tr>
        <tr>
          <td colspan="2" class="e47p-doc-label">N°:</td>
          <td class="e47p-doc-value">3</td>
        </tr>
        <tr>
          <td rowspan="2" colspan="10" class="e47p-form-title">FORMATO DE INSPECCIONES</td>
          <td colspan="2" class="e47p-doc-label">Versión:</td>
          <td class="e47p-doc-value">5</td>
        </tr>
        <tr>
          <td colspan="2" class="e47p-doc-label">Fecha Act:</td>
          <td class="e47p-doc-value">Jul-25</td>
        </tr>

        <tr class="e47p-company-head">
          <td colspan="3">RAZÓN SOCIAL O DENOMINACIÓN SOCIAL</td>
          <td>RUC</td>
          <td colspan="2">DOMICILIO (Dirección, distrito, departamento, provincia)</td>
          <td colspan="4">ACTIVIDAD ECONÓMICA</td>
          <td colspan="5">Nº TRABAJADORES EN EL CENTRO LABORAL</td>
        </tr>
        <tr class="e47p-company-value">
          <td colspan="3">EXPLO DRILLING PERU S.R.L.</td>
          <td>20527775851</td>
          <td colspan="2">Las Acacias I-7, Urb. La Capitana, Lurigancho - Huachipa, Lima.</td>
          <td colspan="4">Perforación Diamantina</td>
          <td colspan="5">${data.numero_trabajadores!=null?escapeHtml(String(data.numero_trabajadores)):''}</td>
        </tr>

        <tr>
          <td colspan="6"></td>
          <td colspan="3" class="e47p-dark">TIPO DE INSPECCIÓN</td>
          <td colspan="6" class="e47p-dark">MEDIDAS CORRECTIVAS</td>
        </tr>
        <tr>
          <td colspan="2" class="e47p-label">Nombre del Inspector:</td>
          <td colspan="4" class="e47p-meta">${escapeHtml(data.inspector_nombre||'')}</td>
          <td colspan="3">${typeRow('IP','INSPECCIONES PLANEADAS: IP')}</td>
          <td colspan="6" class="e47p-risk-a"><strong>A (Alto)</strong> Muerte de varias personas: la acción correctiva deberá ser tomada de inmediato y terminada antes de las 24 horas.</td>
        </tr>
        <tr>
          <td colspan="2" class="e47p-label">Área Inspeccionada:</td>
          <td colspan="4" class="e47p-meta">${escapeHtml(data.lugar?.nombre||data.area_inspeccionada||'')}</td>
          <td colspan="3">${typeRow('INP','INSPECCIONES NO PLANEADAS: INP')}</td>
          <td colspan="6" class="e47p-risk-b"><strong>B (Medio)</strong> Múltiples lesiones irreversibles: la acción correctiva deberá ser completada antes de 72 horas.</td>
        </tr>
        <tr>
          <td colspan="2" class="e47p-label">Fecha de Inspección:</td>
          <td colspan="2" class="e47p-meta">${escapeHtml(e47FmtDate(data.fecha_inspeccion))}</td>
          <td colspan="2" class="e47p-label">Número de inspección:</td>
          <td class="e47p-meta">${escapeHtml(e47Code(data.numero))}</td>
          <td colspan="2">${typeRow('IC','INSPECCIONES CRUZADAS: IC')}</td>
          <td colspan="6" class="e47p-risk-c"><strong>C (Bajo)</strong> Lesión leve / no lesión: la acción correctiva deberá ser completada antes de dos semanas.</td>
        </tr>
        <tr class="e47p-spacer"><td colspan="15"></td></tr>
      </table>

      <table class="e47p-items">
        <colgroup>
          <col style="width:4%">
          <col style="width:14%">
          <col style="width:8.5%">
          <col style="width:8.5%">
          <col style="width:9%">
          <col style="width:9%">
          <col style="width:11%">
          <col style="width:11%">
          <col style="width:11%">
          <col style="width:9.5%">
          <col style="width:3%">
          <col style="width:3%">
          <col style="width:3%">
          <col style="width:9.5%">
        </colgroup>
        <tr class="e47p-head">
          <th rowspan="2">ITEM</th>
          <th rowspan="2">CONDICIÓN O PRÁCTICA SUB ESTÁNDAR<br>(Describir la observación)</th>
          <th colspan="2">CAUSA INMEDIATA</th>
          <th colspan="2">CAUSAS BÁSICAS</th>
          <th rowspan="2">OBSERVACIÓN<br>(Colocar imagen)</th>
          <th rowspan="2">ACCIÓN MITIGADORA / ACCIÓN CORRECTIVA</th>
          <th rowspan="2">CORRECCIÓN EJECUTADA<br>(Colocar imagen)</th>
          <th rowspan="2">RESPONSABLE</th>
          <th colspan="3">POTENCIAL DE RIESGO</th>
          <th rowspan="2">FECHA DE CORRECCIÓN</th>
        </tr>
        <tr class="e47p-head">
          <th>ACTOS SUB ESTÁNDARES</th>
          <th>CONDICIONES SUB ESTÁNDARES</th>
          <th>FACTORES DE TRABAJO</th>
          <th>FACTORES PERSONALES</th>
          <th>A</th><th>B</th><th>C</th>
        </tr>
        ${enriched.map((it,i)=>`
          <tr class="e47p-item">
            <td>${i+1}</td>
            <td>${escapeHtml(it.descripcion||'')}</td>
            <td>${escapeHtml(it.causa_acto||'')}</td>
            <td>${escapeHtml(it.causa_condicion||'')}</td>
            <td>${escapeHtml(it.factor_trabajo||'')}</td>
            <td>${escapeHtml(it.factor_personal||'')}</td>
            <td>${it.obsData?`<img class="e47p-img" src="${it.obsData}">`:''}</td>
            <td>${escapeHtml(it.accion_correctiva||'')}</td>
            <td>${it.corrData?`<img class="e47p-img" src="${it.corrData}">`:''}</td>
            <td>${escapeHtml(it.responsable||'')}</td>
            <td class="e47p-x">${e47PdfRisk(it,'A')}</td>
            <td class="e47p-x">${e47PdfRisk(it,'B')}</td>
            <td class="e47p-x">${e47PdfRisk(it,'C')}</td>
            <td>${it.fecha_correccion?escapeHtml(e47FmtDate(it.fecha_correccion)):''}</td>
          </tr>`).join('')}
      </table>

      <table class="e47p-footer">
        <tr><td class="e47p-resp-title" colspan="15">RESPONSABLE DEL REGISTRO</td></tr>
        <tr>
          <td colspan="5"><strong>NOMBRE:</strong><br>${escapeHtml(data.responsable_registro_nombre||'')}</td>
          <td colspan="5"><strong>FIRMA:</strong>${sig?`<img class="e47p-sign" src="${sig}">`:''}</td>
          <td colspan="5"><strong>CARGO:</strong><br>${escapeHtml(data.responsable_registro_cargo||'')}<br><strong>FECHA:</strong> ${escapeHtml(e47FmtDate(data.responsable_registro_fecha))}</td>
        </tr>
      </table>`;

      document.body.appendChild(report);
      await e47WaitImages(report);

      const canvas=await html2canvas(report,{
        scale:1.8,
        useCORS:true,
        backgroundColor:'#ffffff',
        logging:false,
        imageTimeout:15000
      });

      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
      const pw=pdf.internal.pageSize.getWidth();
      const ph=pdf.internal.pageSize.getHeight();
      const margin=2.5;
      const maxW=pw-margin*2;
      const maxH=ph-margin*2;

      let w=maxW;
      let h=canvas.height*(w/canvas.width);
      if(h>maxH){
        h=maxH;
        w=canvas.width*(h/canvas.height);
      }

      pdf.addImage(
        canvas.toDataURL('image/jpeg',0.98),
        'JPEG',
        (pw-w)/2,
        (ph-h)/2,
        w,
        h,
        undefined,
        'FAST'
      );

      const safe=(data.proyecto?.nombre||'PROYECTO')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .replace(/[^A-Za-z0-9_-]+/g,'-');

      pdf.save(`EDP-SIG-SSOMAC-RE-PA-191-03_${e47Code(data.numero)}_${safe}_${data.fecha_inspeccion}.pdf`);
    }catch(err){
      console.error(err);
      showMessage(msg,'No se pudo generar el PDF: '+(err.message||err));
    }finally{
      report?.remove();
      if(button){button.disabled=false;button.textContent=old;}
    }
  }


  await loadRows();const params=new URLSearchParams(location.search);if(params.get('new')==='1')await openNew();else if(params.get('id'))await openEdit(params.get('id'));else showList();
}
if(document.body.dataset.page==='inspections')e47Init();
