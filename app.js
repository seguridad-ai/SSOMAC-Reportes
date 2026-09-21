const cfg = window.SSOMAC_CONFIG || {};
const SUPABASE_URL = cfg.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = cfg.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY.includes('PEGA_AQUI')) {
  console.warn('Falta configurar la Publishable key en config.js');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const page = document.body.dataset.page;


// ============================================================
// EMAILJS + ENLACES DE LEVANTAMIENTO
// ============================================================
function getPublicAppBaseUrl(){
  const configured=String(cfg.APP_URL||'').trim().replace(/\/$/,'');
  if(configured)return configured;
  return new URL('.',window.location.href).href.replace(/\/$/,'');
}

function buildLiftLink(token){
  return `${getPublicAppBaseUrl()}/levantamiento.html?t=${encodeURIComponent(token)}`;
}

function emailJsConfigured(){
  return Boolean(
    cfg.EMAILJS_SERVICE_ID &&
    cfg.EMAILJS_TEMPLATE_ID &&
    cfg.EMAILJS_PUBLIC_KEY
  );
}

async function sendAssignmentEmail(params){
  if(!emailJsConfigured()){
    throw new Error('EmailJS no está configurado en config.js');
  }

  const response=await fetch('https://api.emailjs.com/api/v1.0/email/send',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      service_id:cfg.EMAILJS_SERVICE_ID,
      template_id:cfg.EMAILJS_TEMPLATE_ID,
      user_id:cfg.EMAILJS_PUBLIC_KEY,
      template_params:params
    })
  });

  if(!response.ok){
    const detail=await response.text().catch(()=>response.statusText);
    throw new Error(`EmailJS ${response.status}: ${detail||response.statusText}`);
  }
  return true;
}

async function markAssignmentEmailSent(assignmentId){
  if(!assignmentId)return;
  const {error}=await sb.from('asignaciones_levantamiento').update({
    estado:'CORREO_ENVIADO',
    correo_enviado_en:new Date().toISOString()
  }).eq('id',assignmentId);
  if(error)console.warn('Correo enviado, pero no se pudo actualizar la asignación:',error.message);
}

function showMessage(el, text, ok=false){ if(!el)return; el.textContent=text||''; el.style.color=ok?'#067647':'#b42318'; }
function escapeHtml(v=''){ return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }
function today(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


// ============================================================
// CONTROL DE PLAZOS Y ALERTAS INTERNAS (V10.3)
// ============================================================
function parseYmdLocal(value){
  if(!value)return null;
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
}

function daysUntilYmd(value){
  const target=parseYmdLocal(value);
  if(!target)return null;
  const now=new Date();
  const base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.round((target-base)/86400000);
}

function getDeadlineInfo(row){
  const state=row?.estado?.codigo||'';
  if(state==='CERRADO')return {code:'CERRADO',label:'Cerrado',days:null,priority:5};
  if(state==='PENDIENTE_VALIDACION')return {code:'LEVANTADO',label:'Levantado · por validar',days:null,priority:4};
  if(!row?.fecha_levantamiento)return {code:'SIN_FECHA',label:'Sin fecha límite',days:null,priority:3};

  const days=daysUntilYmd(row.fecha_levantamiento);
  if(days===null)return {code:'SIN_FECHA',label:'Sin fecha límite',days:null,priority:3};
  if(days<0){
    const n=Math.abs(days);
    return {code:'VENCIDO',label:`Vencido hace ${n} día${n===1?'':'s'}`,days,priority:0};
  }
  if(days===0)return {code:'POR_VENCER',label:'Vence hoy',days,priority:1};
  if(days<=3)return {code:'POR_VENCER',label:`Vence en ${days} día${days===1?'':'s'}`,days,priority:1};
  return {code:'EN_PLAZO',label:`En plazo · ${days} días`,days,priority:2};
}

function renderInternalAlerts(container,counts){
  if(!container)return;
  const items=[];
  if(counts.overdue>0)items.push({level:'danger',title:`${counts.overdue} observación${counts.overdue===1?'':'es'} vencida${counts.overdue===1?'':'s'}`,text:'Requiere seguimiento prioritario.',href:'ocurrencias.html?plazo=VENCIDO'});
  if(counts.dueSoon>0)items.push({level:'warning',title:`${counts.dueSoon} observación${counts.dueSoon===1?'':'es'} por vencer`,text:'Vencen hoy o dentro de los próximos 3 días.',href:'ocurrencias.html?plazo=POR_VENCER'});
  if(counts.pendingValidation>0)items.push({level:'info',title:`${counts.pendingValidation} levantamiento${counts.pendingValidation===1?'':'s'} por validar`,text:'La corrección ya fue enviada y espera revisión de Seguridad/SIG.',href:'ocurrencias.html?estado=PENDIENTE_VALIDACION'});
  if(counts.workerPending>0)items.push({level:'neutral',title:`${counts.workerPending} reporte${counts.workerPending===1?'':'s'} de trabajador pendiente${counts.workerPending===1?'':'s'}`,text:'Existen reportes nuevos o en revisión.',href:'reportes-trabajadores.html'});

  const countEl=document.getElementById('alertsCount');
  if(countEl)countEl.textContent=String(items.length);
  if(!items.length){
    container.innerHTML='<div class="alert-empty"><strong>Sin alertas prioritarias.</strong><span>No hay vencimientos, próximos vencimientos ni revisiones pendientes.</span></div>';
    return;
  }
  container.innerHTML=items.map(a=>`<a class="internal-alert ${a.level}" href="${a.href}"><span class="alert-dot" aria-hidden="true"></span><span class="alert-copy"><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.text)}</small></span><span class="alert-arrow">→</span></a>`).join('');
}
function uid(){ return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`); }


// ============================================================
// FIRMA DIGITAL CON DEDO / MOUSE
// ============================================================
function createSignaturePad(canvas,clearButton){
  if(!canvas)return null;
  const ctx=canvas.getContext('2d');
  let drawing=false;
  let empty=true;

  function reset(){
    ctx.save();
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();
    empty=true;
  }
  function point(e){
    const r=canvas.getBoundingClientRect();
    return {
      x:(e.clientX-r.left)*(canvas.width/r.width),
      y:(e.clientY-r.top)*(canvas.height/r.height)
    };
  }
  function start(e){
    e.preventDefault();
    drawing=true;
    empty=false;
    const p=point(e);
    canvas.setPointerCapture?.(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(p.x,p.y);
    ctx.lineTo(p.x+.1,p.y+.1);
    ctx.stroke();
  }
  function move(e){
    if(!drawing)return;
    e.preventDefault();
    const p=point(e);
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
  }
  function end(e){
    if(!drawing)return;
    e?.preventDefault?.();
    drawing=false;
    ctx.closePath();
  }

  ctx.lineWidth=4;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  ctx.strokeStyle='#111827';
  reset();

  canvas.addEventListener('pointerdown',start);
  canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',end);
  canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('pointerleave',e=>{if(drawing)end(e);});
  clearButton?.addEventListener('click',reset);

  return {
    isEmpty:()=>empty,
    clear:reset,
    toBlob:()=>new Promise((resolve,reject)=>canvas.toBlob(
      blob=>blob?resolve(blob):reject(new Error('No se pudo procesar la firma digital.')),
      'image/webp',0.92
    ))
  };
}
async function requireSession(){ const {data}=await sb.auth.getSession(); if(!data.session){location.href='index.html'; return null;} return data.session; }
async function logout(){ await sb.auth.signOut(); location.href='index.html'; }

async function getProfile(userId){
  const {data,error}=await sb.from('perfiles').select('nombres,apellidos,cargo,email,rol,activo').eq('id',userId).single();
  if(error) throw error; return data;
}
async function getStatuses(){
  const {data,error}=await sb.from('estados_ocurrencia').select('id,codigo,nombre,orden').eq('activo',true).order('orden');
  if(error) throw error;
  return Object.fromEntries(data.map(x=>[x.codigo,x]));
}

async function initLogin(){
  const form=document.getElementById('loginForm'), msg=document.getElementById('loginMessage');
  const {data}=await sb.auth.getSession(); if(data.session){location.href='app.html'; return;}
  form.addEventListener('submit',async e=>{
    e.preventDefault(); showMessage(msg,'Ingresando...',true);
    const email=document.getElementById('email').value.trim(), password=document.getElementById('password').value;
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){showMessage(msg,'No se pudo iniciar sesión: '+error.message);return;}
    location.href='app.html';
  });
}

// ============================================================
// ETAPA 40 - INTERFAZ SSOMAC 2.0
// Header compacto + Inicio bento + Actividad reciente
// ============================================================
function relativeTimeEsV40(value){
  if(!value)return 'Sin fecha';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return 'Sin fecha';
  const diff=Math.max(0,Date.now()-d.getTime());
  const min=Math.floor(diff/60000);
  if(min<1)return 'Ahora';
  if(min<60)return `Hace ${min} min`;
  const h=Math.floor(min/60);if(h<24)return `Hace ${h} h`;
  const days=Math.floor(h/24);if(days<7)return `Hace ${days} día${days===1?'':'s'}`;
  return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short'}).format(d);
}

function activityToneV40(type=''){
  if(['OCURRENCIA_CERRADA','BUENA_PRACTICA_REGISTRADA'].includes(type))return 'success';
  if(['LEVANTAMIENTO_DEVUELTO','PLAZO_AMPLIADO','FECHA_LIMITE_MODIFICADA'].includes(type))return 'warning';
  if(['LEVANTAMIENTO_ENVIADO','RESPONSABLE_ASIGNADO','RESPONSABLE_MODIFICADO'].includes(type))return 'info';
  return 'neutral';
}

async function renderRecentActivityV40(container){
  if(!container)return;
  const {data,error}=await sb.from('historial_ocurrencias').select(`
    id,tipo_evento,titulo,detalle,actor_nombre,creado_en,
    ocurrencia:ocurrencias(id,numero,proyecto:proyectos(nombre))
  `).order('creado_en',{ascending:false}).limit(7);
  if(error){
    console.warn('No se pudo cargar actividad reciente:',error.message);
    container.innerHTML='<div class="home-activity-empty-v40">No se pudo cargar la actividad reciente.</div>';
    return;
  }
  const rows=data||[];
  if(!rows.length){
    container.innerHTML='<div class="home-activity-empty-v40">Aún no hay movimientos registrados.</div>';
    return;
  }
  container.innerHTML=rows.map(r=>{
    const occ=r.ocurrencia||{};const project=occ.proyecto?.nombre||'Sin proyecto';
    const code=occ.numero?`OC-${String(occ.numero).padStart(6,'0')}`:'Ocurrencia';
    return `<a class="home-activity-row-v40" href="${occ.id?`detalle-ocurrencia.html?id=${encodeURIComponent(occ.id)}`:'ocurrencias.html'}">
      <span class="home-activity-dot-v40 ${activityToneV40(r.tipo_evento)}" aria-hidden="true"></span>
      <span class="home-activity-main-v40">
        <strong>${escapeHtml(r.titulo||r.tipo_evento||'Movimiento')}</strong>
        <small>${escapeHtml(code)} · ${escapeHtml(project)}${r.actor_nombre?` · ${escapeHtml(r.actor_nombre)}`:''}</small>
      </span>
      <span class="home-activity-time-v40">${escapeHtml(relativeTimeEsV40(r.creado_en))}</span>
    </a>`;
  }).join('');
}

function initGlobalShellV40(){
  const topbar=document.querySelector('.topbar');if(!topbar)return;
  topbar.classList.add('topbar-v40');
  document.querySelectorAll('.topbar a[href="reporte-diario.html"]').forEach(a=>a.textContent='Reporte mensual');
  const current=(location.pathname.split('/').pop()||'app.html').toLowerCase();
  document.querySelectorAll('.topbar .top-actions a[href]').forEach(a=>{
    const href=(a.getAttribute('href')||'').split('?')[0].toLowerCase();
    if(href===current)a.classList.add('is-active');
  });
}

async function initApp(){
  const session=await requireSession(); if(!session)return;
  document.getElementById('logoutBtn').addEventListener('click',logout);
  const msg=document.getElementById('appMessage');
  try{
    const profile=await getProfile(session.user.id);
    document.getElementById('userName').textContent=`${profile.nombres||''} ${profile.apellidos||''}`.trim();
    document.getElementById('userMeta').textContent=`${profile.cargo||''} · ${profile.rol||''}`;

    if(['ADMIN','SIG'].includes(profile.rol)){
      document.getElementById('projectsNav')?.classList.remove('hidden');
      document.getElementById('projectsCardLink')?.classList.remove('hidden');
      document.getElementById('responsiblesNav')?.classList.remove('hidden');
      document.getElementById('responsiblesCardLink')?.classList.remove('hidden');
    }

    const {data:links,error:perr}=await sb.from('usuario_proyectos').select('proyecto_id,proyectos(nombre,cliente)').eq('usuario_id',session.user.id);
    if(perr)throw perr;
    const box=document.getElementById('projectsList'); box.innerHTML='';
    (links||[]).forEach(r=>{ const d=document.createElement('div'); d.className='list-item'; d.innerHTML=`<strong>${escapeHtml(r.proyectos?.nombre||'')}</strong><span>${escapeHtml(r.proyectos?.cliente||'')}</span>`; box.appendChild(d); });

    const {data:occ,error:oerr}=await sb.from('ocurrencias').select('id,fecha_levantamiento,estado:estados_ocurrencia(codigo)');
    if(oerr)throw oerr;
    const counts={ABIERTO:0,EN_PROCESO:0,PENDIENTE_VALIDACION:0,CERRADO:0};
    let overdue=0,dueSoon=0;
    (occ||[]).forEach(o=>{
      const c=o.estado?.codigo;if(c in counts)counts[c]++;
      const deadline=getDeadlineInfo(o);
      if(deadline.code==='VENCIDO')overdue++;
      if(deadline.code==='POR_VENCER')dueSoon++;
    });
    document.getElementById('kpiOpen').textContent=counts.ABIERTO;
    document.getElementById('kpiProcess').textContent=counts.EN_PROCESO;
    document.getElementById('kpiPending').textContent=counts.PENDIENTE_VALIDACION;
    document.getElementById('kpiDueSoon').textContent=dueSoon;
    document.getElementById('kpiOverdue').textContent=overdue;
    document.getElementById('kpiClosed').textContent=counts.CERRADO;
    const totalOccurrences=(occ||[]).length;
    const closureRate=totalOccurrences?Math.round((counts.CERRADO/totalOccurrences)*100):0;
    if(document.getElementById('kpiClosureRate'))document.getElementById('kpiClosureRate').textContent=`${closureRate}%`;

    let workerPending=0;
    const {data:workerRows,error:workerErr}=await sb.from('reportes_trabajadores').select('id,estado_revision').in('estado_revision',['NUEVO','EN_REVISION']);
    if(!workerErr)workerPending=(workerRows||[]).length;
    else console.warn('No se pudo calcular la alerta de reportes de trabajadores:',workerErr.message);

    renderInternalAlerts(document.getElementById('alertsList'),{
      overdue,
      dueSoon,
      pendingValidation:counts.PENDIENTE_VALIDACION,
      workerPending
    });

    await renderRecentActivityV40(document.getElementById('recentActivityList'));
  }catch(err){ showMessage(msg,err.message); }
}

async function initNewOccurrence(){
  const session=await requireSession(); if(!session)return;
  document.getElementById('logoutBtn').addEventListener('click',logout);
  const form=document.getElementById('occurrenceForm'),msg=document.getElementById('formMessage'),saveBtn=document.getElementById('saveBtn');
  const projectEl=document.getElementById('project'),dateEl=document.getElementById('date'),originEl=document.getElementById('origin'),classificationEl=document.getElementById('classification');
  const classificationSection=document.getElementById('classificationSection'),causesSection=document.getElementById('causesSection'),correctiveSection=document.getElementById('correctiveSection');
  const potentialEl=document.getElementById('potential'),areaEl=document.getElementById('area'),responsibleEl=document.getElementById('responsibleId'),responsibleInfo=document.getElementById('responsibleInfo'),photoEl=document.getElementById('photo'),preview=document.getElementById('photoPreview'),descriptionLabel=document.getElementById('descriptionLabel');
  const immediateLiftFields=document.getElementById('immediateLiftFields'),immediateLiftComment=document.getElementById('immediateLiftComment'),immediateLiftPhoto=document.getElementById('immediateLiftPhoto'),immediateLiftPreview=document.getElementById('immediateLiftPreview');
  const immediateLiftSigner=document.getElementById('immediateLiftSigner'),immediateLiftSignature=document.getElementById('immediateLiftSignature'),immediateLiftClearSignature=document.getElementById('immediateLiftClearSignature');
  const immediateSignaturePad=createSignaturePad(immediateLiftSignature,immediateLiftClearSignature);
  dateEl.value=today();

  function isImmediateLift(){
    return document.querySelector('input[name="immediateLift"]:checked')?.value==='SI';
  }
  function syncImmediateLiftUI(){
    const immediate=isImmediateLift();
    immediateLiftFields?.classList.toggle('hidden',!immediate);
    if(immediateLiftComment) immediateLiftComment.required=immediate;
    if(immediateLiftPhoto) immediateLiftPhoto.required=immediate;
    if(!immediate){
      if(immediateLiftComment) immediateLiftComment.value='';
      if(immediateLiftPhoto) immediateLiftPhoto.value='';
      if(immediateLiftPreview){immediateLiftPreview.src='';immediateLiftPreview.classList.add('hidden');}
      if(immediateLiftSigner) immediateLiftSigner.value='';
      immediateSignaturePad?.clear();
    }
  }
  document.querySelectorAll('input[name="immediateLift"]').forEach(x=>x.addEventListener('change',syncImmediateLiftUI));
  immediateLiftPhoto?.addEventListener('change',()=>{
    const f=immediateLiftPhoto.files?.[0];
    if(!f){immediateLiftPreview.src='';immediateLiftPreview.classList.add('hidden');return;}
    immediateLiftPreview.src=URL.createObjectURL(f);immediateLiftPreview.classList.remove('hidden');
  });
  syncImmediateLiftUI();

  const [projectsRes,originsRes,typesRes,potentialsRes,areasRes,responsiblesRes]=await Promise.all([
    sb.from('usuario_proyectos').select('proyecto_id,proyectos(id,nombre,cliente)').eq('usuario_id',session.user.id),
    sb.from('origenes_hallazgo').select('id,nombre,orden').eq('activo',true).order('orden'),
    sb.from('tipos_hallazgo').select('id,codigo,nombre,orden').eq('activo',true).order('orden'),
    sb.from('potenciales_perdida').select('id,codigo,nombre,orden').eq('activo',true).order('orden'),
    sb.from('areas').select('id,nombre').eq('activo',true).order('nombre'),
    sb.from('responsables_correccion').select('id,proyecto_id,sede,area_nombre,nombres,apellidos,cargo,email,aplica_todos_proyectos,activo').eq('activo',true).order('apellidos')
  ]);
  const error=[projectsRes.error,originsRes.error,typesRes.error,potentialsRes.error,areasRes.error,responsiblesRes.error].find(Boolean);
  if(error){showMessage(msg,'No se pudieron cargar los catálogos: '+error.message);saveBtn.disabled=true;return;}
  const origins=originsRes.data||[],types=typesRes.data||[],responsibles=responsiblesRes.data||[];

  projectEl.innerHTML='<option value="">Seleccione...</option>'+(projectsRes.data||[]).map(r=>`<option value="${r.proyectos.id}">${escapeHtml(r.proyectos.nombre)}</option>`).join('');
  originEl.innerHTML='<option value="">Seleccione...</option>'+origins.map(o=>`<option value="${o.id}">${escapeHtml(o.nombre)}</option>`).join('');
  classificationEl.innerHTML='<option value="">Seleccione...</option>'+types.map(t=>`<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  potentialEl.innerHTML='<option value="">Seleccione...</option>'+(potentialsRes.data||[]).map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  areaEl.innerHTML='<option value="">Seleccione...</option>'+(areasRes.data||[]).map(a=>`<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');

  function renderResponsibles(){
    const projectId=projectEl.value;
    const available=responsibles.filter(r=>r.aplica_todos_proyectos===true || (projectId && r.proyecto_id===projectId));
    responsibleEl.innerHTML='<option value="">Seleccione...</option>'+available.map(r=>{
      const fullName=`${r.nombres||''} ${r.apellidos||''}`.trim();
      const area=r.area_nombre||'SIN ÁREA';
      const scope=r.aplica_todos_proyectos?'Corporativo':'Proyecto';
      return `<option value="${r.id}">${escapeHtml(fullName)} · ${escapeHtml(area)} · ${escapeHtml(r.cargo||'')} (${scope})</option>`;
    }).join('');
    responsibleEl.disabled=!projectId;
    responsibleInfo.textContent=!projectId?'Selecciona el proyecto para cargar los responsables disponibles.':(available.length?`${available.length} responsable(s) disponible(s).`:'No hay responsables activos disponibles para este proyecto.');
  }

  projectEl.addEventListener('change',renderResponsibles);
  responsibleEl.addEventListener('change',()=>{
    if(!isImmediateLift()||!immediateLiftSigner)return;
    const r=responsibles.find(x=>x.id===responsibleEl.value);
    if(r&&!immediateLiftSigner.value.trim())immediateLiftSigner.value=`${r.nombres||''} ${r.apellidos||''}`.trim();
  });
  renderResponsibles();

  originEl.addEventListener('change',()=>{
    const origin=origins.find(o=>o.id===originEl.value),good=origin?.nombre==='BUENA PRACTICA';
    clearCauses();
    if(!origin){classificationSection.classList.add('hidden');causesSection.classList.add('hidden');correctiveSection.classList.add('hidden');classificationEl.required=false;responsibleEl.required=false;document.querySelector('input[name="immediateLift"][value="NO"]')?.click();return;}
    if(good){classificationSection.classList.add('hidden');causesSection.classList.add('hidden');correctiveSection.classList.add('hidden');classificationEl.value='';classificationEl.required=false;responsibleEl.required=false;responsibleEl.value='';descriptionLabel.textContent='Descripción de la buena práctica *';document.querySelector('input[name="immediateLift"][value="NO"]')?.click();}
    else{classificationSection.classList.remove('hidden');classificationEl.required=true;classificationEl.value='';responsibleEl.required=true;causesSection.classList.add('hidden');correctiveSection.classList.add('hidden');descriptionLabel.textContent='Descripción del hallazgo *';syncImmediateLiftUI();}
  });
  classificationEl.addEventListener('change',async()=>{clearCauses(); if(!classificationEl.value){causesSection.classList.add('hidden');correctiveSection.classList.add('hidden');return;} causesSection.classList.remove('hidden');correctiveSection.classList.remove('hidden');await loadCauses(classificationEl.value);});
  photoEl.addEventListener('change',()=>{const f=photoEl.files?.[0];if(!f){preview.classList.add('hidden');return;}preview.src=URL.createObjectURL(f);preview.classList.remove('hidden');});

  async function loadCauses(typeId){
    const ib=document.getElementById('immediateCauses'),bb=document.getElementById('basicCauses');ib.innerHTML=bb.innerHTML='Cargando...';
    const [ir,br]=await Promise.all([
      sb.from('causas_inmediatas').select('id,nombre,orden').eq('activo',true).eq('tipo_hallazgo_id',typeId).order('orden'),
      sb.from('causas_basicas').select('id,nombre,grupo_codigo,grupo_nombre,subgrupo_codigo,subgrupo_nombre,orden').eq('activo',true).eq('tipo_hallazgo_id',typeId).order('orden')
    ]);
    if(ir.error||br.error){showMessage(msg,'No se pudieron cargar las causas.');return;}
    ib.innerHTML=(ir.data||[]).map(c=>`<label class="check-item"><input type="checkbox" name="immediateCause" value="${c.id}"><span>${escapeHtml(c.nombre)}</span></label>`).join('');
    const groups=new Map();(br.data||[]).forEach(c=>{const k=`${c.grupo_codigo}|${c.grupo_nombre}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c);});
    let html='';for(const [k,items] of groups){const [gc,gn]=k.split('|');html+=`<div class="group-title">${escapeHtml(gc)}. ${escapeHtml(gn)}</div>`;let sub=null;for(const c of items){const sk=c.subgrupo_codigo?`${c.subgrupo_codigo}|${c.subgrupo_nombre}`:null;if(sk&&sk!==sub){sub=sk;html+=`<div class="subgroup-title">${escapeHtml(c.subgrupo_codigo)} ${escapeHtml(c.subgrupo_nombre||'')}</div>`;}html+=`<label class="check-item"><input type="checkbox" name="basicCause" value="${c.id}"><span>${escapeHtml(c.nombre)}</span></label>`;}}
    bb.innerHTML=html||'Sin causas configuradas.';
  }
  function clearCauses(){document.getElementById('immediateCauses').innerHTML='';document.getElementById('basicCauses').innerHTML='';}

  form.addEventListener('submit',async e=>{
    e.preventDefault();showMessage(msg,'');
    const origin=origins.find(o=>o.id===originEl.value),good=origin?.nombre==='BUENA PRACTICA';
    const selectedResponsible=responsibles.find(r=>r.id===responsibleEl.value);
    const immediate=!good&&isImmediateLift();
    if(!originEl.value||!projectEl.value||(!good&&!classificationEl.value)||(!good&&!selectedResponsible)){showMessage(msg,'Completa los campos obligatorios, incluido el responsable de corrección.');return;}
    if(immediate&&(!immediateLiftComment.value.trim()||!immediateLiftPhoto.files?.[0]||!immediateLiftSigner?.value.trim()||immediateSignaturePad?.isEmpty())){showMessage(msg,'Para un levantamiento inmediato debes registrar la acción, la fotografía, el nombre de quien levanta y su firma digital.');return;}
    saveBtn.disabled=true;saveBtn.textContent='Guardando...';
    try{
      const payload={
        proyecto_id:projectEl.value,fecha:dateEl.value,origen_hallazgo_id:originEl.value,tipo_hallazgo_id:good?null:classificationEl.value,
        lugar_hallazgo:document.getElementById('place').value.trim(),descripcion:document.getElementById('description').value.trim(),
        acciones_implementar:good?null:(document.getElementById('action').value.trim()||null),
        potencial_perdida_id:good?null:(potentialEl.value||null),
        responsable_correccion_id:good?null:(selectedResponsible?.id||null),
        responsable_correccion:good?null:(selectedResponsible?`${selectedResponsible.nombres||''} ${selectedResponsible.apellidos||''}`.trim():null),
        area_responsable_id:good?null:(areaEl.value||null),fecha_levantamiento:good?null:(document.getElementById('dueDate').value||null),
        modalidad_levantamiento:good?null:(immediate?'INMEDIATO':'ASIGNADO')
      };
      const {data:occ,error:oe}=await sb.from('ocurrencias').insert(payload).select('id,numero').single();if(oe)throw oe;
      if(!good){
        const ii=[...document.querySelectorAll('input[name="immediateCause"]:checked')].map(x=>x.value),bi=[...document.querySelectorAll('input[name="basicCause"]:checked')].map(x=>x.value);
        if(ii.length){const {error}=await sb.from('ocurrencia_causas_inmediatas').insert(ii.map(id=>({ocurrencia_id:occ.id,causa_inmediata_id:id})));if(error)throw error;}
        if(bi.length){const {error}=await sb.from('ocurrencia_causas_basicas').insert(bi.map(id=>({ocurrencia_id:occ.id,causa_basica_id:id})));if(error)throw error;}
      }
      const f=photoEl.files?.[0];if(f){const blob=await optimizeImage(f);const path=`ocurrencias/${occ.id}/hallazgo/${Date.now()}_${uid()}.webp`;const {error:ue}=await sb.storage.from('evidencias-ssomac').upload(path,blob,{contentType:'image/webp',upsert:false});if(ue)throw ue;const {error:ee}=await sb.from('evidencias').insert({ocurrencia_id:occ.id,tipo_evidencia:'HALLAZGO',ruta_archivo:path,creado_por_id:session.user.id});if(ee)throw ee;}
      let assignmentWarning='';
      let assignmentEmailNote='';
      if(!good&&selectedResponsible&&immediate){
        try{
          const liftFile=immediateLiftPhoto.files?.[0];
          const liftBlob=await optimizeImage(liftFile);
          const liftPath=`ocurrencias/${occ.id}/levantamiento/${Date.now()}_${uid()}.webp`;
          const {error:liftUploadError}=await sb.storage.from('evidencias-ssomac').upload(liftPath,liftBlob,{contentType:'image/webp',upsert:false});
          if(liftUploadError)throw liftUploadError;
          const {error:liftEvidenceError}=await sb.from('evidencias').insert({
            ocurrencia_id:occ.id,
            tipo_evidencia:'LEVANTAMIENTO',
            ruta_archivo:liftPath,
            comentario:immediateLiftComment.value.trim(),
            creado_por_id:session.user.id
          });
          if(liftEvidenceError)throw liftEvidenceError;
          const signatureBlob=await immediateSignaturePad.toBlob();
          const signaturePath=`ocurrencias/${occ.id}/levantamiento/firma_${Date.now()}_${uid()}.webp`;
          const {error:signatureUploadError}=await sb.storage.from('evidencias-ssomac').upload(signaturePath,signatureBlob,{contentType:'image/webp',upsert:false});
          if(signatureUploadError)throw signatureUploadError;
          const {error:signatureEvidenceError}=await sb.from('evidencias').insert({
            ocurrencia_id:occ.id,
            tipo_evidencia:'FIRMA_LEVANTAMIENTO',
            ruta_archivo:signaturePath,
            comentario:immediateLiftSigner.value.trim(),
            creado_por_id:session.user.id
          });
          if(signatureEvidenceError)throw signatureEvidenceError;
          const statuses=await getStatuses();
          const {error:liftOccError}=await sb.from('ocurrencias').update({
            estado_id:statuses.PENDIENTE_VALIDACION.id,
            fecha_ejecutada:today(),
            levantado_por_id:session.user.id,
            modalidad_levantamiento:'INMEDIATO'
          }).eq('id',occ.id);
          if(liftOccError)throw liftOccError;
          assignmentEmailNote=' Levantamiento inmediato registrado; no se generó asignación ni se envió correo.';
        }catch(liftErr){
          console.error(liftErr);
          assignmentWarning=' La ocurrencia fue creada, pero no se pudo completar el levantamiento inmediato: '+(liftErr.message||liftErr);
        }
      }else if(!good&&selectedResponsible){
        const {data:assignmentData,error:assignmentError}=await sb.rpc('crear_asignacion_levantamiento',{
          p_ocurrencia_id:occ.id,
          p_responsable_id:selectedResponsible.id,
          p_fecha_limite:document.getElementById('dueDate').value||null
        });
        if(assignmentError){
          assignmentWarning=' La ocurrencia fue creada, pero la asignación de levantamiento quedó pendiente: '+assignmentError.message;
        }else{
          const assignment=Array.isArray(assignmentData)?assignmentData[0]:assignmentData;
          const project=(projectsRes.data||[]).map(x=>x.proyectos).find(p=>p?.id===projectEl.value);
          const selectedType=types.find(t=>t.id===classificationEl.value);
          try{
            const reporter=await getProfile(session.user.id);
            await sendAssignmentEmail({
              codigo_reporte:`OC-${String(occ.numero).padStart(6,'0')}`,
              correo_responsable:selectedResponsible.email,
              nombre_responsable:`${selectedResponsible.nombres||''} ${selectedResponsible.apellidos||''}`.trim(),
              proyecto:project?.nombre||projectEl.options[projectEl.selectedIndex]?.text||'',
              fecha:formatDateEsV6(dateEl.value),
              reportado_por:`${reporter.nombres||''} ${reporter.apellidos||''}`.trim(),
              lugar:document.getElementById('place').value.trim(),
              tipo_hallazgo:selectedType?.nombre||'',
              descripcion:document.getElementById('description').value.trim(),
              accion:document.getElementById('action').value.trim()||'Por definir',
              fecha_limite:document.getElementById('dueDate').value?formatDateEsV6(document.getElementById('dueDate').value):'Sin fecha definida',
              link_levantamiento:buildLiftLink(assignment?.token)
            });
            await markAssignmentEmailSent(assignment?.asignacion_id);
            assignmentEmailNote=' Se envió el correo de levantamiento al responsable.';
          }catch(emailErr){
            console.error(emailErr);
            assignmentWarning+=' La asignación fue creada, pero no se pudo enviar el correo: '+(emailErr.message||emailErr);
          }
        }
      }
      showMessage(msg,`Ocurrencia N.° ${occ.numero} registrada correctamente.${assignmentEmailNote}${assignmentWarning}`,true);form.reset();dateEl.value=today();classificationSection.classList.add('hidden');causesSection.classList.add('hidden');correctiveSection.classList.add('hidden');preview.classList.add('hidden');if(immediateLiftPreview){immediateLiftPreview.src='';immediateLiftPreview.classList.add('hidden');}immediateSignaturePad?.clear();syncImmediateLiftUI();renderResponsibles();window.scrollTo({top:0,behavior:'smooth'});
    }catch(err){console.error(err);showMessage(msg,'No se pudo guardar: '+(err.message||err));}
    finally{saveBtn.disabled=false;saveBtn.textContent='Guardar ocurrencia';}
  });
}

async function initOccurrences(){
  const session=await requireSession();if(!session)return;document.getElementById('logoutBtn').addEventListener('click',logout);
  const list=document.getElementById('occurrencesList'),msg=document.getElementById('listMessage'),fp=document.getElementById('filterProject'),fs=document.getElementById('filterStatus'),fd=document.getElementById('filterDeadline'),ft=document.getElementById('filterText');
  try{
    const {data,error}=await sb.from('ocurrencias').select(`
      id,numero,fecha,lugar_hallazgo,descripcion,fecha_levantamiento,fecha_ejecutada,modalidad_levantamiento,
      proyecto:proyectos(id,nombre,cliente),
      origen:origenes_hallazgo(nombre),
      tipo:tipos_hallazgo(codigo,nombre),
      estado:estados_ocurrencia(codigo,nombre)
    `).order('numero',{ascending:false});
    if(error)throw error;
    let rows=(data||[]).map(r=>({...r,_deadline:getDeadlineInfo(r)}));
    const projects=[...new Map(rows.filter(r=>r.proyecto).map(r=>[r.proyecto.id,r.proyecto])).values()];
    fp.innerHTML='<option value="">Todos</option>'+projects.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
    const statuses=await getStatuses();fs.innerHTML='<option value="">Todos</option>'+Object.values(statuses).map(s=>`<option value="${s.codigo}">${escapeHtml(s.nombre)}</option>`).join('');

    const deadlineCounts={EN_PLAZO:0,POR_VENCER:0,VENCIDO:0,SIN_FECHA:0};
    rows.forEach(r=>{if(r._deadline.code in deadlineCounts)deadlineCounts[r._deadline.code]++;});
    document.getElementById('deadlineKpiOnTime').textContent=deadlineCounts.EN_PLAZO;
    document.getElementById('deadlineKpiDueSoon').textContent=deadlineCounts.POR_VENCER;
    document.getElementById('deadlineKpiOverdue').textContent=deadlineCounts.VENCIDO;
    document.getElementById('deadlineKpiNoDate').textContent=deadlineCounts.SIN_FECHA;

    const params=new URLSearchParams(location.search);
    const requestedStatus=params.get('estado');
    const requestedDeadline=params.get('plazo');
    if(requestedStatus&&[...fs.options].some(o=>o.value===requestedStatus))fs.value=requestedStatus;
    if(requestedDeadline&&[...fd.options].some(o=>o.value===requestedDeadline))fd.value=requestedDeadline;

    const render=()=>{
      const q=ft.value.trim().toLowerCase(),p=fp.value,s=fs.value,d=fd.value;
      const f=rows.filter(r=>(!p||r.proyecto?.id===p)&&(!s||r.estado?.codigo===s)&&(!d||r._deadline.code===d)&&(!q||String(r.numero).includes(q)||(r.lugar_hallazgo||'').toLowerCase().includes(q)||(r.descripcion||'').toLowerCase().includes(q)))
        .sort((a,b)=>a._deadline.priority-b._deadline.priority || ((a._deadline.days??9999)-(b._deadline.days??9999)) || b.numero-a.numero);
      if(!f.length){list.innerHTML='<div class="list-item">No hay ocurrencias con esos filtros.</div>';return;}
      list.innerHTML=f.map(r=>{
        const deadline=r._deadline;
        const deadlineHtml=deadline.code==='CERRADO'?'':`<span class="deadline-badge ${deadline.code}">${escapeHtml(deadline.label)}</span>`;
        return `<article class="occurrence-card deadline-card ${deadline.code}"><div><h3>Ocurrencia N.° ${r.numero} · ${escapeHtml(r.proyecto?.nombre||'')}</h3><div class="occurrence-meta"><span>${escapeHtml(r.fecha)}</span><span>${escapeHtml(r.origen?.nombre||'')}</span><span>${escapeHtml(r.tipo?.nombre||'BUENA PRACTICA')}</span>${r.fecha_levantamiento?`<span>Fecha límite: ${escapeHtml(formatDateEsV6(r.fecha_levantamiento))}</span>`:''}</div><p>${escapeHtml(r.descripcion||'')}</p></div><div class="occurrence-status-stack"><span class="badge ${r.estado?.codigo||''}">${escapeHtml(r.estado?.nombre||'')}</span>${deadlineHtml}<div><a class="button-link secondary-link" href="detalle-ocurrencia.html?id=${r.id}">Ver detalle</a></div></div></article>`;
      }).join('');
    };
    fp.addEventListener('change',render);fs.addEventListener('change',render);fd.addEventListener('change',render);ft.addEventListener('input',render);render();
  }catch(err){showMessage(msg,err.message);}
}

async function initOccurrenceDetail(){
  const session=await requireSession();if(!session)return;document.getElementById('logoutBtn').addEventListener('click',logout);
  const id=new URLSearchParams(location.search).get('id'),head=document.getElementById('detailHeader'),body=document.getElementById('detailBody'),msg=document.getElementById('detailMessage'),deadlineBox=document.getElementById('deadlineManagement'),workflow=document.getElementById('workflowContent'),gallery=document.getElementById('evidenceGallery'),history=document.getElementById('occurrenceHistory'),downloadPdfBtn=document.getElementById('downloadOccurrencePdfBtn');
  if(!id){showMessage(msg,'Falta el identificador de la ocurrencia.');return;}
  try{
    const profile=await getProfile(session.user.id),statuses=await getStatuses();
    const {data:o,error}=await sb.from('ocurrencias').select(`
      id,numero,fecha,lugar_hallazgo,descripcion,acciones_implementar,responsable_correccion,fecha_levantamiento,fecha_levantamiento_original,numero_ampliaciones,fecha_ultima_ampliacion,fecha_ejecutada,modalidad_levantamiento,reportado_por_id,reportado_por_externo,levantado_por_id,levantado_por_externo,validado_por_id,fecha_validacion,observacion_validacion,
      proyecto:proyectos(nombre,cliente),
      origen:origenes_hallazgo(nombre),
      tipo:tipos_hallazgo(codigo,nombre),
      potencial:potenciales_perdida(nombre),
      area:areas(nombre),
      estado:estados_ocurrencia(codigo,nombre)
    `).eq('id',id).single();
    if(error)throw error;
    let reporter=o.reportado_por_externo||'—'; if(!o.reportado_por_externo&&o.reportado_por_id){const {data:p}=await sb.from('perfiles').select('nombres,apellidos').eq('id',o.reportado_por_id).single();if(p)reporter=`${p.nombres||''} ${p.apellidos||''}`.trim();}
    head.innerHTML=`<div class="detail-title"><div><p class="eyebrow">${escapeHtml(o.proyecto?.nombre||'')}</p><h1>Ocurrencia N.° ${o.numero}</h1><div class="occurrence-meta"><span>${escapeHtml(o.fecha)}</span><span>${escapeHtml(o.origen?.nombre||'')}</span><span>${escapeHtml(o.tipo?.nombre||'BUENA PRACTICA')}</span></div></div><span class="badge ${o.estado?.codigo||''}">${escapeHtml(o.estado?.nombre||'')}</span></div>`;
    body.innerHTML=`<div class="detail-grid">
      <div class="detail-item"><span>Lugar</span><strong>${escapeHtml(o.lugar_hallazgo||'—')}</strong></div>
      <div class="detail-item"><span>Reportado por</span><strong>${escapeHtml(reporter)}</strong></div>
      <div class="detail-item full"><span>Descripción</span><strong>${escapeHtml(o.descripcion||'—')}</strong></div>
      <div class="detail-item full"><span>Acción a implementar</span><strong>${escapeHtml(o.acciones_implementar||'No aplica')}</strong></div>
      <div class="detail-item"><span>Potencial</span><strong>${escapeHtml(o.potencial?.nombre||'No aplica')}</strong></div>
      <div class="detail-item"><span>Área responsable</span><strong>${escapeHtml(o.area?.nombre||'No aplica')}</strong></div>
      <div class="detail-item"><span>Responsable</span><strong>${escapeHtml(o.responsable_correccion||'No aplica')}</strong></div>
      <div class="detail-item"><span>Fecha límite vigente</span><strong>${escapeHtml(o.fecha_levantamiento?formatDateEsV6(o.fecha_levantamiento):'No aplica')}</strong></div>
      <div class="detail-item"><span>Fecha límite original</span><strong>${escapeHtml(o.fecha_levantamiento_original?formatDateEsV6(o.fecha_levantamiento_original):(o.fecha_levantamiento?formatDateEsV6(o.fecha_levantamiento):'No aplica'))}</strong></div>
      <div class="detail-item"><span>Modalidad de levantamiento</span><strong>${escapeHtml(o.modalidad_levantamiento==='INMEDIATO'?'INMEDIATO':'ASIGNADO PARA SEGUIMIENTO')}</strong></div>
      ${o.observacion_validacion?`<div class="detail-item full"><span>Observación de validación</span><strong>${escapeHtml(o.observacion_validacion)}</strong></div>`:''}
    </div>`;

    const [ir,br]=await Promise.all([
      sb.from('ocurrencia_causas_inmediatas').select('causas_inmediatas(nombre)').eq('ocurrencia_id',id),
      sb.from('ocurrencia_causas_basicas').select('causas_basicas(nombre)').eq('ocurrencia_id',id)
    ]);
    if((ir.data||[]).length||(br.data||[]).length){
      body.innerHTML+=`<div class="detail-grid" style="margin-top:12px">
        <div class="detail-item"><span>Causas inmediatas</span><strong>${(ir.data||[]).map(x=>escapeHtml(x.causas_inmediatas?.nombre||'')).join('<br>')||'—'}</strong></div>
        <div class="detail-item"><span>Causas básicas</span><strong>${(br.data||[]).map(x=>escapeHtml(x.causas_basicas?.nombre||'')).join('<br>')||'—'}</strong></div>
      </div>`;
    }

    await renderEvidence(id,gallery);
    await renderDeadlineManagement(o,profile,id,deadlineBox,msg);
    await renderOccurrenceHistory(id,history);
    renderWorkflow(o,profile,statuses,session,workflow,msg,id);

    if(downloadPdfBtn){
      downloadPdfBtn.disabled=false;
      downloadPdfBtn.addEventListener('click',async()=>{
        const originalText=downloadPdfBtn.textContent;
        downloadPdfBtn.disabled=true;
        downloadPdfBtn.textContent='Generando PDF...';
        showMessage(msg,'Preparando reporte PDF con fotografías...',true);
        try{
          await downloadOccurrenceReportPdf({occurrence:o,reporter,occurrenceId:id});
          showMessage(msg,'Reporte PDF generado correctamente.',true);
        }catch(pdfErr){
          console.error(pdfErr);
          showMessage(msg,'No se pudo generar el PDF: '+(pdfErr.message||pdfErr));
        }finally{
          downloadPdfBtn.disabled=false;
          downloadPdfBtn.textContent=originalText;
        }
      });
    }
  }catch(err){console.error(err);showMessage(msg,err.message);if(deadlineBox)deadlineBox.textContent='No se pudo cargar la gestión de plazo.';workflow.textContent='No se pudo cargar el flujo.';gallery.textContent='No se pudieron cargar las evidencias.';if(history)history.textContent='No se pudo cargar el historial.';}
}

async function renderEvidence(occId,gallery){
  const {data,error}=await sb.from('evidencias').select('id,tipo_evidencia,ruta_archivo,comentario,creado_en').eq('ocurrencia_id',occId).order('creado_en');
  if(error)throw error;
  if(!data?.length){gallery.innerHTML='<div class="list-item">Sin evidencias.</div>';return;}
  const cards=[];
  for(const e of data){
    const {data:signed,error:se}=await sb.storage.from('evidencias-ssomac').createSignedUrl(e.ruta_archivo,3600);
    cards.push(`<article class="evidence-card">${se?'':`<img src="${signed.signedUrl}" alt="${escapeHtml(e.tipo_evidencia)}">`}<div class="evidence-info"><strong>${escapeHtml(e.tipo_evidencia)}</strong><small>${escapeHtml(e.creado_en||'')}</small>${e.comentario?`<p>${escapeHtml(e.comentario)}</p>`:''}</div></article>`);
  }
  gallery.innerHTML=cards.join('');
}


// ============================================================
// ETAPA 38 - REPORTE INDIVIDUAL PDF (FORMATO CORPORATIVO)
// ============================================================
function pdfSafeText(value,fallback=''){
  const text=String(value??'').trim();
  return text||fallback;
}

function pdfFormatDate(value){
  if(!value)return '';
  const raw=String(value);
  const datePart=raw.slice(0,10);
  const parts=datePart.split('-');
  if(parts.length===3)return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return raw;
}

function pdfFormatTime(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return new Intl.DateTimeFormat('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
}

async function fetchEvidenceForPdf(occurrenceId){
  const {data,error}=await sb.from('evidencias')
    .select('id,tipo_evidencia,ruta_archivo,comentario,creado_en')
    .eq('ocurrencia_id',occurrenceId)
    .order('creado_en',{ascending:true});
  if(error)throw error;
  const result=[];
  for(const item of (data||[])){
    const {data:signed,error:signedError}=await sb.storage.from('evidencias-ssomac').createSignedUrl(item.ruta_archivo,3600);
    result.push({...item,signed_url:signedError?null:signed?.signedUrl});
  }
  return result;
}

async function fetchHistoryForPdf(occurrenceId){
  const {data,error}=await sb.from('historial_ocurrencias')
    .select('tipo_evento,titulo,detalle,actor_nombre,creado_en')
    .eq('ocurrencia_id',occurrenceId)
    .order('creado_en',{ascending:true});
  if(error)return [];
  return data||[];
}

async function urlToPdfImage(url,quality=.86){
  if(!url)return null;
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error('No se pudo cargar una fotografía del reporte.');
  const blob=await response.blob();
  const objectUrl=URL.createObjectURL(blob);
  try{
    const img=await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error('No se pudo procesar una fotografía.'));
      image.src=objectUrl;
    });
    const maxSide=1800;
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
    const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
    ctx.drawImage(img,0,0,w,h);
    return {data:canvas.toDataURL('image/jpeg',quality),width:w,height:h};
  }finally{
    URL.revokeObjectURL(objectUrl);
  }
}

function pdfDrawContainedImage(doc,image,x,y,w,h,padding=1){
  if(!image?.data)return;
  const availW=Math.max(1,w-padding*2),availH=Math.max(1,h-padding*2);
  const scale=Math.min(availW/image.width,availH/image.height);
  const iw=image.width*scale,ih=image.height*scale;
  const ix=x+(w-iw)/2,iy=y+(h-ih)/2;
  doc.addImage(image.data,'JPEG',ix,iy,iw,ih,undefined,'FAST');
}

function pdfDrawPhotoGrid(doc,images,x,y,w,h){
  const valid=(images||[]).filter(Boolean).slice(0,4);
  if(!valid.length){
    doc.setFont('helvetica','italic');doc.setFontSize(6.5);doc.setTextColor(110);
    doc.text('Sin evidencia fotográfica registrada.',x+2,y+5);
    doc.setTextColor(0);
    return;
  }
  const gap=1.5;
  const cols=valid.length===1?1:2;
  const rows=valid.length<=2?1:2;
  const cellW=(w-gap*(cols-1))/cols;
  const cellH=(h-gap*(rows-1))/rows;
  valid.forEach((img,i)=>{
    const c=i%cols,r=Math.floor(i/cols);
    const px=x+c*(cellW+gap),py=y+r*(cellH+gap);
    doc.setDrawColor(170);doc.setLineWidth(.2);doc.rect(px,py,cellW,cellH);
    pdfDrawContainedImage(doc,img,px,py,cellW,cellH,.7);
  });
}

function pdfDrawCheckbox(doc,x,y,label,checked=false){
  const size=2.4;
  doc.setDrawColor(60);doc.setLineWidth(.25);doc.rect(x,y-size+0.4,size,size);
  if(checked){
    doc.setLineWidth(.45);
    doc.line(x+.45,y-.7,x+1.05,y+.05);
    doc.line(x+1.05,y+.05,x+2.0,y-1.25);
  }
  doc.setFont('helvetica','bold');doc.setFontSize(6.8);doc.text(label,x+3.5,y);
}

function pdfDrawCellText(doc,text,x,y,w,h,{size=6.7,bold=false,align='left',padding=1.6,maxLines=4}={}){
  doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(0);
  const lines=doc.splitTextToSize(pdfSafeText(text),Math.max(5,w-padding*2)).slice(0,maxLines);
  let tx=x+padding;
  if(align==='center')tx=x+w/2;
  doc.text(lines,tx,y+padding+size*.35,{align});
}

async function pdfLoadLogo(){
  try{return await urlToPdfImage('assets/img/logo-corporativo.jpg',.9);}catch(_){return null;}
}

function pdfDrawCorporateHeader(doc,logo){
  const x=4,y=4,w=202,h=25.5;
  const logoW=36,centerW=100,rightW=w-logoW-centerW;
  doc.setDrawColor(0);doc.setLineWidth(.45);doc.rect(x,y,w,h);
  doc.line(x+logoW,y,x+logoW,y+h);
  doc.line(x+logoW+centerW,y,x+logoW+centerW,y+h);
  doc.line(x+logoW,y+12,x+logoW+centerW,y+12);
  if(logo)pdfDrawContainedImage(doc,logo,x+1,y+1,logoW-2,h-2,.4);
  doc.setFont('helvetica','bold');doc.setTextColor(0);doc.setFontSize(7.8);
  doc.text('SIG - SSOMAC',x+logoW+centerW/2,y+7.2,{align:'center'});
  doc.setFillColor(192,0,0);doc.rect(x+logoW,y+12,centerW,h-12,'F');
  doc.setTextColor(255);doc.setFontSize(7.4);
  doc.text('REPORTE DE ACTOS Y CONDICIONES',x+logoW+centerW/2,y+20.1,{align:'center'});
  doc.setTextColor(0);
  const rx=x+logoW+centerW,labelW=19,rowH=h/4;
  const labels=['CÓDIGO:','N°:','Versión:','Fecha Act:'];
  const values=['EDP-SIG-SSOMAC-RE-EA-191','2','5','Jul-25'];
  for(let i=1;i<4;i++)doc.line(rx,y+i*rowH,x+w,y+i*rowH);
  doc.line(rx+labelW,y,rx+labelW,y+h);
  for(let i=0;i<4;i++){
    doc.setFont('helvetica','bold');doc.setFontSize(i===0?5.6:6.1);doc.text(labels[i],rx+1,y+i*rowH+4.25);
    doc.setFont('helvetica',i===0?'normal':'bold');doc.setFontSize(i===0?4.7:6.4);doc.text(values[i],rx+labelW+(rightW-labelW)/2,y+i*rowH+4.25,{align:'center'});
  }
}

function pdfDrawVerticalBand(doc,x,y,w,h,label){
  doc.setFillColor(90,90,90);doc.setDrawColor(0);doc.rect(x,y,w,h,'FD');
  doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(6.8);
  const letters=label.split('');
  const total=(letters.length-1)*4.4;
  let yy=y+(h-total)/2;
  for(const ch of letters){doc.text(ch,x+w/2,yy,{align:'center'});yy+=4.4;}
  doc.setTextColor(0);
}

function pdfDrawTopReporterSection(doc,o,reporter,hallazgoImages){
  const x=4,mainX=18,right=206,w=right-mainX,startY=29.5,endY=159.5;
  pdfDrawVerticalBand(doc,x,startY,14,endY-startY,'REPORTANTE');
  const rows=[11,11,11,12];
  let y=startY;
  const labels=['REPORTANTE:','LUGAR DE OCURRENCIA:','FECHA:','REPORTADO:'];
  for(let i=0;i<rows.length;i++){
    doc.setDrawColor(0);doc.setLineWidth(.35);doc.rect(mainX,y,w,rows[i]);
    doc.setFont('helvetica','normal');doc.setFontSize(5.9);doc.text(labels[i],mainX+1.2,y+3.4);
    if(i===0){doc.setFont('helvetica','bold');doc.setFontSize(7.2);doc.text(pdfSafeText(reporter,'-'),mainX+27,y+6.7);}
    if(i===1){doc.setFont('helvetica','bold');doc.setFontSize(7);doc.text(pdfSafeText(o.lugar_hallazgo,'-'),mainX+31,y+6.7);}
    if(i===2){doc.setFont('helvetica','bold');doc.setFontSize(7);doc.text(pdfFormatDate(o.fecha),mainX+16,y+6.7);}
    if(i===3){doc.setFont('helvetica','italic');doc.setFontSize(5.2);doc.text('(Completar sólo en caso de Acto Subestándar)',mainX+1.2,y+8.0);}
    y+=rows[i];
  }
  const descY=y,descH=endY-descY;
  doc.setDrawColor(0);doc.rect(mainX,descY,w,descH);
  doc.setFont('helvetica','normal');doc.setFontSize(5.9);
  doc.text('DESCRIPCIÓN: (Qué se observó)',mainX+1.2,descY+3.6);
  const descLines=doc.splitTextToSize(pdfSafeText(o.descripcion,'Sin descripción registrada.'),w-4).slice(0,6);
  doc.setFont('helvetica','bold');doc.setFontSize(6.7);doc.text(descLines,mainX+2,descY+7.2);
  const textH=Math.max(8,descLines.length*3.0+5);
  const photoY=descY+textH;
  const photoH=Math.max(8,descY+descH-photoY-1.5);
  pdfDrawPhotoGrid(doc,hallazgoImages,mainX+2,photoY,w-4,photoH);
}

function pdfDrawSupervisorSection(doc,o,assignmentDate,latestLiftComment,liftImages,signatureImage,signerName){
  const x=4,mainX=18,right=206,w=right-mainX,startY=159.5,endY=293;
  pdfDrawVerticalBand(doc,x,startY,14,endY-startY,'SUPERVISOR');
  let y=startY;
  doc.setDrawColor(0);doc.setLineWidth(.35);doc.rect(mainX,y,w,5.5);
  doc.setFont('helvetica','italic');doc.setFontSize(5.2);doc.text('Será completado por el responsable quien cumplirá la acción propuesta',mainX+1.2,y+3.6);y+=5.5;
  doc.rect(mainX,y,w,10);
  const isAct=String(o.tipo?.codigo||o.tipo?.nombre||'').toUpperCase().includes('ACTO');
  const isCond=String(o.tipo?.codigo||o.tipo?.nombre||'').toUpperCase().includes('COND');
  pdfDrawCheckbox(doc,mainX+28,y+6.4,'Acto Subestándar',isAct);
  pdfDrawCheckbox(doc,mainX+95,y+6.4,'Condición Subestándar',isCond);y+=10;
  doc.rect(mainX,y,w,10);
  doc.setFont('helvetica','bold');doc.setFontSize(6.3);doc.text('Potencial de Pérdida:',mainX+1.2,y+6.3);
  const pot=String(o.potencial?.nombre||'').toUpperCase();
  pdfDrawCheckbox(doc,mainX+70,y+6.4,'Alto',pot.includes('ALTO'));
  pdfDrawCheckbox(doc,mainX+96,y+6.4,'Medio',pot.includes('MEDIO'));
  pdfDrawCheckbox(doc,mainX+132,y+6.4,'Bajo',pot.includes('BAJO'));y+=10;
  const smallRows=[10,10,10,10];
  const labels=['NOMBRE:','FECHA RECIBIDO:','FECHA CORREGIDO:','FECHA CONTESTADO:'];
  const values=[pdfSafeText(o.responsable_correccion,'-'),pdfSafeText(assignmentDate,'-'),pdfSafeText(pdfFormatDate(o.fecha_ejecutada),'-'),pdfSafeText(pdfFormatDate(o.fecha_validacion),'-')];
  for(let i=0;i<smallRows.length;i++){
    doc.rect(mainX,y,w,smallRows[i]);
    doc.setFont('helvetica','normal');doc.setFontSize(5.9);doc.text(labels[i],mainX+1.2,y+3.5);
    doc.setFont('helvetica','bold');doc.setFontSize(6.7);doc.text(values[i],mainX+36,y+6.4);
    y+=smallRows[i];
  }
  const signatureH=20;
  const signatureY=endY-signatureH;
  const actionH=signatureY-y;
  doc.rect(mainX,y,w,actionH);
  doc.setFont('helvetica','normal');doc.setFontSize(5.9);doc.text('QUE SE HIZO O QUE SE DEBE HACER PARA CORREGIR:',mainX+1.2,y+3.5);
  doc.setFont('helvetica','italic');doc.setFontSize(5.1);doc.text('(Adjuntar foto y evidencia)',mainX+1.2,y+6.3);
  const actionText=latestLiftComment||o.acciones_implementar||'Sin acción de levantamiento registrada.';
  const actionLines=doc.splitTextToSize(actionText,w-4).slice(0,5);
  doc.setFont('helvetica','bold');doc.setFontSize(6.5);doc.text(actionLines,mainX+2,y+10);
  const textH=Math.max(14,actionLines.length*2.9+9);
  const photoY=y+textH;
  const photoH=Math.max(7,signatureY-photoY-1.2);
  pdfDrawPhotoGrid(doc,liftImages,mainX+2,photoY,w-4,photoH);

  doc.rect(mainX,signatureY,w,signatureH);
  doc.setFont('helvetica','bold');doc.setFontSize(5.8);
  doc.text('FIRMA DE QUIEN REALIZA EL LEVANTAMIENTO:',mainX+1.2,signatureY+3.7);
  if(signatureImage){
    pdfDrawContainedImage(doc,signatureImage,mainX+3,signatureY+4.5,58,11.5,.6);
  }else{
    doc.setFont('helvetica','italic');doc.setFontSize(5.5);doc.setTextColor(120);
    doc.text('Sin firma digital registrada',mainX+3,signatureY+10.5);
    doc.setTextColor(0);
  }
  doc.setFont('helvetica','normal');doc.setFontSize(5.7);
  doc.text('Nombre:',mainX+66,signatureY+8.2);
  doc.setFont('helvetica','bold');doc.setFontSize(6.3);
  doc.text(pdfSafeText(signerName,'-'),mainX+82,signatureY+8.2);
}

function pdfDrawAnnexPage(doc,logo,title,items,occCode){
  doc.addPage('a4','portrait');
  pdfDrawCorporateHeader(doc,logo);
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(192,0,0);
  doc.text(`ANEXO FOTOGRÁFICO - ${title}`,105,38,{align:'center'});
  doc.setTextColor(0);doc.setFontSize(7);doc.text(`Registro: ${occCode}`,105,43,{align:'center'});
  const x=12,y=48,w=186,h=232,gap=5,cellW=(w-gap)/2,cellH=(h-gap)/2;
  items.slice(0,4).forEach((item,i)=>{
    const c=i%2,r=Math.floor(i/2),px=x+c*(cellW+gap),py=y+r*(cellH+gap);
    doc.setDrawColor(120);doc.setLineWidth(.3);doc.rect(px,py,cellW,cellH);
    pdfDrawContainedImage(doc,item.image,px+1,py+1,cellW-2,cellH-12,.8);
    doc.setFont('helvetica','normal');doc.setFontSize(5.8);doc.setTextColor(60);
    const cap=doc.splitTextToSize(item.caption||title,cellW-4).slice(0,3);
    doc.text(cap,px+2,py+cellH-9);
  });
  doc.setFont('helvetica','italic');doc.setFontSize(5.5);doc.setTextColor(100);
  doc.text('Documento generado desde SSOMAC Digital - Explo Drilling Perú',105,290,{align:'center'});
  doc.setTextColor(0);
}

async function downloadOccurrenceReportPdf({occurrence:o,reporter,occurrenceId}){
  const jsPDFClass=window.jspdf?.jsPDF;
  if(!jsPDFClass)throw new Error('No se cargó el generador PDF. Actualiza la página e inténtalo nuevamente.');
  const [evidences,history,logo]=await Promise.all([
    fetchEvidenceForPdf(occurrenceId),
    fetchHistoryForPdf(occurrenceId),
    pdfLoadLogo()
  ]);
  const hallazgo=evidences.filter(e=>String(e.tipo_evidencia||'').toUpperCase()==='HALLAZGO');
  const lifts=evidences.filter(e=>String(e.tipo_evidencia||'').toUpperCase()==='LEVANTAMIENTO');
  const signatures=evidences.filter(e=>String(e.tipo_evidencia||'').toUpperCase()==='FIRMA_LEVANTAMIENTO');
  const allImageEvidence=[...hallazgo,...lifts,...signatures].filter(e=>e.signed_url);
  const imageMap=new Map();
  for(const e of allImageEvidence){
    try{imageMap.set(e.id,await urlToPdfImage(e.signed_url));}
    catch(err){console.warn('No se pudo cargar evidencia para PDF',e.id,err);}
  }
  const hallazgoImages=hallazgo.map(e=>imageMap.get(e.id)).filter(Boolean);
  const liftImages=lifts.map(e=>imageMap.get(e.id)).filter(Boolean);
  const assignedEvent=history.find(h=>h.tipo_evento==='RESPONSABLE_ASIGNADO');
  const assignmentDate=assignedEvent?pdfFormatDate(assignedEvent.creado_en):pdfFormatDate(o.fecha);
  const latestLiftComment=[...lifts].reverse().find(e=>pdfSafeText(e.comentario))?.comentario||'';
  const latestSignature=[...signatures].reverse().find(e=>imageMap.get(e.id));
  const signatureImage=latestSignature?imageMap.get(latestSignature.id):null;
  const signerName=pdfSafeText(latestSignature?.comentario||o.levantado_por_externo||o.responsable_correccion,'-');
  const doc=new jsPDFClass({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  doc.setProperties({
    title:`Reporte de Actos y Condiciones - OC-${String(o.numero).padStart(6,'0')}`,
    subject:'Reporte individual SSOMAC',
    author:'Explo Drilling Perú - SSOMAC Digital'
  });
  pdfDrawCorporateHeader(doc,logo);
  pdfDrawTopReporterSection(doc,o,reporter,hallazgoImages);
  pdfDrawSupervisorSection(doc,o,assignmentDate,latestLiftComment,liftImages,signatureImage,signerName);
  const occCode=`OC-${String(o.numero).padStart(6,'0')}`;
  doc.setFont('helvetica','normal');doc.setFontSize(5.4);doc.setTextColor(90);
  doc.text(`Registro digital: ${occCode} | Proyecto: ${pdfSafeText(o.proyecto?.nombre,'-')}`,105,296,{align:'center'});
  // Mantener todas las fotos: si existen más de cuatro por tipo, se agregan anexos.
  const annex=[];
  hallazgo.forEach((e,i)=>{
    const img=imageMap.get(e.id);if(img)annex.push({kind:'HALLAZGO',image:img,caption:`Hallazgo ${i+1} - ${pdfFormatDate(e.creado_en)}${e.comentario?' - '+e.comentario:''}`});
  });
  lifts.forEach((e,i)=>{
    const img=imageMap.get(e.id);if(img)annex.push({kind:'LEVANTAMIENTO',image:img,caption:`Levantamiento ${i+1} - ${pdfFormatDate(e.creado_en)}${e.comentario?' - '+e.comentario:''}`});
  });
  // Las primeras cuatro de cada tipo ya se muestran en el formato principal. Los excedentes van como anexos.
  const extra=[...annex.filter(x=>x.kind==='HALLAZGO').slice(4),...annex.filter(x=>x.kind==='LEVANTAMIENTO').slice(4)];
  for(let i=0;i<extra.length;i+=4){pdfDrawAnnexPage(doc,logo,'EVIDENCIAS ADICIONALES',extra.slice(i,i+4),occCode);}
  doc.save(`REPORTE_ACTOS_CONDICIONES_${occCode}.pdf`);
}

// ============================================================
// HISTORIAL Y TRAZABILIDAD DE OCURRENCIAS (V10.4)
// ============================================================
function formatHistoryDateTime(value){
  if(!value)return 'Fecha no disponible';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return new Intl.DateTimeFormat('es-PE',{
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit'
  }).format(d);
}

function historyEventClass(type=''){
  if(['OCURRENCIA_CERRADA','BUENA_PRACTICA_REGISTRADA'].includes(type))return 'success';
  if(type==='LEVANTAMIENTO_DEVUELTO')return 'warning';
  if(type==='LEVANTAMIENTO_ENVIADO')return 'info';
  if(['RESPONSABLE_ASIGNADO','RESPONSABLE_MODIFICADO','FECHA_LIMITE_MODIFICADA','PLAZO_AMPLIADO'].includes(type))return 'assignment';
  if(type==='TRAZABILIDAD_ACTIVADA')return 'baseline';
  return 'neutral';
}

function formatHistoryState(value){
  return String(value||'').replaceAll('_',' ');
}

async function renderOccurrenceHistory(occId,container){
  if(!container)return;
  const {data,error}=await sb.from('historial_ocurrencias')
    .select('id,tipo_evento,titulo,detalle,estado_anterior,estado_nuevo,actor_nombre,creado_en,evidencia_id')
    .eq('ocurrencia_id',occId)
    .order('creado_en',{ascending:true});
  if(error)throw error;
  if(!data?.length){
    container.innerHTML='<div class="list-item">Aún no existen eventos de trazabilidad para esta ocurrencia.</div>';
    return;
  }

  container.innerHTML=`<div class="history-timeline">${data.map((event,index)=>{
    const stateChanged=event.estado_anterior&&event.estado_nuevo&&event.estado_anterior!==event.estado_nuevo;
    const actor=event.actor_nombre||'Sistema';
    return `<article class="history-event ${historyEventClass(event.tipo_evento)}">
      <div class="history-marker" aria-hidden="true"><span></span></div>
      <div class="history-content">
        <div class="history-heading">
          <div>
            <strong>${escapeHtml(event.titulo||event.tipo_evento||'Evento')}</strong>
            <small>${escapeHtml(formatHistoryDateTime(event.creado_en))} · ${escapeHtml(actor)}</small>
          </div>
          <span class="history-number">${index+1}</span>
        </div>
        ${event.detalle?`<p>${escapeHtml(event.detalle)}</p>`:''}
        ${stateChanged?`<div class="history-state-change"><span>${escapeHtml(formatHistoryState(event.estado_anterior))}</span><b>→</b><span>${escapeHtml(formatHistoryState(event.estado_nuevo))}</span></div>`:''}
      </div>
    </article>`;
  }).join('')}</div>`;
}


// ============================================================
// AMPLIACION DE PLAZO CONTROLADA (V10.5 / ETAPA 34)
// ============================================================
function addDaysYmd(value,days){
  const d=parseYmdLocal(value);
  if(!d)return '';
  d.setDate(d.getDate()+days);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function deadlineStatusClass(code=''){
  if(code==='VENCIDO')return 'danger';
  if(code==='POR_VENCER')return 'warning';
  if(code==='EN_PLAZO')return 'success';
  if(code==='LEVANTADO')return 'info';
  return 'neutral';
}

async function renderDeadlineManagement(o,profile,occId,container,msg){
  if(!container)return;

  if(o.origen?.nombre==='BUENA PRACTICA'){
    container.innerHTML='<div class="list-item">Buena práctica: no requiere plazo de levantamiento.</div>';
    return;
  }

  const {data:extensions,error}=await sb.from('ampliaciones_plazo')
    .select('id,fecha_anterior,fecha_nueva,dias_ampliados,motivo,actor_nombre,creado_en')
    .eq('ocurrencia_id',occId)
    .order('creado_en',{ascending:true});
  if(error)throw error;

  const history=extensions||[];
  const original=o.fecha_levantamiento_original||o.fecha_levantamiento||null;
  const current=o.fecha_levantamiento||null;
  const deadline=getDeadlineInfo(o);
  const canExtend=['ADMIN','SIG','ING_SEGURIDAD'].includes(profile.rol)
    && ['ABIERTO','EN_PROCESO'].includes(o.estado?.codigo)
    && Boolean(current);
  const count=Math.max(Number(o.numero_ampliaciones||0),history.length);

  let reason='';
  if(!current)reason='La ocurrencia no tiene una fecha límite definida. La ampliación aplica únicamente sobre un plazo existente.';
  else if(o.estado?.codigo==='PENDIENTE_VALIDACION')reason='El levantamiento ya fue presentado y se encuentra pendiente de validación; el plazo ya no corresponde ampliarlo.';
  else if(o.estado?.codigo==='CERRADO')reason='La ocurrencia está cerrada y su plazo ya no puede modificarse.';
  else if(!['ADMIN','SIG','ING_SEGURIDAD'].includes(profile.rol))reason='Tu perfil puede consultar el plazo, pero no autorizar ampliaciones.';

  const historyHtml=history.length?`<details class="extension-history">
    <summary>Ver historial de ampliaciones (${history.length})</summary>
    <div class="extension-list">${history.map((x,i)=>`<article class="extension-item">
      <div class="extension-item-head"><strong>Ampliación ${i+1}</strong><span>${escapeHtml(formatHistoryDateTime(x.creado_en))}</span></div>
      <div class="extension-dates"><span>${escapeHtml(formatDateEsV6(x.fecha_anterior))}</span><b>→</b><span>${escapeHtml(formatDateEsV6(x.fecha_nueva))}</span><em>+${Number(x.dias_ampliados||0)} día${Number(x.dias_ampliados||0)===1?'':'s'}</em></div>
      <p>${escapeHtml(x.motivo||'')}</p>
      <small>Autorizado por: ${escapeHtml(x.actor_nombre||'Sistema')}</small>
    </article>`).join('')}</div>
  </details>`:'';

  container.innerHTML=`
    <div class="deadline-management-card">
      <div class="deadline-summary-grid">
        <div><span>Fecha original</span><strong>${escapeHtml(original?formatDateEsV6(original):'Sin fecha')}</strong></div>
        <div><span>Fecha vigente</span><strong>${escapeHtml(current?formatDateEsV6(current):'Sin fecha')}</strong></div>
        <div><span>Estado del plazo</span><strong><span class="deadline-inline ${deadlineStatusClass(deadline.code)}">${escapeHtml(deadline.label)}</span></strong></div>
        <div><span>Ampliaciones</span><strong>${count}</strong></div>
      </div>
      ${count>0?'<p class="deadline-note">La fecha original se conserva para auditoría. El semáforo y los reportes usan la fecha vigente.</p>':''}
      ${historyHtml}
      ${canExtend?`<div class="deadline-actions"><button id="showExtensionFormBtn" class="secondary">Ampliar plazo</button></div>
      <div id="extensionFormBox" class="extension-form hidden">
        <div class="form-grid">
          <div><label for="newDeadline">Nueva fecha límite *</label><input id="newDeadline" type="date" min="${escapeHtml(addDaysYmd(current,1))}"></div>
          <div class="full"><label for="extensionReason">Motivo de ampliación *</label><textarea id="extensionReason" rows="4" maxlength="800" placeholder="Ej.: Se requiere adquirir un repuesto para ejecutar la corrección definitiva."></textarea><small>Mínimo 10 caracteres. El motivo quedará registrado en la trazabilidad.</small></div>
        </div>
        <div class="workflow-actions"><button id="saveExtensionBtn" class="warning">Guardar ampliación</button><button id="cancelExtensionBtn" class="secondary">Cancelar</button></div>
        <p id="extensionMessage" class="message"></p>
      </div>`:`${reason?`<div class="deadline-readonly-note">${escapeHtml(reason)}</div>`:''}`}
    </div>`;

  if(!canExtend)return;

  const formBox=document.getElementById('extensionFormBox');
  const showBtn=document.getElementById('showExtensionFormBtn');
  const cancelBtn=document.getElementById('cancelExtensionBtn');
  const saveBtn=document.getElementById('saveExtensionBtn');
  const newDate=document.getElementById('newDeadline');
  const reasonEl=document.getElementById('extensionReason');
  const localMsg=document.getElementById('extensionMessage');

  showBtn?.addEventListener('click',()=>{
    formBox.classList.remove('hidden');
    showBtn.classList.add('hidden');
    newDate?.focus();
  });
  cancelBtn?.addEventListener('click',()=>{
    formBox.classList.add('hidden');
    showBtn.classList.remove('hidden');
    if(localMsg)showMessage(localMsg,'');
  });

  saveBtn?.addEventListener('click',async()=>{
    const dateValue=newDate?.value||'';
    const motive=reasonEl?.value.trim()||'';
    if(!dateValue){showMessage(localMsg,'Selecciona la nueva fecha límite.');return;}
    if(dateValue<=current){showMessage(localMsg,'La nueva fecha debe ser posterior a la fecha vigente.');return;}
    if(motive.length<10){showMessage(localMsg,'Registra un motivo de al menos 10 caracteres.');return;}

    saveBtn.disabled=true;saveBtn.textContent='Guardando...';
    try{
      const {error:rpcError}=await sb.rpc('ampliar_plazo_ocurrencia',{
        p_ocurrencia_id:occId,
        p_fecha_nueva:dateValue,
        p_motivo:motive
      });
      if(rpcError)throw rpcError;
      showMessage(localMsg,'Plazo ampliado correctamente. La fecha original y el motivo quedaron registrados.',true);
      setTimeout(()=>location.reload(),500);
    }catch(err){
      console.error(err);
      showMessage(localMsg,'No se pudo ampliar el plazo: '+(err.message||err));
      saveBtn.disabled=false;saveBtn.textContent='Guardar ampliación';
    }
  });
}

function renderWorkflow(o,profile,statuses,session,box,msg,occId){
  const state=o.estado?.codigo;
  if(o.origen?.nombre==='BUENA PRACTICA'){box.innerHTML='<div class="list-item">Buena práctica: no requiere levantamiento ni validación.</div>';return;}
  if(state==='ABIERTO'){
    box.innerHTML=`<div class="workflow-box"><p>La ocurrencia está abierta.</p><div class="workflow-actions"><button id="startBtn" class="warning">Marcar en proceso</button></div></div>${liftForm()}`;
    document.getElementById('startBtn').addEventListener('click',()=>updateStateOnly(occId,statuses.EN_PROCESO.id,msg));
    bindLiftForm(occId,session,statuses,msg);
  }else if(state==='EN_PROCESO'){
    box.innerHTML=liftForm();bindLiftForm(occId,session,statuses,msg);
  }else if(state==='PENDIENTE_VALIDACION'){
    const canValidate=['ADMIN','SIG','ING_SEGURIDAD'].includes(profile.rol);
    box.innerHTML=canValidate?`<div class="workflow-box"><label for="validationNote">Observación de validación</label><textarea id="validationNote" rows="3" placeholder="Conformidad u observación...">${escapeHtml(o.observacion_validacion||'')}</textarea><div class="workflow-actions"><button id="closeBtn" class="success">Validar y cerrar</button><button id="rejectBtn" class="warning">Devolver a corrección</button></div></div>`:'<div class="list-item">Pendiente de validación por Seguridad / SIG.</div>';
    if(canValidate){
      document.getElementById('closeBtn').addEventListener('click',async()=>{const note=document.getElementById('validationNote').value.trim();const {error}=await sb.from('ocurrencias').update({estado_id:statuses.CERRADO.id,validado_por_id:session.user.id,fecha_validacion:new Date().toISOString(),observacion_validacion:note||null}).eq('id',occId);if(error){showMessage(msg,error.message);return;}location.reload();});
      document.getElementById('rejectBtn').addEventListener('click',async()=>{const note=document.getElementById('validationNote').value.trim();if(!note){showMessage(msg,'Indica el motivo de devolución.');return;}const {error}=await sb.from('ocurrencias').update({estado_id:statuses.EN_PROCESO.id,observacion_validacion:note}).eq('id',occId);if(error){showMessage(msg,error.message);return;}location.reload();});
    }
  }else if(state==='CERRADO'){
    box.innerHTML='<div class="list-item">Ocurrencia cerrada. No requiere acciones adicionales.</div>';
  }
}
function liftForm(){return `<div class="workflow-box"><h3>Registrar levantamiento</h3><label for="liftComment">Acción realizada *</label><textarea id="liftComment" rows="3" placeholder="Describa la corrección ejecutada..."></textarea><label for="liftPhoto">Evidencia de levantamiento *</label><input id="liftPhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><label for="liftSignerName">Nombre de quien realiza el levantamiento *</label><input id="liftSignerName" type="text" maxlength="180" placeholder="Nombres y apellidos"><div class="signature-box"><div class="signature-head"><div><strong>Firma digital *</strong><small>Firma con el dedo, lápiz táctil o mouse.</small></div><button id="liftClearSignature" type="button" class="secondary signature-clear">Limpiar firma</button></div><canvas id="liftSignature" class="signature-pad" width="900" height="260"></canvas></div><div class="workflow-actions"><button id="sendValidationBtn">Enviar para validación</button></div></div>`;}
function bindLiftForm(occId,session,statuses,msg){
  const signerEl=document.getElementById('liftSignerName');
  const signaturePad=createSignaturePad(document.getElementById('liftSignature'),document.getElementById('liftClearSignature'));
  getProfile(session.user.id).then(p=>{if(signerEl&&!signerEl.value)signerEl.value=`${p.nombres||''} ${p.apellidos||''}`.trim();}).catch(()=>{});
  document.getElementById('sendValidationBtn').addEventListener('click',async()=>{
    const comment=document.getElementById('liftComment').value.trim(),file=document.getElementById('liftPhoto').files?.[0],signerName=signerEl?.value.trim();
    if(!comment||!file||!signerName||signaturePad?.isEmpty()){showMessage(msg,'Debes registrar la acción, la fotografía, el nombre de quien levanta y su firma digital.');return;}
    const btn=document.getElementById('sendValidationBtn');btn.disabled=true;btn.textContent='Enviando...';
    try{
      const blob=await optimizeImage(file),path=`ocurrencias/${occId}/levantamiento/${Date.now()}_${uid()}.webp`;
      const {error:ue}=await sb.storage.from('evidencias-ssomac').upload(path,blob,{contentType:'image/webp',upsert:false});if(ue)throw ue;
      const {error:ee}=await sb.from('evidencias').insert({ocurrencia_id:occId,tipo_evidencia:'LEVANTAMIENTO',ruta_archivo:path,comentario:comment,creado_por_id:session.user.id});if(ee)throw ee;
      const signatureBlob=await signaturePad.toBlob();
      const signaturePath=`ocurrencias/${occId}/levantamiento/firma_${Date.now()}_${uid()}.webp`;
      const {error:sue}=await sb.storage.from('evidencias-ssomac').upload(signaturePath,signatureBlob,{contentType:'image/webp',upsert:false});if(sue)throw sue;
      const {error:see}=await sb.from('evidencias').insert({ocurrencia_id:occId,tipo_evidencia:'FIRMA_LEVANTAMIENTO',ruta_archivo:signaturePath,comentario:signerName,creado_por_id:session.user.id});if(see)throw see;
      const {error:oe}=await sb.from('ocurrencias').update({estado_id:statuses.PENDIENTE_VALIDACION.id,fecha_ejecutada:today(),levantado_por_id:session.user.id}).eq('id',occId);if(oe)throw oe;
      location.reload();
    }catch(err){showMessage(msg,'No se pudo registrar el levantamiento: '+(err.message||err));btn.disabled=false;btn.textContent='Enviar para validación';}
  });
}
async function updateStateOnly(id,stateId,msg){const {error}=await sb.from('ocurrencias').update({estado_id:stateId}).eq('id',id);if(error){showMessage(msg,error.message);return;}location.reload();}

async function optimizeImage(file){
  const img=await loadImage(file),max=1280;let w=img.width,h=img.height,s=Math.min(1,max/w,max/h);w=Math.round(w*s);h=Math.round(h*s);
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
  let q=.78,b=await canvasToBlob(c,q);while(b.size>1.8*1024*1024&&q>.45){q-=.08;b=await canvasToBlob(c,q);}return b;
}
function loadImage(file){return new Promise((res,rej)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=rej;i.src=u;});}
function canvasToBlob(c,q){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('No se pudo procesar la imagen.')),'image/webp',q));}

initGlobalShellV40();

if(page==='login')initLogin();
if(page==='app')initApp();
if(page==='new-occurrence')initNewOccurrence();
if(page==='occurrences')initOccurrences();
if(page==='occurrence-detail')initOccurrenceDetail();


// ============================================================
// REPORTE DIARIO
// ============================================================
// ============================================================
// REPORTE DIARIO V6 - TODOS LOS PROYECTOS + EXCEL CORPORATIVO
// ============================================================
const MONTHS_ES_V6 = [
  'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
];

const EXPLO_LOGO_BASE64 = 'data:image/png;base64,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';

function formatDateEsV6(value){
  if(!value) return 'N.A.';
  const p=String(value).slice(0,10).split('-');
  return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : value;
}

function monthNameEsV6(value){
  if(!value) return '';
  const p=String(value).slice(0,10).split('-');
  return MONTHS_ES_V6[Number(p[1])-1] || '';
}

async function urlImageToPngDataUrl(url){
  if(!url) return null;
  try {
    const response=await fetch(url);
    if(!response.ok) throw new Error('No se pudo descargar la evidencia');
    const blob=await response.blob();
    const bitmap=await createImageBitmap(blob);
    const maxW=520, maxH=320;
    const scale=Math.min(1,maxW/bitmap.width,maxH/bitmap.height);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#FFFFFF';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png',0.92);
  } catch(err) {
    console.warn('No se pudo convertir evidencia para Excel:',err);
    return null;
  }
}

async function initDailyReport(){
  const session=await requireSession();
  if(!session)return;
  document.getElementById('logoutBtn').addEventListener('click',logout);

  const projectEl=document.getElementById('reportProject');
  const monthEl=document.getElementById('reportMonth');
  const bodyEl=document.getElementById('dailyReportBody');
  const countEl=document.getElementById('reportCount');
  const msgEl=document.getElementById('reportMessage');
  const exportBtn=document.getElementById('exportExcelBtn');

  monthEl.value=today().slice(0,7);
  let rows=[];
  let projectName='TODOS LOS PROYECTOS';
  let reportPeriodLabel='';

  const {data:links,error:le}=await sb.from('usuario_proyectos')
    .select('proyecto_id,proyectos(id,nombre,cliente)')
    .eq('usuario_id',session.user.id);
  if(le){showMessage(msgEl,'No se pudieron cargar los proyectos: '+le.message);return;}

  projectEl.innerHTML='<option value="ALL">TODOS LOS PROYECTOS</option>'+
    (links||[]).map(r=>`<option value="${r.proyectos.id}">${escapeHtml(r.proyectos.nombre)}</option>`).join('');
  projectEl.value='ALL';

  projectEl.addEventListener('change',loadReport);
  monthEl.addEventListener('change',loadReport);
  exportBtn.addEventListener('click',exportExcelCorporate);

  function getMonthRange(value){
    const [year,month]=String(value||'').split('-').map(Number);
    if(!year||!month)return null;
    const mm=String(month).padStart(2,'0');
    const lastDay=new Date(year,month,0).getDate();
    return {
      start:`${year}-${mm}-01`,
      end:`${year}-${mm}-${String(lastDay).padStart(2,'0')}`,
      label:`${MONTHS_ES_V6[month-1]} ${year}`
    };
  }

  async function loadReport(){
    rows=[];countEl.textContent='0';exportBtn.disabled=true;showMessage(msgEl,'');
    const period=getMonthRange(monthEl.value);
    if(!period)return;

    reportPeriodLabel=period.label;
    projectName=projectEl.value==='ALL'?'TODOS LOS PROYECTOS':projectEl.options[projectEl.selectedIndex].text;
    bodyEl.innerHTML='<tr><td colspan="19" class="empty-cell">Cargando consolidado mensual...</td></tr>';

    let query=sb.from('ocurrencias').select(`
      id,numero,fecha,lugar_hallazgo,descripcion,acciones_implementar,
      responsable_correccion,fecha_levantamiento,fecha_ejecutada,reportado_por_id,reportado_por_externo,
      proyecto:proyectos(nombre),origen:origenes_hallazgo(nombre),
      tipo:tipos_hallazgo(nombre),potencial:potenciales_perdida(nombre),
      area:areas(nombre),estado:estados_ocurrencia(nombre,codigo)
    `).gte('fecha',period.start).lte('fecha',period.end).order('fecha',{ascending:true}).order('numero',{ascending:true});

    if(projectEl.value!=='ALL') query=query.eq('proyecto_id',projectEl.value);

    const {data:occurrences,error}=await query;
    if(error){showMessage(msgEl,'No se pudo generar el resumen mensual: '+error.message);return;}
    if(!occurrences?.length){
      bodyEl.innerHTML='<tr><td colspan="19" class="empty-cell">No hay ocurrencias registradas para este mes.</td></tr>';
      return;
    }

    const ids=occurrences.map(o=>o.id);
    const reporterIds=[...new Set(occurrences.map(o=>o.reportado_por_id).filter(Boolean))];
    const [pr,ci,cb,ev]=await Promise.all([
      reporterIds.length?sb.from('perfiles').select('id,nombres,apellidos').in('id',reporterIds):Promise.resolve({data:[],error:null}),
      sb.from('ocurrencia_causas_inmediatas').select('ocurrencia_id,causas_inmediatas(nombre)').in('ocurrencia_id',ids),
      sb.from('ocurrencia_causas_basicas').select('ocurrencia_id,causas_basicas(nombre)').in('ocurrencia_id',ids),
      sb.from('evidencias').select('ocurrencia_id,tipo_evidencia,ruta_archivo,creado_en').in('ocurrencia_id',ids).order('creado_en')
    ]);
    const er=[pr.error,ci.error,cb.error,ev.error].find(Boolean);
    if(er){showMessage(msgEl,'No se pudieron completar los datos: '+er.message);return;}

    const reporters=new Map((pr.data||[]).map(p=>[p.id,`${p.nombres||''} ${p.apellidos||''}`.trim()]));
    const im=new Map(),bm=new Map(),em=new Map();
    (ci.data||[]).forEach(x=>{if(!im.has(x.ocurrencia_id))im.set(x.ocurrencia_id,[]);im.get(x.ocurrencia_id).push(x.causas_inmediatas?.nombre||'');});
    (cb.data||[]).forEach(x=>{if(!bm.has(x.ocurrencia_id))bm.set(x.ocurrencia_id,[]);bm.get(x.ocurrencia_id).push(x.causas_basicas?.nombre||'');});
    for(const e of (ev.data||[])){
      if(!em.has(e.ocurrencia_id))em.set(e.ocurrencia_id,[]);
      const {data:signed}=await sb.storage.from('evidencias-ssomac').createSignedUrl(e.ruta_archivo,1800);
      em.get(e.ocurrencia_id).push({...e,signedUrl:signed?.signedUrl||''});
    }

    rows=occurrences.map((o,i)=>{
      const good=o.origen?.nombre==='BUENA PRACTICA';
      const es=em.get(o.id)||[];
      const display=es.find(e=>e.tipo_evidencia==='LEVANTAMIENTO')||es.find(e=>e.tipo_evidencia==='HALLAZGO')||es[0];
      return {
        item:String(i+1).padStart(2,'0'),proyecto:o.proyecto?.nombre||'',mes:monthNameEsV6(o.fecha),
        origen:o.origen?.nombre||'',fecha:formatDateEsV6(o.fecha),reportado:o.reportado_por_externo||reporters.get(o.reportado_por_id)||'N.A.',
        lugar:o.lugar_hallazgo||'',clasificacion:good?'N.A.':(o.tipo?.nombre||'N.A.'),descripcion:o.descripcion||'',
        inmediatas:good?'N.A.':((im.get(o.id)||[]).join(' | ')||'N.A.'),
        basicas:good?'N.A.':((bm.get(o.id)||[]).join(' | ')||'N.A.'),acciones:good?'N.A.':(o.acciones_implementar||'N.A.'),
        potencial:good?'N.A.':(o.potencial?.nombre||'N.A.'),responsable:good?'N.A.':(o.responsable_correccion||'N.A.'),
        area:good?'N.A.':(o.area?.nombre||'N.A.'),flevant:good?'N.A.':formatDateEsV6(o.fecha_levantamiento),
        fejecutada:good?'N.A.':formatDateEsV6(o.fecha_ejecutada),estado:o.estado?.nombre||'',
        evidencia:display?'SI':'NO',evidenciaTipo:display?.tipo_evidencia||'',evidenciaUrl:display?.signedUrl||'',evidenciaCantidad:es.length
      };
    });

    countEl.textContent=String(rows.length);exportBtn.disabled=false;
    bodyEl.innerHTML=rows.map(r=>`<tr>
      <td>${escapeHtml(r.item)}</td><td>${escapeHtml(r.proyecto)}</td><td>${escapeHtml(r.mes)}</td>
      <td>${escapeHtml(r.origen)}</td><td>${escapeHtml(r.fecha)}</td><td>${escapeHtml(r.reportado)}</td>
      <td>${escapeHtml(r.lugar)}</td><td>${escapeHtml(r.clasificacion)}</td><td>${escapeHtml(r.descripcion)}</td>
      <td>${escapeHtml(r.inmediatas)}</td><td>${escapeHtml(r.basicas)}</td><td>${escapeHtml(r.acciones)}</td>
      <td>${escapeHtml(r.potencial)}</td><td>${escapeHtml(r.responsable)}</td><td>${escapeHtml(r.area)}</td>
      <td>${escapeHtml(r.flevant)}</td><td>${escapeHtml(r.fejecutada)}</td><td>${escapeHtml(r.estado)}</td>
      <td>${r.evidenciaUrl?`<img class="evidence-thumb" src="${r.evidenciaUrl}" alt="Evidencia">`:''}
      <span class="evidence-small">${r.evidencia==='SI'?`${escapeHtml(r.evidenciaTipo)} · ${r.evidenciaCantidad} archivo(s)`:'Sin evidencia'}</span></td>
    </tr>`).join('');
  }

  async function exportExcelCorporate(){
    if(!rows.length) return;
    exportBtn.disabled=true;exportBtn.textContent='Generando Excel...';showMessage(msgEl,'',true);
    try {
      const wb=new ExcelJS.Workbook();
      wb.creator='SSOMAC Digital - Explo Drilling Perú';
      wb.created=new Date();
      const ws=wb.addWorksheet('REPORTE MENSUAL',{views:[{state:'frozen',ySplit:6}]});

      const widths=[6,17,11,20,12,20,22,20,28,22,22,25,15,22,22,17,15,13,26];
      widths.forEach((w,i)=>ws.getColumn(i+1).width=w);

      // Se conserva el encabezado del formato controlado EDP-SIG-SSOMAC-RE-EA-211.
      ws.mergeCells('A1:C4');
      ws.mergeCells('D1:P2');
      ws.mergeCells('D3:P4');
      ws.mergeCells('A5:P5');
      ws.mergeCells('Q1:R1');ws.mergeCells('Q2:R2');ws.mergeCells('Q3:R3');ws.mergeCells('Q4:R4');

      ws.getCell('D1').value='SIG - SSOMAC';
      ws.getCell('D1').font={bold:true,size:14,name:'Arial'};
      ws.getCell('D1').alignment={horizontal:'center',vertical:'middle'};

      ws.getCell('D3').value='RESUMEN DE REPORTE DE OCURRENCIAS DIARIAS';
      ws.getCell('D3').font={bold:true,size:16,color:{argb:'FFFFFFFF'},name:'Arial'};
      ws.getCell('D3').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFC00000'}};
      ws.getCell('D3').alignment={horizontal:'center',vertical:'middle'};

      ws.getCell('A5').value=`Consolidado mensual: ${reportPeriodLabel} · ${projectName}. Llenar en base a todas las ocurrencias suscitadas en inspecciones visuales, reportes de actos y condiciones identificados, o buenas prácticas en seguridad, salud ocupacional, medio ambiente y calidad operacional.`;
      ws.getCell('A5').font={size:9,name:'Arial'};
      ws.getCell('A5').alignment={horizontal:'left',vertical:'middle',wrapText:true};

      const meta=[['Q1','Código:','S1','EDP-SIG-SSOMAC-RE-EA-211'],['Q2','N°:','S2','3'],['Q3','Versión:','S3','7'],['Q4','Fecha Act:','S4','Jul-25']];
      for(const [lc,label,vc,value] of meta){
        ws.getCell(lc).value=label;ws.getCell(lc).font={bold:true,size:10,name:'Arial'};ws.getCell(lc).alignment={horizontal:'center',vertical:'middle'};
        ws.getCell(vc).value=value;ws.getCell(vc).font={size:10,name:'Arial'};ws.getCell(vc).alignment={horizontal:'center',vertical:'middle'};
      }

      for(let r=1;r<=5;r++){for(let c=1;c<=19;c++){
        const cell=ws.getCell(r,c);cell.border={top:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
      }}

      ws.getRow(1).height=18;ws.getRow(2).height=18;ws.getRow(3).height=20;ws.getRow(4).height=20;ws.getRow(5).height=28;

      const logoId=wb.addImage({base64:EXPLO_LOGO_BASE64,extension:'png'});
      ws.addImage(logoId,{tl:{col:0.18,row:0.15},ext:{width:150,height:72}});

      const headers=['Item','PROYECTO','MES','Origen de Hallazgo','Fecha','Reportado por','Lugar de Hallazgo','Acto/Condición Sub estándar','Descripción del hallazgo','Causas Inmediatas','Causa Básica','Acciones a implementar','Potencial de pérdida','Responsable de Corrección','Área responsable de seguimiento','Fecha Levantamiento','Fecha Ejecutada','Estado','Evidencia de Levantamiento (fotografías)'];
      const hr=ws.getRow(6);hr.values=headers;hr.height=44;
      hr.eachCell((cell)=>{
        cell.font={bold:true,color:{argb:'FFFFFFFF'},size:10,name:'Arial'};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF595959'}};
        cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
        cell.border={top:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
      });

      let excelRow=7;
      for(const r of rows){
        const row=ws.getRow(excelRow);
        row.values=[r.item,r.proyecto,r.mes,r.origen,r.fecha,r.reportado,r.lugar,r.clasificacion,r.descripcion,r.inmediatas,r.basicas,r.acciones,r.potencial,r.responsable,r.area,r.flevant,r.fejecutada,r.estado,''];
        row.height=78;
        row.eachCell({includeEmpty:true},(cell,col)=>{
          cell.font={size:9,name:'Arial'};
          cell.alignment={horizontal:col===1?'center':'left',vertical:'middle',wrapText:true};
          cell.border={top:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
        });

        if(r.evidenciaUrl){
          const png=await urlImageToPngDataUrl(r.evidenciaUrl);
          if(png){
            const imageId=wb.addImage({base64:png,extension:'png'});
            ws.addImage(imageId,{tl:{col:18.12,row:excelRow-1+0.12},ext:{width:155,height:88}});
          } else {
            ws.getCell(excelRow,19).value=r.evidenciaTipo||'EVIDENCIA';
          }
        } else {
          ws.getCell(excelRow,19).value='SIN EVIDENCIA';
          ws.getCell(excelRow,19).alignment={horizontal:'center',vertical:'middle',wrapText:true};
        }
        excelRow++;
      }

      ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.2,right:0.2,top:0.3,bottom:0.3,header:0.1,footer:0.1}};
      ws.autoFilter={from:'A6',to:'S6'};

      const buffer=await wb.xlsx.writeBuffer();
      const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;
      const safe=projectName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
      a.download=`EDP-SIG-SSOMAC-RE-EA-211_${safe}_${monthEl.value}.xlsx`;
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
      showMessage(msgEl,`Excel mensual de ${reportPeriodLabel} generado correctamente.`,true);
    } catch(err) {
      console.error(err);showMessage(msgEl,'No se pudo generar el Excel: '+(err.message||err));
    } finally {
      exportBtn.disabled=false;exportBtn.textContent='Exportar Excel mensual';
    }
  }

  // Al abrir el módulo muestra automáticamente el consolidado del mes actual.
  await loadReport();
}

if(page==='daily-report')initDailyReport();



// ============================================================
// ADMINISTRACIÓN DE RESPONSABLES DE CORRECCIÓN
// ============================================================
async function initResponsibles(){
  const session=await requireSession(); if(!session)return;
  document.getElementById('logoutBtn').addEventListener('click',logout);

  const profile=await getProfile(session.user.id);
  const allowed=['ADMIN','SIG'].includes(profile.rol);
  const newBtn=document.getElementById('newResponsibleBtn');
  const formCard=document.getElementById('responsibleFormCard');
  const form=document.getElementById('responsibleForm');
  const list=document.getElementById('responsiblesList');
  const listMsg=document.getElementById('responsiblesMessage');
  const formMsg=document.getElementById('responsibleFormMessage');
  const searchEl=document.getElementById('respSearch');
  const statusEl=document.getElementById('respStatusFilter');
  const scopeFilterEl=document.getElementById('respScopeFilter');
  const scopeEl=document.getElementById('respScope');
  const projectField=document.getElementById('respProjectField');
  const projectEl=document.getElementById('respProject');
  const editIdEl=document.getElementById('responsibleEditId');
  let records=[];
  let projects=[];

  if(!allowed){
    newBtn.classList.add('hidden');
    formCard.classList.add('hidden');
    list.innerHTML='<div class="list-item">No tienes permisos para administrar responsables. Esta opción está reservada a ADMIN / SIG.</div>';
    return;
  }

  const {data:projectRows,error:projectError}=await sb.from('proyectos').select('id,nombre,cliente,activo').eq('activo',true).order('nombre');
  if(projectError){showMessage(listMsg,'No se pudieron cargar los proyectos: '+projectError.message);return;}
  projects=projectRows||[];
  projectEl.innerHTML='<option value="">Seleccione...</option>'+projects.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');

  function syncScope(){
    const projectSpecific=scopeEl.value==='PROJECT';
    projectField.classList.toggle('hidden',!projectSpecific);
    projectEl.required=projectSpecific;
    if(!projectSpecific) projectEl.value='';
  }
  scopeEl.addEventListener('change',syncScope);
  syncScope();

  function resetForm(){
    form.reset();
    editIdEl.value='';
    document.getElementById('responsibleFormEyebrow').textContent='Nuevo registro';
    document.getElementById('responsibleFormTitle').textContent='Agregar responsable';
    document.getElementById('saveResponsibleBtn').textContent='Guardar responsable';
    scopeEl.value='GLOBAL';
    syncScope();
    showMessage(formMsg,'');
  }

  function openForm(record=null){
    resetForm();
    formCard.classList.remove('hidden');
    if(record){
      editIdEl.value=record.id;
      document.getElementById('responsibleFormEyebrow').textContent='Edición';
      document.getElementById('responsibleFormTitle').textContent='Editar responsable';
      document.getElementById('saveResponsibleBtn').textContent='Guardar cambios';
      document.getElementById('respSite').value=record.sede||'';
      document.getElementById('respArea').value=record.area_nombre||'';
      document.getElementById('respNames').value=record.nombres||'';
      document.getElementById('respLastNames').value=record.apellidos||'';
      document.getElementById('respPosition').value=record.cargo||'';
      document.getElementById('respEmail').value=record.email||'';
      scopeEl.value=record.aplica_todos_proyectos?'GLOBAL':'PROJECT';
      syncScope();
      projectEl.value=record.proyecto_id||'';
    }
    formCard.scrollIntoView({behavior:'smooth',block:'start'});
  }

  newBtn.addEventListener('click',()=>openForm());
  document.getElementById('cancelResponsibleBtn').addEventListener('click',()=>{resetForm();formCard.classList.add('hidden');});

  async function loadRecords(){
    list.innerHTML='Cargando...'; showMessage(listMsg,'');
    const {data,error}=await sb.from('responsables_correccion').select('id,proyecto_id,sede,area_nombre,nombres,apellidos,cargo,email,aplica_todos_proyectos,activo,creado_en,actualizado_en,proyecto:proyectos(nombre,cliente)').order('apellidos').order('nombres');
    if(error){showMessage(listMsg,'No se pudieron cargar los responsables: '+error.message);list.innerHTML='';return;}
    records=data||[];
    updateKpis(); renderList();
  }

  function updateKpis(){
    document.getElementById('respKpiTotal').textContent=records.length;
    document.getElementById('respKpiActive').textContent=records.filter(r=>r.activo).length;
    document.getElementById('respKpiInactive').textContent=records.filter(r=>!r.activo).length;
    document.getElementById('respKpiGlobal').textContent=records.filter(r=>r.aplica_todos_proyectos).length;
  }

  function renderList(){
    const q=searchEl.value.trim().toLowerCase();
    const status=statusEl.value;
    const scope=scopeFilterEl.value;
    const filtered=records.filter(r=>{
      const text=`${r.nombres||''} ${r.apellidos||''} ${r.cargo||''} ${r.area_nombre||''} ${r.sede||''} ${r.email||''} ${r.proyecto?.nombre||''}`.toLowerCase();
      const statusOk=status==='ALL'||(status==='ACTIVE'&&r.activo)||(status==='INACTIVE'&&!r.activo);
      const scopeOk=scope==='ALL'||(scope==='GLOBAL'&&r.aplica_todos_proyectos)||(scope==='PROJECT'&&!r.aplica_todos_proyectos);
      return (!q||text.includes(q))&&statusOk&&scopeOk;
    });
    if(!filtered.length){list.innerHTML='<div class="list-item">No hay responsables con esos filtros.</div>';return;}
    list.innerHTML=filtered.map(r=>{
      const fullName=`${r.nombres||''} ${r.apellidos||''}`.trim();
      const scopeText=r.aplica_todos_proyectos?'TODOS LOS PROYECTOS':(r.proyecto?.nombre||'PROYECTO NO DEFINIDO');
      return `<article class="responsible-card ${r.activo?'':'responsible-inactive'}">
        <div class="responsible-main">
          <div class="responsible-title-row"><h3>${escapeHtml(fullName)}</h3><span class="badge ${r.activo?'CERRADO':'ABIERTO'}">${r.activo?'ACTIVO':'INACTIVO'}</span></div>
          <div class="responsible-meta">
            <span>${escapeHtml(r.cargo||'Sin cargo')}</span>
            <span>${escapeHtml(r.sede||'Sin sede')} · ${escapeHtml(r.area_nombre||'Sin área')}</span>
            <span>${escapeHtml(scopeText)}</span>
          </div>
          <a class="responsible-email" href="mailto:${escapeHtml(r.email||'')}">${escapeHtml(r.email||'')}</a>
        </div>
        <div class="responsible-actions">
          <button type="button" class="secondary resp-edit" data-id="${r.id}">Editar</button>
          <button type="button" class="${r.activo?'warning':'success'} resp-toggle" data-id="${r.id}" data-active="${r.activo}">${r.activo?'Desactivar':'Reactivar'}</button>
        </div>
      </article>`;
    }).join('');
    list.querySelectorAll('.resp-edit').forEach(btn=>btn.addEventListener('click',()=>openForm(records.find(r=>r.id===btn.dataset.id))));
    list.querySelectorAll('.resp-toggle').forEach(btn=>btn.addEventListener('click',()=>toggleActive(btn.dataset.id,btn.dataset.active==='true')));
  }

  searchEl.addEventListener('input',renderList);
  statusEl.addEventListener('change',renderList);
  scopeFilterEl.addEventListener('change',renderList);

  async function toggleActive(id,current){
    const record=records.find(r=>r.id===id); if(!record)return;
    const action=current?'desactivar':'reactivar';
    if(!confirm(`¿Deseas ${action} a ${record.nombres} ${record.apellidos}?`))return;
    const {error}=await sb.from('responsables_correccion').update({activo:!current}).eq('id',id);
    if(error){showMessage(listMsg,'No se pudo actualizar: '+error.message);return;}
    await loadRecords();
    showMessage(listMsg,`Responsable ${current?'desactivado':'reactivado'} correctamente.`,true);
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault(); showMessage(formMsg,'');
    const editId=editIdEl.value;
    const projectSpecific=scopeEl.value==='PROJECT';
    if(projectSpecific&&!projectEl.value){showMessage(formMsg,'Selecciona el proyecto específico.');return;}
    const payload={
      proyecto_id:projectSpecific?projectEl.value:null,
      area_id:null,
      sede:document.getElementById('respSite').value.trim().toUpperCase(),
      area_nombre:document.getElementById('respArea').value.trim().toUpperCase(),
      nombres:document.getElementById('respNames').value.trim().toUpperCase(),
      apellidos:document.getElementById('respLastNames').value.trim().toUpperCase(),
      cargo:document.getElementById('respPosition').value.trim().toUpperCase(),
      email:document.getElementById('respEmail').value.trim().toLowerCase(),
      aplica_todos_proyectos:!projectSpecific,
      activo:true
    };
    const saveBtn=document.getElementById('saveResponsibleBtn'); saveBtn.disabled=true; saveBtn.textContent='Guardando...';
    try{
      let result;
      if(editId){
        delete payload.activo;
        result=await sb.from('responsables_correccion').update(payload).eq('id',editId).select('id').single();
      } else {
        result=await sb.from('responsables_correccion').insert(payload).select('id').single();
      }
      if(result.error)throw result.error;
      showMessage(formMsg,editId?'Cambios guardados correctamente.':'Responsable agregado correctamente.',true);
      await loadRecords();
      setTimeout(()=>{resetForm();formCard.classList.add('hidden');},600);
    }catch(err){
      const detail=(err.message||'').includes('duplicate')?'Ya existe un responsable con ese correo para ese alcance.':(err.message||err);
      showMessage(formMsg,'No se pudo guardar: '+detail);
    }finally{saveBtn.disabled=false;saveBtn.textContent=editId?'Guardar cambios':'Guardar responsable';}
  });

  await loadRecords();
}

if(page==='responsibles')initResponsibles();

// ============================================================
// ETAPA 27 - FORMULARIO PUBLICO DE TRABAJADORES
// ============================================================
async function initPublicWorkerReport(){
  const form=document.getElementById('workerReportForm');
  const projectEl=document.getElementById('workerProject');
  const projectInfo=document.getElementById('workerProjectInfo');
  const monthEl=document.getElementById('workerMonth');
  const dateEl=document.getElementById('workerDate');
  const typeEl=document.getElementById('workerType');
  const responsibleEl=document.getElementById('workerResponsible');
  const photoEl=document.getElementById('workerPhoto');
  const preview=document.getElementById('workerPhotoPreview');
  const submitBtn=document.getElementById('workerSubmitBtn');
  const msg=document.getElementById('workerReportMessage');
  const resultBox=document.getElementById('workerResult');

  dateEl.value=today();

  function updateMonth(){
    const p=(dateEl.value||'').split('-');
    monthEl.value=p.length===3?(MONTHS_ES_V6[Number(p[1])-1]||''):'';
  }
  updateMonth();
  dateEl.addEventListener('change',updateMonth);

  const [projectsRes,typesRes]=await Promise.all([
    sb.rpc('public_listar_proyectos_reporte'),
    sb.rpc('public_listar_tipos_reporte')
  ]);

  if(projectsRes.error||typesRes.error){
    showMessage(msg,'No se pudo cargar el formulario. Verifica que la ETAPA 27 haya sido ejecutada.');
    submitBtn.disabled=true;
    return;
  }

  const projects=projectsRes.data||[];
  const types=typesRes.data||[];

  projectEl.innerHTML='<option value="">Seleccione...</option>'+projects.map(p=>
    `<option value="${p.id}" data-code="${escapeHtml(p.codigo||'')}">${escapeHtml(p.nombre)}${p.cliente?` · ${escapeHtml(p.cliente)}`:''}</option>`
  ).join('');

  typeEl.innerHTML='<option value="">Seleccione...</option>'+types.map(t=>
    `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`
  ).join('');

  const projectCode=(new URLSearchParams(location.search).get('p')||'').trim().toUpperCase();
  if(projectCode){
    const matched=projects.find(p=>(p.codigo||'').toUpperCase()===projectCode);
    if(matched){
      projectEl.value=matched.id;
      projectEl.disabled=true;
      projectInfo.textContent=`Proyecto preseleccionado por QR: ${matched.nombre}.`;
      await loadPublicResponsibles();
    }
  }

  projectEl.addEventListener('change',loadPublicResponsibles);

  async function loadPublicResponsibles(){
    responsibleEl.disabled=true;
    responsibleEl.innerHTML='<option value="">Cargando...</option>';
    if(!projectEl.value){
      responsibleEl.innerHTML='<option value="">Selecciona primero el proyecto...</option>';
      return;
    }
    const {data,error}=await sb.rpc('public_listar_responsables_reporte',{p_proyecto_id:projectEl.value});
    if(error){
      responsibleEl.innerHTML='<option value="">No se pudieron cargar los responsables</option>';
      showMessage(msg,'No se pudieron cargar los responsables.');
      return;
    }
    responsibleEl.innerHTML='<option value="">Seleccione...</option>'+(data||[]).map(r=>
      `<option value="${r.id}">${escapeHtml(r.nombre_completo)} · ${escapeHtml(r.area||'SIN ÁREA')} · ${escapeHtml(r.cargo||'')}</option>`
    ).join('');
    responsibleEl.disabled=false;
  }

  photoEl.addEventListener('change',()=>{
    const f=photoEl.files?.[0];
    if(!f){preview.src='';preview.classList.add('hidden');return;}
    preview.src=URL.createObjectURL(f);
    preview.classList.remove('hidden');
  });

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    showMessage(msg,'');
    resultBox.classList.add('hidden');

    const file=photoEl.files?.[0];
    if(!file){showMessage(msg,'Debes adjuntar una fotografía de la observación.');return;}
    if(!projectEl.value||!typeEl.value||!responsibleEl.value){showMessage(msg,'Completa todos los campos obligatorios.');return;}

    submitBtn.disabled=true;
    submitBtn.textContent='Enviando reporte...';

    try{
      const {data:created,error:createError}=await sb.rpc('registrar_reporte_trabajador_publico',{
        p_proyecto_id:projectEl.value,
        p_fecha:dateEl.value,
        p_reportado_por_nombre:document.getElementById('workerName').value.trim(),
        p_tipo_hallazgo_id:typeEl.value,
        p_lugar_hallazgo:document.getElementById('workerPlace').value.trim(),
        p_descripcion:document.getElementById('workerDescription').value.trim(),
        p_responsable_id:responsibleEl.value
      });
      if(createError)throw createError;

      const createdRow=Array.isArray(created)?created[0]:created;
      if(!createdRow?.reporte_id)throw new Error('No se recibió el identificador del reporte.');

      const blob=await optimizeImage(file);
      const path=`reportes-trabajadores/${createdRow.reporte_id}/hallazgo/${Date.now()}_${uid()}.webp`;

      const {error:uploadError}=await sb.storage
        .from('evidencias-ssomac')
        .upload(path,blob,{contentType:'image/webp',upsert:false});
      if(uploadError)throw new Error(`El reporte fue creado, pero no se pudo subir la foto: ${uploadError.message}`);

      const {error:attachError}=await sb.rpc('adjuntar_foto_reporte_trabajador_publico',{
        p_reporte_id:createdRow.reporte_id,
        p_token_publico:createdRow.token_publico,
        p_ruta_foto:path
      });
      if(attachError)throw new Error(`La foto subió, pero no se pudo asociar al reporte: ${attachError.message}`);

      const code=`REP-${String(createdRow.numero).padStart(6,'0')}`;
      resultBox.innerHTML=`
        <div class="public-success">
          <strong>Reporte enviado correctamente</strong>
          <span>Código de seguimiento</span>
          <b>${escapeHtml(code)}</b>
          <p>Tu reporte será revisado por Seguridad/SIG. Gracias por reportar.</p>
        </div>`;
      resultBox.classList.remove('hidden');
      showMessage(msg,'');
      form.reset();
      dateEl.value=today();
      updateMonth();
      preview.src='';preview.classList.add('hidden');
      if(projectCode){
        const matched=projects.find(p=>(p.codigo||'').toUpperCase()===projectCode);
        if(matched){projectEl.value=matched.id;projectEl.disabled=true;await loadPublicResponsibles();}
      } else {
        responsibleEl.disabled=true;
        responsibleEl.innerHTML='<option value="">Selecciona primero el proyecto...</option>';
      }
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(err){
      console.error(err);
      showMessage(msg,err.message||String(err));
    }finally{
      submitBtn.disabled=false;
      submitBtn.textContent='Enviar reporte';
    }
  });
}


// ============================================================
// ETAPA 27 - BANDEJA DE REPORTES DE TRABAJADORES
// ============================================================
async function initWorkerReportsAdmin(){
  const session=await requireSession();if(!session)return;
  document.getElementById('logoutBtn').addEventListener('click',logout);

  const list=document.getElementById('workerReportsList');
  const listMsg=document.getElementById('workerReportsMessage');
  const statusFilter=document.getElementById('workerReportStatus');
  const projectFilter=document.getElementById('workerReportProjectFilter');
  const searchEl=document.getElementById('workerReportSearch');
  const reviewCard=document.getElementById('workerReviewCard');
  const reviewForm=document.getElementById('workerReviewForm');
  const reviewMsg=document.getElementById('workerReviewMessage');

  let rows=[];
  let projects=[];
  let types=[];
  let responsibles=[];
  let potentials=[];
  let areas=[];
  let current=null;

  const [projectsRes,typesRes,responsiblesRes,potentialsRes,areasRes]=await Promise.all([
    sb.from('usuario_proyectos').select('proyecto_id,proyectos(id,nombre,cliente)').eq('usuario_id',session.user.id),
    sb.from('tipos_hallazgo').select('id,codigo,nombre,orden').eq('activo',true).in('codigo',['ACTO','CONDICION']).order('orden'),
    sb.from('responsables_correccion').select('id,proyecto_id,sede,area_nombre,nombres,apellidos,cargo,email,aplica_todos_proyectos,activo').eq('activo',true).order('apellidos'),
    sb.from('potenciales_perdida').select('id,codigo,nombre,orden').eq('activo',true).order('orden'),
    sb.from('areas').select('id,nombre').eq('activo',true).order('nombre')
  ]);
  const catalogError=[projectsRes.error,typesRes.error,responsiblesRes.error,potentialsRes.error,areasRes.error].find(Boolean);
  if(catalogError){showMessage(listMsg,'No se pudieron cargar los catálogos: '+catalogError.message);return;}

  projects=(projectsRes.data||[]).map(r=>r.proyectos).filter(Boolean);
  types=typesRes.data||[];
  responsibles=responsiblesRes.data||[];
  potentials=potentialsRes.data||[];
  areas=areasRes.data||[];

  const reviewImmediateFields=document.getElementById('reviewImmediateLiftFields');
  const reviewImmediateComment=document.getElementById('reviewImmediateLiftComment');
  const reviewImmediatePhoto=document.getElementById('reviewImmediateLiftPhoto');
  const reviewImmediatePreview=document.getElementById('reviewImmediateLiftPreview');
  const reviewImmediateSigner=document.getElementById('reviewImmediateLiftSigner');
  const reviewImmediateSignaturePad=createSignaturePad(document.getElementById('reviewImmediateLiftSignature'),document.getElementById('reviewImmediateLiftClearSignature'));
  function isReviewImmediateLift(){return document.querySelector('input[name="reviewImmediateLift"]:checked')?.value==='SI';}
  function syncReviewImmediateLiftUI(){
    const immediate=isReviewImmediateLift();
    reviewImmediateFields?.classList.toggle('hidden',!immediate);
    if(reviewImmediateComment)reviewImmediateComment.required=immediate;
    if(reviewImmediatePhoto)reviewImmediatePhoto.required=immediate;
    if(!immediate){
      if(reviewImmediateComment)reviewImmediateComment.value='';
      if(reviewImmediatePhoto)reviewImmediatePhoto.value='';
      if(reviewImmediatePreview){reviewImmediatePreview.src='';reviewImmediatePreview.classList.add('hidden');}
      if(reviewImmediateSigner)reviewImmediateSigner.value='';
      reviewImmediateSignaturePad?.clear();
    }
  }
  document.querySelectorAll('input[name="reviewImmediateLift"]').forEach(x=>x.addEventListener('change',syncReviewImmediateLiftUI));
  reviewImmediatePhoto?.addEventListener('change',()=>{
    const f=reviewImmediatePhoto.files?.[0];
    if(!f){reviewImmediatePreview.src='';reviewImmediatePreview.classList.add('hidden');return;}
    reviewImmediatePreview.src=URL.createObjectURL(f);reviewImmediatePreview.classList.remove('hidden');
  });
  syncReviewImmediateLiftUI();

  projectFilter.innerHTML='<option value="ALL">Todos</option>'+projects.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  document.getElementById('reviewProject').innerHTML='<option value="">Seleccione...</option>'+projects.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  document.getElementById('reviewType').innerHTML='<option value="">Seleccione...</option>'+types.map(t=>`<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  document.getElementById('reviewPotential').innerHTML='<option value="">Seleccione...</option>'+potentials.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  document.getElementById('reviewArea').innerHTML='<option value="">Seleccione...</option>'+areas.map(a=>`<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');

  statusFilter.addEventListener('change',renderList);
  projectFilter.addEventListener('change',renderList);
  searchEl.addEventListener('input',renderList);
  document.getElementById('workerCloseReviewBtn').addEventListener('click',()=>{reviewCard.classList.add('hidden');current=null;showMessage(reviewMsg,'');});
  document.getElementById('reviewProject').addEventListener('change',()=>renderReviewResponsibles());
  document.getElementById('reviewResponsible').addEventListener('change',()=>{
    if(!isReviewImmediateLift()||!reviewImmediateSigner)return;
    const r=responsibles.find(x=>x.id===document.getElementById('reviewResponsible').value);
    if(r&&!reviewImmediateSigner.value.trim())reviewImmediateSigner.value=`${r.nombres||''} ${r.apellidos||''}`.trim();
  });
  document.getElementById('reviewType').addEventListener('change',async()=>{await loadReviewCauses(document.getElementById('reviewType').value);});

  async function loadRows(){
    const {data,error}=await sb.from('reportes_trabajadores').select(`
      id,numero,proyecto_id,fecha,reportado_por_nombre,lugar_hallazgo,tipo_hallazgo_id,
      descripcion,responsable_propuesto_id,ruta_foto,estado_revision,observacion_revision,
      creado_en,fecha_revision,ocurrencia_id,
      proyecto:proyectos(id,nombre,cliente),
      tipo:tipos_hallazgo(id,codigo,nombre),
      responsable:responsables_correccion(id,nombres,apellidos,cargo,area_nombre,email)
    `).order('creado_en',{ascending:false});
    if(error){showMessage(listMsg,'No se pudieron cargar los reportes: '+error.message);return;}
    rows=data||[];
    updateKpis();
    renderList();
  }

  function updateKpis(){
    const c={NUEVO:0,EN_REVISION:0,VALIDADO:0,DESCARTADO:0};
    rows.forEach(r=>{if(r.estado_revision in c)c[r.estado_revision]++;});
    document.getElementById('workerKpiNew').textContent=c.NUEVO;
    document.getElementById('workerKpiReview').textContent=c.EN_REVISION;
    document.getElementById('workerKpiValidated').textContent=c.VALIDADO;
    document.getElementById('workerKpiDiscarded').textContent=c.DESCARTADO;
  }

  function workerCode(r){return `REP-${String(r.numero).padStart(6,'0')}`;}
  function renderList(){
    const q=searchEl.value.trim().toLowerCase();
    const sf=statusFilter.value,pf=projectFilter.value;
    const filtered=rows.filter(r=>
      (sf==='ALL'||r.estado_revision===sf) &&
      (pf==='ALL'||r.proyecto_id===pf) &&
      (!q||workerCode(r).toLowerCase().includes(q)||(r.reportado_por_nombre||'').toLowerCase().includes(q)||(r.lugar_hallazgo||'').toLowerCase().includes(q)||(r.descripcion||'').toLowerCase().includes(q))
    );
    if(!filtered.length){list.innerHTML='<div class="list-item">No hay reportes con esos filtros.</div>';return;}
    list.innerHTML=filtered.map(r=>`
      <article class="worker-report-card">
        <div>
          <div class="worker-report-card-top">
            <strong>${escapeHtml(workerCode(r))}</strong>
            <span class="review-badge ${escapeHtml(r.estado_revision)}">${escapeHtml(r.estado_revision.replace('_',' '))}</span>
          </div>
          <h3>${escapeHtml(r.proyecto?.nombre||'Proyecto')} · ${escapeHtml(r.tipo?.nombre||'')}</h3>
          <div class="occurrence-meta"><span>${escapeHtml(formatDateEsV6(r.fecha))}</span><span>${escapeHtml(r.reportado_por_nombre)}</span><span>${escapeHtml(r.lugar_hallazgo)}</span></div>
          <p>${escapeHtml(r.descripcion)}</p>
          ${r.ocurrencia_id?'<small>Convertido en ocurrencia formal.</small>':''}
        </div>
        <div class="worker-report-card-action">
          <button type="button" class="secondary" data-review-id="${r.id}">${r.estado_revision==='VALIDADO'?'Ver':'Revisar'}</button>
        </div>
      </article>`).join('');
    list.querySelectorAll('[data-review-id]').forEach(btn=>btn.addEventListener('click',()=>openReview(btn.dataset.reviewId)));
  }

  async function openReview(id){
    current=rows.find(r=>r.id===id);if(!current)return;
    showMessage(reviewMsg,'');
    reviewCard.classList.remove('hidden');
    document.getElementById('workerReviewTitle').textContent=`${workerCode(current)} · ${current.proyecto?.nombre||''}`;
    document.getElementById('workerReviewId').value=current.id;
    document.getElementById('reviewProject').value=current.proyecto_id||'';
    document.getElementById('reviewDate').value=current.fecha||today();
    document.getElementById('reviewReporter').value=current.reportado_por_nombre||'';
    document.getElementById('reviewPlace').value=current.lugar_hallazgo||'';
    document.getElementById('reviewType').value=current.tipo_hallazgo_id||'';
    document.getElementById('reviewDescription').value=current.descripcion||'';
    document.getElementById('reviewObservation').value=current.observacion_revision||'';
    document.getElementById('reviewAction').value='';
    document.getElementById('reviewPotential').value='';
    document.getElementById('reviewArea').value='';
    document.getElementById('reviewDueDate').value='';
    const immediateNo=document.querySelector('input[name="reviewImmediateLift"][value="NO"]');if(immediateNo)immediateNo.checked=true;
    if(reviewImmediateComment)reviewImmediateComment.value='';
    if(reviewImmediatePhoto)reviewImmediatePhoto.value='';
    if(reviewImmediatePreview){reviewImmediatePreview.src='';reviewImmediatePreview.classList.add('hidden');}
    if(reviewImmediateSigner)reviewImmediateSigner.value='';
    reviewImmediateSignaturePad?.clear();
    syncReviewImmediateLiftUI();

    renderReviewResponsibles(current.responsable_propuesto_id);
    await loadReviewCauses(current.tipo_hallazgo_id);
    await renderOriginalPhoto(current);

    const processed=['VALIDADO','DESCARTADO'].includes(current.estado_revision);
    [...reviewForm.elements].forEach(el=>{
      if(el.id==='workerCloseReviewBtn')return;
      if(el.type!=='hidden')el.disabled=processed;
    });
    document.getElementById('workerValidateBtn').style.display=processed?'none':'';
    document.getElementById('workerDiscardBtn').style.display=processed?'none':'';

    if(current.estado_revision==='NUEVO'){
      const {error}=await sb.from('reportes_trabajadores').update({estado_revision:'EN_REVISION',revisado_por_id:session.user.id,fecha_revision:new Date().toISOString()}).eq('id',current.id);
      if(!error){current.estado_revision='EN_REVISION';await loadRows();}
    }
    reviewCard.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderReviewResponsibles(selectedId=''){
    const projectId=document.getElementById('reviewProject').value;
    const available=responsibles.filter(r=>r.aplica_todos_proyectos===true||(projectId&&r.proyecto_id===projectId));
    const el=document.getElementById('reviewResponsible');
    el.innerHTML='<option value="">Seleccione...</option>'+available.map(r=>`<option value="${r.id}">${escapeHtml(`${r.nombres||''} ${r.apellidos||''}`.trim())} · ${escapeHtml(r.area_nombre||'SIN ÁREA')} · ${escapeHtml(r.cargo||'')}</option>`).join('');
    if(selectedId&&available.some(r=>r.id===selectedId))el.value=selectedId;
  }

  async function loadReviewCauses(typeId){
    const ib=document.getElementById('reviewImmediateCauses'),bb=document.getElementById('reviewBasicCauses');
    if(!typeId){ib.innerHTML=bb.innerHTML='<span class="muted">Selecciona Acto o Condición.</span>';return;}
    ib.innerHTML=bb.innerHTML='Cargando...';
    const [ir,br]=await Promise.all([
      sb.from('causas_inmediatas').select('id,nombre,orden').eq('activo',true).eq('tipo_hallazgo_id',typeId).order('orden'),
      sb.from('causas_basicas').select('id,nombre,grupo_codigo,grupo_nombre,subgrupo_codigo,subgrupo_nombre,orden').eq('activo',true).eq('tipo_hallazgo_id',typeId).order('orden')
    ]);
    if(ir.error||br.error){ib.innerHTML=bb.innerHTML='No se pudieron cargar las causas.';return;}
    ib.innerHTML=(ir.data||[]).map(c=>`<label class="check-item"><input type="checkbox" name="reviewImmediateCause" value="${c.id}"><span>${escapeHtml(c.nombre)}</span></label>`).join('');
    const groups=new Map();(br.data||[]).forEach(c=>{const k=`${c.grupo_codigo}|${c.grupo_nombre}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c);});
    let html='';for(const [k,items] of groups){const [gc,gn]=k.split('|');html+=`<div class="group-title">${escapeHtml(gc)}. ${escapeHtml(gn)}</div>`;let sub='';for(const c of items){const sk=c.subgrupo_codigo?`${c.subgrupo_codigo}|${c.subgrupo_nombre}`:'';if(sk&&sk!==sub){sub=sk;html+=`<div class="subgroup-title">${escapeHtml(c.subgrupo_codigo)} ${escapeHtml(c.subgrupo_nombre||'')}</div>`;}html+=`<label class="check-item"><input type="checkbox" name="reviewBasicCause" value="${c.id}"><span>${escapeHtml(c.nombre)}</span></label>`;}}
    bb.innerHTML=html||'Sin causas configuradas.';
  }

  async function renderOriginalPhoto(r){
    const box=document.getElementById('workerOriginalPhoto');
    if(!r.ruta_foto){box.innerHTML='<span>Sin fotografía adjunta</span>';return;}
    const {data,error}=await sb.storage.from('evidencias-ssomac').createSignedUrl(r.ruta_foto,3600);
    if(error||!data?.signedUrl){box.innerHTML='<span>No se pudo cargar la fotografía</span>';return;}
    box.innerHTML=`<img src="${data.signedUrl}" alt="Foto enviada por el trabajador"><small>Fotografía original del reporte</small>`;
  }

  document.getElementById('workerDiscardBtn').addEventListener('click',async()=>{
    if(!current)return;
    const note=document.getElementById('reviewObservation').value.trim();
    if(!note){showMessage(reviewMsg,'Indica el motivo por el cual se descarta el reporte.');return;}
    const {error}=await sb.from('reportes_trabajadores').update({estado_revision:'DESCARTADO',observacion_revision:note,revisado_por_id:session.user.id,fecha_revision:new Date().toISOString(),actualizado_en:new Date().toISOString()}).eq('id',current.id);
    if(error){showMessage(reviewMsg,'No se pudo descartar: '+error.message);return;}
    showMessage(reviewMsg,'Reporte descartado.',true);await loadRows();setTimeout(()=>reviewCard.classList.add('hidden'),600);
  });

  reviewForm.addEventListener('submit',async e=>{
    e.preventDefault();if(!current)return;showMessage(reviewMsg,'');
    const immediateIds=[...document.querySelectorAll('input[name="reviewImmediateCause"]:checked')].map(x=>x.value);
    const basicIds=[...document.querySelectorAll('input[name="reviewBasicCause"]:checked')].map(x=>x.value);
    const immediateLift=isReviewImmediateLift();
    if(!immediateIds.length||!basicIds.length){showMessage(reviewMsg,'Selecciona al menos una causa inmediata y una causa básica.');return;}
    if(immediateLift&&(!reviewImmediateComment.value.trim()||!reviewImmediatePhoto.files?.[0]||!reviewImmediateSigner?.value.trim()||reviewImmediateSignaturePad?.isEmpty())){showMessage(reviewMsg,'Para un levantamiento inmediato debes registrar la acción, la fotografía, el nombre de quien levanta y su firma digital.');return;}
    const validateBtn=document.getElementById('workerValidateBtn');validateBtn.disabled=true;validateBtn.textContent='Validando...';
    try{
      const {data,error}=await sb.rpc('validar_reporte_trabajador_v2',{
        p_reporte_id:current.id,
        p_proyecto_id:document.getElementById('reviewProject').value,
        p_fecha:document.getElementById('reviewDate').value,
        p_reportado_por_nombre:document.getElementById('reviewReporter').value.trim(),
        p_tipo_hallazgo_id:document.getElementById('reviewType').value,
        p_lugar_hallazgo:document.getElementById('reviewPlace').value.trim(),
        p_descripcion:document.getElementById('reviewDescription').value.trim(),
        p_responsable_id:document.getElementById('reviewResponsible').value,
        p_acciones:document.getElementById('reviewAction').value.trim(),
        p_potencial_id:document.getElementById('reviewPotential').value,
        p_area_id:document.getElementById('reviewArea').value,
        p_fecha_levantamiento:document.getElementById('reviewDueDate').value,
        p_causas_inmediatas:immediateIds,
        p_causas_basicas:basicIds,
        p_levantamiento_inmediato:immediateLift
      });
      if(error)throw error;
      const out=Array.isArray(data)?data[0]:data;
      let emailStatus='';
      const responsible=responsibles.find(r=>r.id===document.getElementById('reviewResponsible').value);
      const project=projects.find(p=>p.id===document.getElementById('reviewProject').value);
      const type=types.find(t=>t.id===document.getElementById('reviewType').value);
      if(immediateLift){
        try{
          const liftBlob=await optimizeImage(reviewImmediatePhoto.files[0]);
          const liftPath=`ocurrencias/${out.ocurrencia_id}/levantamiento/${Date.now()}_${uid()}.webp`;
          const {error:liftUploadError}=await sb.storage.from('evidencias-ssomac').upload(liftPath,liftBlob,{contentType:'image/webp',upsert:false});
          if(liftUploadError)throw liftUploadError;
          const {error:liftEvidenceError}=await sb.from('evidencias').insert({
            ocurrencia_id:out.ocurrencia_id,
            tipo_evidencia:'LEVANTAMIENTO',
            ruta_archivo:liftPath,
            comentario:reviewImmediateComment.value.trim(),
            creado_por_id:session.user.id
          });
          if(liftEvidenceError)throw liftEvidenceError;
          const signatureBlob=await reviewImmediateSignaturePad.toBlob();
          const signaturePath=`ocurrencias/${out.ocurrencia_id}/levantamiento/firma_${Date.now()}_${uid()}.webp`;
          const {error:signatureUploadError}=await sb.storage.from('evidencias-ssomac').upload(signaturePath,signatureBlob,{contentType:'image/webp',upsert:false});
          if(signatureUploadError)throw signatureUploadError;
          const {error:signatureEvidenceError}=await sb.from('evidencias').insert({
            ocurrencia_id:out.ocurrencia_id,
            tipo_evidencia:'FIRMA_LEVANTAMIENTO',
            ruta_archivo:signaturePath,
            comentario:reviewImmediateSigner.value.trim(),
            creado_por_id:session.user.id
          });
          if(signatureEvidenceError)throw signatureEvidenceError;
          const statuses=await getStatuses();
          const {error:liftOccError}=await sb.from('ocurrencias').update({
            estado_id:statuses.PENDIENTE_VALIDACION.id,
            fecha_ejecutada:today(),
            levantado_por_id:session.user.id,
            modalidad_levantamiento:'INMEDIATO'
          }).eq('id',out.ocurrencia_id);
          if(liftOccError)throw liftOccError;
          emailStatus=' Levantamiento inmediato registrado; no se generó correo.';
        }catch(liftErr){
          console.error(liftErr);
          emailStatus=' La ocurrencia se creó, pero el levantamiento inmediato NO pudo completarse: '+(liftErr.message||liftErr);
        }
      }else if(responsible&&out?.token_levantamiento){
        try{
          await sendAssignmentEmail({
            codigo_reporte:workerCode(current),
            correo_responsable:responsible.email,
            nombre_responsable:`${responsible.nombres||''} ${responsible.apellidos||''}`.trim(),
            proyecto:project?.nombre||'',
            fecha:formatDateEsV6(document.getElementById('reviewDate').value),
            reportado_por:document.getElementById('reviewReporter').value.trim(),
            lugar:document.getElementById('reviewPlace').value.trim(),
            tipo_hallazgo:type?.nombre||'',
            descripcion:document.getElementById('reviewDescription').value.trim(),
            accion:document.getElementById('reviewAction').value.trim(),
            fecha_limite:formatDateEsV6(document.getElementById('reviewDueDate').value),
            link_levantamiento:buildLiftLink(out.token_levantamiento)
          });
          await markAssignmentEmailSent(out.asignacion_id);
          emailStatus=' Correo de levantamiento enviado al responsable.';
        }catch(emailErr){
          console.error(emailErr);
          emailStatus=' La ocurrencia se creó, pero el correo NO pudo enviarse: '+(emailErr.message||emailErr);
        }
      }
      showMessage(reviewMsg,`Reporte validado. Se generó la ocurrencia N.° ${out?.numero_ocurrencia||''}.${immediateLift?'':' Se generó la asignación de levantamiento.'}${emailStatus}`,!emailStatus.includes('NO pudo'));
      await loadRows();
      setTimeout(()=>{if(out?.ocurrencia_id)location.href=`detalle-ocurrencia.html?id=${out.ocurrencia_id}`;},emailStatus.includes('NO pudo')?3500:1800);
    }catch(err){console.error(err);showMessage(reviewMsg,'No se pudo validar: '+(err.message||err));}
    finally{validateBtn.disabled=false;validateBtn.textContent='Validar y generar ocurrencia';}
  });

  await loadRows();
}

if(page==='public-worker-report')initPublicWorkerReport();
if(page==='worker-reports-admin')initWorkerReportsAdmin();


// ============================================================
// ETAPA 28 - ADMINISTRACIÓN DE PROYECTOS / SEDES
// ============================================================
async function initProjectsAdmin(){
  const session=await requireSession(); if(!session)return;
  document.getElementById('logoutBtn').addEventListener('click',logout);

  const profile=await getProfile(session.user.id);
  const allowed=['ADMIN','SIG'].includes(profile.rol);
  const newBtn=document.getElementById('newProjectBtn');
  const formCard=document.getElementById('projectFormCard');
  const form=document.getElementById('projectForm');
  const list=document.getElementById('projectsAdminList');
  const listMsg=document.getElementById('projectsAdminMessage');
  const formMsg=document.getElementById('projectFormMessage');
  const searchEl=document.getElementById('projectSearch');
  const statusEl=document.getElementById('projectStatusFilter');
  const typeEl=document.getElementById('projectTypeFilter');
  const editId=document.getElementById('projectEditId');
  const qrModal=document.getElementById('projectQrModal');
  const qrBox=document.getElementById('projectQrCanvas');
  const qrMsg=document.getElementById('projectQrMessage');
  const qrLinkInput=document.getElementById('projectQrLink');
  const qrOpenLink=document.getElementById('openProjectQrLink');
  let records=[];
  let publicReportCounts={};
  let activeQrRecord=null;
  let activeQrUrl='';

  if(!allowed){
    newBtn.classList.add('hidden');
    list.innerHTML='<div class="list-item">No tienes permisos para administrar proyectos o sedes.</div>';
    return;
  }

  function resetForm(){
    form.reset(); editId.value='';
    document.getElementById('projectFormEyebrow').textContent='Nuevo registro';
    document.getElementById('projectFormTitle').textContent='Agregar proyecto / sede';
    document.getElementById('saveProjectBtn').textContent='Guardar';
    document.getElementById('projectUnitType').value='PROYECTO';
    showMessage(formMsg,'');
  }

  function openForm(r=null){
    resetForm(); formCard.classList.remove('hidden');
    if(r){
      editId.value=r.id;
      document.getElementById('projectFormEyebrow').textContent='Edición';
      document.getElementById('projectFormTitle').textContent='Editar proyecto / sede';
      document.getElementById('saveProjectBtn').textContent='Guardar cambios';
      document.getElementById('projectUnitType').value=r.tipo_unidad||'PROYECTO';
      document.getElementById('projectCode').value=r.codigo||'';
      document.getElementById('projectName').value=r.nombre||'';
      document.getElementById('projectClient').value=r.cliente||'';
    }
    formCard.scrollIntoView({behavior:'smooth',block:'start'});
  }

  newBtn.addEventListener('click',()=>openForm());
  document.getElementById('cancelProjectBtn').addEventListener('click',()=>{resetForm();formCard.classList.add('hidden');});

  async function loadRecords(){
    list.innerHTML='Cargando...'; showMessage(listMsg,'');
    const {data,error}=await sb.rpc('admin_listar_unidades');
    if(error){showMessage(listMsg,'No se pudieron cargar los proyectos: '+error.message);list.innerHTML='';return;}
    records=data||[];

    // Conteo informativo de reportes públicos por proyecto. Si la política RLS no lo permite,
    // la administración de proyectos sigue funcionando normalmente.
    publicReportCounts={};
    try{
      const {data:workerRows,error:workerCountError}=await sb.from('reportes_trabajadores').select('proyecto_id');
      if(!workerCountError){
        (workerRows||[]).forEach(row=>{
          if(row.proyecto_id)publicReportCounts[row.proyecto_id]=(publicReportCounts[row.proyecto_id]||0)+1;
        });
      }
    }catch(_e){}

    document.getElementById('projectKpiActive').textContent=records.filter(r=>r.activo).length;
    document.getElementById('projectKpiInactive').textContent=records.filter(r=>!r.activo).length;
    document.getElementById('projectKpiProjects').textContent=records.filter(r=>(r.tipo_unidad||'PROYECTO')==='PROYECTO').length;
    document.getElementById('projectKpiSites').textContent=records.filter(r=>r.tipo_unidad==='SEDE').length;
    renderList();
  }

  function buildPublicReportUrl(record){
    const code=String(record?.codigo||'').trim();
    return `${getPublicAppBaseUrl()}/reportar.html?p=${encodeURIComponent(code)}`;
  }

  function renderList(){
    const q=searchEl.value.trim().toLowerCase(), st=statusEl.value, ty=typeEl.value;
    const filtered=records.filter(r=>{
      const text=`${r.codigo||''} ${r.nombre||''} ${r.cliente||''}`.toLowerCase();
      const statusOk=st==='ALL'||(st==='ACTIVE'&&r.activo)||(st==='INACTIVE'&&!r.activo);
      const typeOk=ty==='ALL'||(r.tipo_unidad||'PROYECTO')===ty;
      return (!q||text.includes(q))&&statusOk&&typeOk;
    });
    if(!filtered.length){list.innerHTML='<div class="list-item">No hay proyectos o sedes con esos filtros.</div>';return;}
    list.innerHTML=filtered.map(r=>{
      const publicUrl=buildPublicReportUrl(r);
      const count=publicReportCounts[r.id]||0;
      return `<article class="responsible-card project-qr-card">
        <div class="project-qr-main">
          <div class="responsible-title"><h3>${escapeHtml(r.nombre||'')}</h3><span class="badge ${r.activo?'CERRADO':'ABIERTO'}">${r.activo?'ACTIVO':'INACTIVO'}</span></div>
          <div class="responsible-meta">
            <span>${escapeHtml(r.tipo_unidad||'PROYECTO')}</span>
            <span>Código: ${escapeHtml(r.codigo||'')}</span>
            <span>${escapeHtml(r.cliente||'Sin cliente / entidad')}</span>
            <span>Reportes públicos: <strong>${count}</strong></span>
          </div>
          <small class="project-public-link">${escapeHtml(publicUrl)}</small>
        </div>
        <div class="responsible-actions project-qr-actions">
          ${r.activo?`<button type="button" class="project-qr-open" data-id="${r.id}">Ver QR</button>
          <button type="button" class="secondary project-copy-link" data-id="${r.id}">Copiar enlace</button>
          <a class="button-link secondary-link" href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener">Abrir formulario</a>`:'<span class="project-qr-disabled">QR deshabilitado mientras la unidad esté inactiva.</span>'}
          <button type="button" class="secondary project-edit" data-id="${r.id}">Editar</button>
          <button type="button" class="${r.activo?'warning':'success'} project-toggle" data-id="${r.id}" data-active="${r.activo}">${r.activo?'Desactivar':'Reactivar'}</button>
        </div>
      </article>`;
    }).join('');

    list.querySelectorAll('.project-edit').forEach(b=>b.addEventListener('click',()=>openForm(records.find(r=>r.id===b.dataset.id))));
    list.querySelectorAll('.project-toggle').forEach(b=>b.addEventListener('click',()=>toggleState(b.dataset.id,b.dataset.active==='true')));
    list.querySelectorAll('.project-qr-open').forEach(b=>b.addEventListener('click',()=>openQrModal(records.find(r=>r.id===b.dataset.id))));
    list.querySelectorAll('.project-copy-link').forEach(b=>b.addEventListener('click',async()=>{
      const r=records.find(x=>x.id===b.dataset.id); if(!r)return;
      const ok=await copyText(buildPublicReportUrl(r));
      const original=b.textContent;
      b.textContent=ok?'Copiado ✓':'No se pudo copiar';
      setTimeout(()=>b.textContent=original,1600);
    }));
  }

  searchEl.addEventListener('input',renderList);
  statusEl.addEventListener('change',renderList);
  typeEl.addEventListener('change',renderList);

  async function toggleState(id,current){
    const r=records.find(x=>x.id===id);if(!r)return;
    const verb=current?'desactivar':'reactivar';
    if(!confirm(`¿Deseas ${verb} ${r.nombre}?`))return;
    const {error}=await sb.rpc('admin_cambiar_estado_unidad',{p_id:id,p_activo:!current});
    if(error){showMessage(listMsg,'No se pudo actualizar: '+error.message);return;}
    await loadRecords();showMessage(listMsg,`Unidad ${current?'desactivada':'reactivada'} correctamente.`,true);
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();showMessage(formMsg,'');
    const btn=document.getElementById('saveProjectBtn');btn.disabled=true;btn.textContent='Guardando...';
    try{
      const id=editId.value||null;
      const {error}=await sb.rpc('admin_guardar_unidad',{
        p_id:id,
        p_codigo:document.getElementById('projectCode').value.trim(),
        p_nombre:document.getElementById('projectName').value.trim(),
        p_cliente:document.getElementById('projectClient').value.trim(),
        p_tipo_unidad:document.getElementById('projectUnitType').value
      });
      if(error)throw error;
      showMessage(formMsg,id?'Cambios guardados correctamente.':'Proyecto / sede creado correctamente.',true);
      await loadRecords();
      setTimeout(()=>{resetForm();formCard.classList.add('hidden');},600);
    }catch(err){showMessage(formMsg,'No se pudo guardar: '+(err.message||err));}
    finally{btn.disabled=false;btn.textContent=editId.value?'Guardar cambios':'Guardar';}
  });

  function closeQrModal(){
    qrModal?.classList.add('hidden');
    document.body.classList.remove('qr-modal-open');
    activeQrRecord=null; activeQrUrl='';
    if(qrBox)qrBox.innerHTML='';
    showMessage(qrMsg,'');
  }

  async function openQrModal(record){
    if(!record||!record.activo)return;
    activeQrRecord=record;
    activeQrUrl=buildPublicReportUrl(record);
    document.getElementById('projectQrTitle').textContent=`${record.tipo_unidad==='SEDE'?'Sede':'Proyecto'} · ${record.nombre}`;
    document.getElementById('projectQrClient').textContent=record.cliente||'Explo Drilling Perú';
    document.getElementById('projectQrName').textContent=record.nombre||'';
    document.getElementById('projectQrCode').textContent=`Código: ${record.codigo||''}`;
    qrLinkInput.value=activeQrUrl;
    qrOpenLink.href=activeQrUrl;
    qrBox.innerHTML='';
    showMessage(qrMsg,'');

    if(typeof QRCode==='undefined'){
      showMessage(qrMsg,'No se pudo cargar el generador QR. Verifica tu conexión a internet.');
      return;
    }
    new QRCode(qrBox,{
      text:activeQrUrl,
      width:230,
      height:230,
      colorDark:'#101828',
      colorLight:'#ffffff',
      correctLevel:QRCode.CorrectLevel.H
    });
    qrModal.classList.remove('hidden');
    document.body.classList.add('qr-modal-open');
  }

  async function copyText(text){
    try{
      if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}
      const tmp=document.createElement('textarea');tmp.value=text;tmp.style.position='fixed';tmp.style.opacity='0';document.body.appendChild(tmp);tmp.select();const ok=document.execCommand('copy');tmp.remove();return ok;
    }catch(_e){return false;}
  }

  function getQrCanvas(){
    return qrBox?.querySelector('canvas')||null;
  }

  function safeFilePart(value){
    return String(value||'qr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase();
  }

  function downloadDataUrl(dataUrl,fileName){
    const a=document.createElement('a');a.href=dataUrl;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
  }

  async function loadImageUrlForCanvas(src){
    return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
  }

  async function downloadPoster(){
    if(!activeQrRecord)return;
    const qrCanvas=getQrCanvas();
    if(!qrCanvas){showMessage(qrMsg,'El QR todavía no está disponible.');return;}
    showMessage(qrMsg,'Generando cartel...',true);
    try{
      const W=1080,H=1350;
      const c=document.createElement('canvas');c.width=W;c.height=H;
      const ctx=c.getContext('2d');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);

      // Franja superior corporativa
      ctx.fillStyle='#c00000';ctx.fillRect(0,0,W,26);
      ctx.fillStyle='#f8fafc';ctx.fillRect(0,26,W,250);

      const [corp,yo]=await Promise.all([
        loadImageUrlForCanvas('assets/img/logo-corporativo.jpg').catch(()=>null),
        loadImageUrlForCanvas('assets/img/logo-yo-reporto.png').catch(()=>null)
      ]);

      if(corp){
        const maxW=360,maxH=150,scale=Math.min(maxW/corp.width,maxH/corp.height,1);
        ctx.drawImage(corp,58,68,corp.width*scale,corp.height*scale);
      }
      if(yo){
        const maxW=205,maxH=205,scale=Math.min(maxW/yo.width,maxH/yo.height,1);
        ctx.drawImage(yo,W-58-yo.width*scale,48,yo.width*scale,yo.height*scale);
      }

      ctx.fillStyle='#101828';ctx.font='700 46px Arial, sans-serif';ctx.textAlign='center';
      ctx.fillText('YO REPORTO',W/2,330);
      ctx.fillStyle='#c00000';ctx.font='700 30px Arial, sans-serif';
      ctx.fillText('ACTOS Y CONDICIONES DE SEGURIDAD',W/2,380);

      ctx.fillStyle='#101828';ctx.font='700 42px Arial, sans-serif';
      const projectName=String(activeQrRecord.nombre||'').toUpperCase();
      wrapCanvasText(ctx,projectName,W/2,455,900,50);

      // Caja QR
      const qrSize=500,qrX=(W-qrSize)/2,qrY=550;
      ctx.fillStyle='#ffffff';ctx.strokeStyle='#d0d5dd';ctx.lineWidth=4;
      roundRectCanvas(ctx,qrX-28,qrY-28,qrSize+56,qrSize+56,30,true,true);
      ctx.drawImage(qrCanvas,qrX,qrY,qrSize,qrSize);

      ctx.fillStyle='#101828';ctx.font='700 34px Arial, sans-serif';
      ctx.fillText('ESCANEA PARA REPORTAR',W/2,1130);
      ctx.fillStyle='#475467';ctx.font='400 26px Arial, sans-serif';
      ctx.fillText('No necesitas usuario ni contraseña.',W/2,1175);
      ctx.fillText('El proyecto quedará seleccionado automáticamente.',W/2,1215);

      ctx.fillStyle='#c00000';ctx.fillRect(0,H-90,W,90);
      ctx.fillStyle='#ffffff';ctx.font='700 27px Arial, sans-serif';
      ctx.fillText('SEGURIDAD ES RESPONSABILIDAD DE TODOS',W/2,H-35);

      downloadDataUrl(c.toDataURL('image/png'),`cartel-yo-reporto-${safeFilePart(activeQrRecord.codigo||activeQrRecord.nombre)}.png`);
      showMessage(qrMsg,'Cartel generado correctamente.',true);
    }catch(err){
      console.error(err);showMessage(qrMsg,'No se pudo generar el cartel: '+(err.message||err));
    }
  }

  function roundRectCanvas(ctx,x,y,w,h,r,fill,stroke){
    r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();if(fill)ctx.fill();if(stroke)ctx.stroke();
  }

  function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight){
    const words=String(text||'').split(/\s+/);let line='',lines=[];
    for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}
    if(line)lines.push(line);
    const startY=y-((lines.length-1)*lineHeight/2);lines.forEach((ln,i)=>ctx.fillText(ln,x,startY+i*lineHeight));
  }

  qrModal?.querySelectorAll('[data-qr-close]').forEach(el=>el.addEventListener('click',closeQrModal));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!qrModal?.classList.contains('hidden'))closeQrModal();});
  document.getElementById('copyProjectQrLink')?.addEventListener('click',async()=>{
    const ok=await copyText(activeQrUrl);showMessage(qrMsg,ok?'Enlace copiado al portapapeles.':'No se pudo copiar el enlace.',ok);
  });
  document.getElementById('downloadProjectQr')?.addEventListener('click',()=>{
    if(!activeQrRecord)return;const c=getQrCanvas();if(!c){showMessage(qrMsg,'El QR todavía no está disponible.');return;}
    downloadDataUrl(c.toDataURL('image/png'),`qr-yo-reporto-${safeFilePart(activeQrRecord.codigo||activeQrRecord.nombre)}.png`);
    showMessage(qrMsg,'QR descargado correctamente.',true);
  });
  document.getElementById('downloadProjectPoster')?.addEventListener('click',downloadPoster);

  await loadRecords();
}

if(page==='projects-admin')initProjectsAdmin();


// ============================================================
// ETAPA 29 - LEVANTAMIENTO PUBLICO MEDIANTE TOKEN
// ============================================================
async function initPublicLift(){
  const token=new URLSearchParams(location.search).get('t');
  const loading=document.getElementById('liftLoading');
  const card=document.getElementById('liftContent');
  const errorBox=document.getElementById('liftError');
  const form=document.getElementById('publicLiftForm');
  const msg=document.getElementById('publicLiftMessage');
  const result=document.getElementById('publicLiftResult');
  const photo=document.getElementById('publicLiftPhoto');
  const preview=document.getElementById('publicLiftPhotoPreview');
  const submitBtn=document.getElementById('publicLiftSubmitBtn');
  const signerEl=document.getElementById('publicLiftSigner');
  const signaturePad=createSignaturePad(document.getElementById('publicLiftSignature'),document.getElementById('publicLiftClearSignature'));

  if(!token){
    loading.classList.add('hidden');
    errorBox.classList.remove('hidden');
    errorBox.textContent='El enlace de levantamiento no es válido.';
    return;
  }

  const {data,error}=await sb.rpc('public_obtener_levantamiento',{p_token:token});
  loading.classList.add('hidden');
  if(error){
    errorBox.classList.remove('hidden');
    errorBox.textContent='No se pudo abrir el levantamiento: '+error.message;
    return;
  }
  const row=Array.isArray(data)?data[0]:data;
  if(!row){
    errorBox.classList.remove('hidden');
    errorBox.textContent='El enlace no existe o ya no está disponible.';
    return;
  }

  document.getElementById('liftCode').textContent=row.codigo_reporte||'Reporte SIG';
  document.getElementById('liftProject').textContent=row.proyecto||'—';
  document.getElementById('liftDate').textContent=formatDateEsV6(row.fecha);
  document.getElementById('liftReporter').textContent=row.reportado_por||'—';
  document.getElementById('liftPlace').textContent=row.lugar||'—';
  document.getElementById('liftType').textContent=row.tipo_hallazgo||'—';
  document.getElementById('liftDescription').textContent=row.descripcion||'—';
  document.getElementById('liftAction').textContent=row.accion||'—';
  document.getElementById('liftDue').textContent=row.fecha_limite?formatDateEsV6(row.fecha_limite):'Sin fecha definida';
  document.getElementById('liftResponsible').textContent=row.nombre_responsable||'—';
  if(signerEl)signerEl.value=row.nombre_responsable||'';
  document.getElementById('liftStatus').textContent=(row.estado_asignacion||'').replaceAll('_',' ');
  card.classList.remove('hidden');

  const originalEvidenceBox=document.getElementById('liftOriginalEvidence');
  if(row.ruta_foto_hallazgo){
    const {data:signedPhoto,error:photoError}=await sb.storage
      .from('evidencias-ssomac')
      .createSignedUrl(row.ruta_foto_hallazgo,3600);
    if(!photoError&&signedPhoto?.signedUrl){
      originalEvidenceBox.innerHTML=`<a href="${signedPhoto.signedUrl}" target="_blank" rel="noopener"><img src="${signedPhoto.signedUrl}" alt="Fotografía de la observación"></a><small>Haz clic sobre la fotografía para verla en tamaño completo.</small>`;
    }else{
      originalEvidenceBox.innerHTML='<span>No se pudo cargar la fotografía de la observación.</span>';
    }
  }else{
    originalEvidenceBox.innerHTML='<span>Este reporte no tiene fotografía de hallazgo registrada.</span>';
  }

  if(!row.puede_levantar){
    form.classList.add('hidden');
    result.classList.remove('hidden');
    result.innerHTML=`<div class="public-success"><strong>Este levantamiento ya fue procesado</strong><p>Estado actual: ${escapeHtml((row.estado_asignacion||'').replaceAll('_',' '))}.</p></div>`;
    return;
  }

  photo.addEventListener('change',()=>{
    const file=photo.files?.[0];
    if(!file){preview.classList.add('hidden');preview.removeAttribute('src');return;}
    preview.src=URL.createObjectURL(file);
    preview.classList.remove('hidden');
  });

  form.addEventListener('submit',async e=>{
    e.preventDefault();showMessage(msg,'');
    const comment=document.getElementById('publicLiftComment').value.trim();
    const file=photo.files?.[0];
    const signerName=signerEl?.value.trim();
    if(comment.length<5){showMessage(msg,'Describe la acción correctiva realizada.');return;}
    if(!file){showMessage(msg,'Adjunta una fotografía del levantamiento.');return;}
    if(!signerName){showMessage(msg,'Indica el nombre de quien realiza el levantamiento.');return;}
    if(signaturePad?.isEmpty()){showMessage(msg,'Registra la firma digital de quien realiza el levantamiento.');return;}
    submitBtn.disabled=true;submitBtn.textContent='Enviando levantamiento...';
    try{
      const blob=await optimizeImage(file);
      const path=`levantamientos/${token}/evidencia/${Date.now()}_${uid()}.webp`;
      const {error:uploadError}=await sb.storage.from('evidencias-ssomac').upload(path,blob,{contentType:'image/webp',upsert:false});
      if(uploadError)throw uploadError;
      const signatureBlob=await signaturePad.toBlob();
      const signaturePath=`levantamientos/${token}/evidencia/firma_${Date.now()}_${uid()}.webp`;
      const {error:signatureUploadError}=await sb.storage.from('evidencias-ssomac').upload(signaturePath,signatureBlob,{contentType:'image/webp',upsert:false});
      if(signatureUploadError)throw signatureUploadError;
      const {data:done,error:rpcError}=await sb.rpc('public_registrar_levantamiento',{
        p_token:token,
        p_comentario:comment,
        p_ruta_foto:path,
        p_ruta_firma:signaturePath,
        p_firmante_nombre:signerName
      });
      if(rpcError)throw rpcError;
      form.classList.add('hidden');
      result.classList.remove('hidden');
      result.innerHTML=`<div class="public-success"><strong>Levantamiento enviado correctamente</strong><p>La evidencia quedó pendiente de validación por Seguridad/SIG.</p></div>`;
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(err){
      console.error(err);
      showMessage(msg,'No se pudo enviar el levantamiento: '+(err.message||err));
    }finally{
      submitBtn.disabled=false;submitBtn.textContent='Enviar levantamiento';
    }
  });
}

if(page==='public-lift')initPublicLift();

// ============================================================
// ETAPA 35 - DASHBOARD ANALITICO SSOMAC (V10.6)
// ============================================================
const ANALYTICS_MONTHS=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
let analyticsCharts=[];

async function analyticsFetchAll(table,select){
  const rows=[];const size=1000;let from=0;
  while(true){
    const {data,error}=await sb.from(table).select(select).range(from,from+size-1);
    if(error)throw error;
    rows.push(...(data||[]));
    if(!data||data.length<size)break;
    from+=size;
  }
  return rows;
}

function analyticsUniqueOptions(rows,getValue,getLabel){
  const map=new Map();
  rows.forEach(r=>{const v=getValue(r);if(v!==null&&v!==undefined&&String(v)!=='')map.set(String(v),getLabel(r));});
  return [...map.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'es'));
}
function analyticsFillSelect(el,items,allLabel){
  if(!el)return;const current=el.value;
  el.innerHTML=`<option value="">${escapeHtml(allLabel)}</option>`+items.map(([v,l])=>`<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('');
  if([...el.options].some(o=>o.value===current))el.value=current;
}
function analyticsDiffDays(start,end){
  const a=parseYmdLocal(start),b=parseYmdLocal(end);if(!a||!b)return null;return Math.max(0,Math.round((b-a)/86400000));
}
function analyticsPct(n,d){return d?Math.round((n/d)*100):null;}
function analyticsCountBy(rows,getLabel,{excludeBlank=false}={}){
  const m=new Map();
  rows.forEach(r=>{let k=getLabel(r);if(k===null||k===undefined||String(k).trim()===''){if(excludeBlank)return;k='N.A.';}k=String(k).trim();m.set(k,(m.get(k)||0)+1);});
  return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es'));
}
function analyticsChartLabel(value,max=34){const s=String(value??'');return s.length>max?s.slice(0,max-1)+'…':s;}
function analyticsDestroyCharts(){analyticsCharts.forEach(c=>{try{c.destroy();}catch(_){}});analyticsCharts=[];}
function analyticsMakeChart(id,config){
  const canvas=document.getElementById(id);if(!canvas||typeof Chart==='undefined')return null;
  const chart=new Chart(canvas.getContext('2d'),config);analyticsCharts.push(chart);return chart;
}
function analyticsPalette(n){
  const base=['#C00000','#2563eb','#15803d','#d97706','#7c3aed','#0891b2','#be185d','#475569','#65a30d','#ea580c','#4f46e5','#0f766e'];
  return Array.from({length:n},(_,i)=>base[i%base.length]);
}
function analyticsDoughnut(id,pairs){
  const safe=pairs.length?pairs:[['Sin datos',0]];
  return analyticsMakeChart(id,{type:'doughnut',data:{labels:safe.map(x=>x[0]),datasets:[{data:safe.map(x=>x[1]),backgroundColor:analyticsPalette(safe.length),borderColor:'#ffffff',borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom',labels:{boxWidth:11,usePointStyle:true,padding:14}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.parsed}`}}}}});
}
function analyticsBar(id,pairs,{horizontal=false,maxItems=12}={}){
  let safe=pairs.slice(0,maxItems);if(!safe.length)safe=[['Sin datos',0]];
  return analyticsMakeChart(id,{type:'bar',data:{labels:safe.map(x=>x[0]),datasets:[{label:'Ocurrencias',data:safe.map(x=>x[1]),backgroundColor:safe.map((_,i)=>analyticsPalette(safe.length)[i]),borderRadius:6,maxBarThickness:48}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>items[0]?.label||''}}},scales:{x:{beginAtZero:true,ticks:{precision:0,callback:function(v){return horizontal?v:analyticsChartLabel(this.getLabelForValue(v),22);}},grid:{display:horizontal}},y:{beginAtZero:true,ticks:{precision:0,callback:function(v){return horizontal?analyticsChartLabel(this.getLabelForValue(v),36):v;}},grid:{display:!horizontal}}}}});
}
function analyticsPareto(id,pairs){
  const top=pairs.slice(0,10);const safe=top.length?top:[['Sin datos',0]];const total=safe.reduce((a,x)=>a+x[1],0)||1;let acc=0;const cum=safe.map(x=>{acc+=x[1];return Math.round(acc/total*1000)/10;});
  return analyticsMakeChart(id,{data:{labels:safe.map(x=>x[0]),datasets:[{type:'bar',label:'Frecuencia',data:safe.map(x=>x[1]),backgroundColor:'#C00000',borderRadius:5,yAxisID:'y',maxBarThickness:38},{type:'line',label:'% acumulado',data:cum,borderColor:'#2563eb',backgroundColor:'#2563eb',pointRadius:3,pointHoverRadius:5,tension:.2,yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{position:'bottom'},tooltip:{callbacks:{title:items=>items[0]?.label||''}}},scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{ticks:{callback:function(v){return analyticsChartLabel(this.getLabelForValue(v),44);}}},y1:{position:'right',min:0,max:100,grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%'}}}}});
}

async function initAnalyticsDashboard(){
  const session=await requireSession();if(!session)return;
  document.getElementById('logoutBtn')?.addEventListener('click',logout);
  const msg=document.getElementById('analyticsMessage');
  const ids={year:'analyticsYear',month:'analyticsMonth',project:'analyticsProject',area:'analyticsArea',origin:'analyticsOrigin',type:'analyticsType',status:'analyticsStatus',potential:'analyticsPotential'};
  const els=Object.fromEntries(Object.entries(ids).map(([k,id])=>[k,document.getElementById(id)]));
  try{
    if(typeof Chart==='undefined')throw new Error('No se pudo cargar el motor de gráficos. Actualiza la página e inténtalo nuevamente.');
    Chart.defaults.font.family='Arial, Helvetica, sans-serif';Chart.defaults.color='#475467';

    const occurrences=await analyticsFetchAll('ocurrencias',`id,numero,fecha,fecha_levantamiento,fecha_levantamiento_original,fecha_ejecutada,modalidad_levantamiento,responsable_correccion,numero_ampliaciones,
      proyecto:proyectos(id,nombre),origen:origenes_hallazgo(id,nombre),tipo:tipos_hallazgo(id,codigo,nombre),potencial:potenciales_perdida(id,nombre),area:areas(id,nombre),estado:estados_ocurrencia(id,codigo,nombre)`);
    const [immediateCauses,basicCauses]=await Promise.all([
      analyticsFetchAll('ocurrencia_causas_inmediatas','ocurrencia_id,causas_inmediatas(id,nombre)'),
      analyticsFetchAll('ocurrencia_causas_basicas','ocurrencia_id,causas_basicas(id,nombre,grupo_nombre,subgrupo_nombre)')
    ]);

    const rows=(occurrences||[]).map(o=>{
      const d=parseYmdLocal(o.fecha);const good=o.origen?.nombre==='BUENA PRACTICA';
      return {...o,_year:d?String(d.getFullYear()):'',_month:d?String(d.getMonth()+1).padStart(2,'0'):'',_typeKey:good?'GOOD':(o.tipo?.id||''),_typeLabel:good?'BUENA PRÁCTICA':(o.tipo?.nombre||'N.A.')};
    });

    const years=[...new Set(rows.map(r=>r._year).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
    els.year.innerHTML='<option value="">Todos los años</option>'+years.map(y=>`<option value="${y}">${y}</option>`).join('');
    ANALYTICS_MONTHS.forEach((m,i)=>els.month.insertAdjacentHTML('beforeend',`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`));
    analyticsFillSelect(els.project,analyticsUniqueOptions(rows,r=>r.proyecto?.id,r=>r.proyecto?.nombre||''),'Todos');
    analyticsFillSelect(els.area,analyticsUniqueOptions(rows,r=>r.area?.id,r=>r.area?.nombre||''),'Todas');
    analyticsFillSelect(els.origin,analyticsUniqueOptions(rows,r=>r.origen?.id,r=>r.origen?.nombre||''),'Todos');
    analyticsFillSelect(els.type,analyticsUniqueOptions(rows,r=>r._typeKey,r=>r._typeLabel),'Todos');
    analyticsFillSelect(els.status,analyticsUniqueOptions(rows,r=>r.estado?.id,r=>r.estado?.nombre||''),'Todos');
    analyticsFillSelect(els.potential,analyticsUniqueOptions(rows,r=>r.potencial?.id,r=>r.potencial?.nombre||''),'Todos');

    const currentYear=String(new Date().getFullYear());
    els.year.value=years.includes(currentYear)?currentYear:(years[0]||'');

    function filteredRows(){
      return rows.filter(r=>(!els.year.value||r._year===els.year.value)&&(!els.month.value||r._month===els.month.value)&&(!els.project.value||String(r.proyecto?.id||'')===els.project.value)&&(!els.area.value||String(r.area?.id||'')===els.area.value)&&(!els.origin.value||String(r.origen?.id||'')===els.origin.value)&&(!els.type.value||String(r._typeKey||'')===els.type.value)&&(!els.status.value||String(r.estado?.id||'')===els.status.value)&&(!els.potential.value||String(r.potencial?.id||'')===els.potential.value));
    }

    function render(){
      const filtered=filteredRows();const idSet=new Set(filtered.map(r=>r.id));
      document.getElementById('analyticsFilteredCount').textContent=String(filtered.length);
      const total=filtered.length;const closed=filtered.filter(r=>r.estado?.codigo==='CERRADO').length;const pending=filtered.filter(r=>r.estado?.codigo==='PENDIENTE_VALIDACION').length;const overdue=filtered.filter(r=>getDeadlineInfo(r).code==='VENCIDO').length;
      const executionDays=filtered.map(r=>analyticsDiffDays(r.fecha,r.fecha_ejecutada)).filter(v=>v!==null);const avgDays=executionDays.length?executionDays.reduce((a,b)=>a+b,0)/executionDays.length:null;
      const withDeadlineAndLift=filtered.filter(r=>r.fecha_ejecutada&&r.fecha_levantamiento);const onTime=withDeadlineAndLift.filter(r=>String(r.fecha_ejecutada)<=String(r.fecha_levantamiento)).length;const onTimePct=analyticsPct(onTime,withDeadlineAndLift.length);
      const modalities=filtered.filter(r=>r.modalidad_levantamiento==='INMEDIATO'||r.modalidad_levantamiento==='ASIGNADO');const immediate=modalities.filter(r=>r.modalidad_levantamiento==='INMEDIATO').length;const immediatePct=analyticsPct(immediate,modalities.length);
      const extensions=filtered.reduce((a,r)=>a+(Number(r.numero_ampliaciones)||0),0);

      document.getElementById('anKpiTotal').textContent=total;
      document.getElementById('anKpiClosed').textContent=closed;document.getElementById('anKpiClosureRate').textContent=`${analyticsPct(closed,total)??'—'}% de cierre`;
      document.getElementById('anKpiAvgDays').textContent=avgDays===null?'—':(Math.round(avgDays*10)/10).toLocaleString('es-PE');
      document.getElementById('anKpiOnTime').textContent=onTimePct===null?'—':`${onTimePct}%`;document.getElementById('anKpiOnTimeBase').textContent=`${withDeadlineAndLift.length} levantada${withDeadlineAndLift.length===1?'':'s'} con plazo`;
      document.getElementById('anKpiOverdue').textContent=overdue;document.getElementById('anKpiPending').textContent=pending;
      document.getElementById('anKpiImmediate').textContent=immediatePct===null?'—':`${immediatePct}%`;document.getElementById('anKpiImmediateBase').textContent=`${modalities.length} modalidad${modalities.length===1?'':'es'} registrada${modalities.length===1?'':'s'}`;
      document.getElementById('anKpiExtensions').textContent=extensions;

      analyticsDestroyCharts();
      const monthly=ANALYTICS_MONTHS.map((m,i)=>[m,filtered.filter(r=>Number(r._month)===i+1).length]);
      analyticsMakeChart('chartMonthly',{type:'line',data:{labels:monthly.map(x=>x[0]),datasets:[{label:'Ocurrencias',data:monthly.map(x=>x[1]),borderColor:'#C00000',backgroundColor:'rgba(192,0,0,.10)',fill:true,tension:.28,pointRadius:4,pointBackgroundColor:'#C00000'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}},x:{grid:{display:false}}}}});
      analyticsDoughnut('chartStatus',analyticsCountBy(filtered,r=>r.estado?.nombre||'N.A.'));
      analyticsDoughnut('chartType',analyticsCountBy(filtered,r=>r._typeLabel));
      analyticsBar('chartProject',analyticsCountBy(filtered,r=>r.proyecto?.nombre||'N.A.'),{horizontal:false,maxItems:15});
      analyticsBar('chartArea',analyticsCountBy(filtered,r=>r.area?.nombre||'N.A.'),{horizontal:true,maxItems:15});
      analyticsDoughnut('chartPotential',analyticsCountBy(filtered,r=>r.potencial?.nombre,{excludeBlank:true}));
      analyticsDoughnut('chartModality',analyticsCountBy(modalities,r=>r.modalidad_levantamiento==='INMEDIATO'?'INMEDIATO':'ASIGNADO'));
      analyticsBar('chartOrigin',analyticsCountBy(filtered,r=>r.origen?.nombre||'N.A.'),{horizontal:false,maxItems:10});

      const ciPairs=analyticsCountBy(immediateCauses.filter(c=>idSet.has(c.ocurrencia_id)),c=>c.causas_inmediatas?.nombre,{excludeBlank:true});
      const cbPairs=analyticsCountBy(basicCauses.filter(c=>idSet.has(c.ocurrencia_id)),c=>c.causas_basicas?.nombre,{excludeBlank:true});
      analyticsPareto('chartImmediateCauses',ciPairs);analyticsPareto('chartBasicCauses',cbPairs);

      const active=filtered.filter(r=>r.estado?.codigo!=='CERRADO');const responsibleMap=new Map();
      active.forEach(r=>{const name=(r.responsable_correccion||'Sin responsable asignado').trim()||'Sin responsable asignado';if(!responsibleMap.has(name))responsibleMap.set(name,{name,active:0,overdue:0,pending:0,onTime:0});const x=responsibleMap.get(name);x.active++;const dl=getDeadlineInfo(r);if(dl.code==='VENCIDO')x.overdue++;if(r.estado?.codigo==='PENDIENTE_VALIDACION')x.pending++;if(dl.code==='EN_PLAZO'||dl.code==='POR_VENCER')x.onTime++;});
      const responsibleRows=[...responsibleMap.values()].sort((a,b)=>b.active-a.active||b.overdue-a.overdue||a.name.localeCompare(b.name,'es')).slice(0,20);
      const tbody=document.getElementById('analyticsResponsibleBody');tbody.innerHTML=responsibleRows.length?responsibleRows.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td><strong>${x.active}</strong></td><td class="danger-number">${x.overdue}</td><td class="info-number">${x.pending}</td><td>${x.onTime}</td></tr>`).join(''):'<tr><td colspan="5">No hay ocurrencias activas con los filtros seleccionados.</td></tr>';

      showMessage(msg,total?'':'No hay ocurrencias que coincidan con los filtros seleccionados.',total>0);
    }

    Object.values(els).forEach(el=>el?.addEventListener('change',render));
    document.getElementById('analyticsResetBtn')?.addEventListener('click',()=>{els.year.value=years.includes(currentYear)?currentYear:(years[0]||'');els.month.value='';els.project.value='';els.area.value='';els.origin.value='';els.type.value='';els.status.value='';els.potential.value='';render();});
    render();
  }catch(err){console.error(err);showMessage(msg,'No se pudo cargar el dashboard: '+(err.message||err));}
}

if(page==='analytics-dashboard')initAnalyticsDashboard();
