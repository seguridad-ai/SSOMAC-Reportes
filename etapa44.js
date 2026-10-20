// ============================================================
// ETAPA 44
// ELIMINACIÓN CONTROLADA DE OCURRENCIAS Y REPORTES
// SOLO ADMIN
// ============================================================

(async function () {

  if (typeof sb === 'undefined') return;

  const { data: authData } = await sb.auth.getSession();
  const session = authData?.session;

  if (!session) return;

  const { data: profile, error: profileError } = await sb
    .from('perfiles')
    .select('rol,activo')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) return;

  // SOLO ADMIN.
  if (profile.activo !== true || profile.rol !== 'ADMIN') return;


  // ==========================================================
  // ESTILOS
  // ==========================================================

  const style = document.createElement('style');

  style.textContent = `

    .admin-delete-btn {
      border: 1px solid #dc2626 !important;
      background: #fff !important;
      color: #b42318 !important;
      border-radius: 10px !important;
      padding: 10px 14px !important;
      font-weight: 800 !important;
      cursor: pointer !important;
      transition: .18s ease !important;
      margin-left: 8px;
    }

    .admin-delete-btn:hover {
      background: #fff1f1 !important;
      transform: translateY(-1px);
    }

    .admin-delete-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(15,23,42,.62);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .admin-delete-modal {
      width: min(560px,100%);
      max-height: 92vh;
      overflow: auto;
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 30px 80px rgba(0,0,0,.28);
      padding: 26px;
    }

    .admin-delete-modal h2 {
      margin: 4px 0 8px;
      color: #0f172a;
    }

    .admin-delete-eyebrow {
      color: #c00000;
      font-weight: 900;
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .admin-delete-warning {
      margin: 18px 0;
      padding: 14px 16px;
      border: 1px solid #fecaca;
      background: #fff5f5;
      border-radius: 12px;
      color: #991b1b;
      line-height: 1.5;
    }

    .admin-delete-record {
      padding: 15px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      margin: 15px 0;
    }

    .admin-delete-record strong {
      display:block;
      font-size:18px;
      color:#0f172a;
      margin-bottom:4px;
    }

    .admin-delete-field {
      margin-top: 15px;
    }

    .admin-delete-field label {
      display:block;
      font-weight:800;
      color:#111827;
      margin-bottom:7px;
    }

    .admin-delete-field textarea,
    .admin-delete-field input[type="text"] {
      width:100%;
      box-sizing:border-box;
      border:1px solid #cbd5e1;
      border-radius:10px;
      padding:12px;
      font:inherit;
    }

    .admin-delete-check {
      display:flex;
      align-items:flex-start;
      gap:9px;
      padding:12px;
      margin-top:15px;
      border-radius:10px;
      background:#fff7ed;
      border:1px solid #fed7aa;
    }

    .admin-delete-actions {
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:20px;
      flex-wrap:wrap;
    }

    .admin-delete-cancel,
    .admin-delete-confirm {
      border-radius:10px;
      padding:11px 16px;
      font-weight:800;
      cursor:pointer;
    }

    .admin-delete-cancel {
      border:1px solid #cbd5e1;
      background:#fff;
      color:#0f172a;
    }

    .admin-delete-confirm {
      border:0;
      background:#c00000;
      color:#fff;
    }

    .admin-delete-confirm:disabled {
      opacity:.45;
      cursor:not-allowed;
    }

    .admin-delete-message {
      margin-top:12px;
      min-height:20px;
      font-size:14px;
      color:#b42318;
    }

    @media (max-width:700px) {
      .admin-delete-modal {
        padding:20px;
      }

      .admin-delete-btn {
        margin-left:0;
        margin-top:8px;
        width:100%;
      }
    }
  `;

  document.head.appendChild(style);


  // ==========================================================
  // HELPERS
  // ==========================================================

  function esc(v = '') {
    return String(v)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }


  function firstRow(data) {
    return Array.isArray(data) ? data[0] : data;
  }


  async function removeStorageFiles(paths) {

    const clean = [...new Set(
      (paths || [])
        .filter(Boolean)
        .map(x => String(x).trim())
        .filter(Boolean)
    )];

    if (!clean.length) return null;

    const { error } = await sb.storage
      .from('evidencias-ssomac')
      .remove(clean);

    return error || null;
  }


  function closeModal() {
    document.getElementById('adminDeleteOverlay')?.remove();
  }


  // ==========================================================
  // MODAL
  // ==========================================================

  async function openDeleteModal(type, id) {

    let rpcName;
    let params;

    if (type === 'OCCURRENCE') {

      rpcName = 'admin_previsualizar_eliminacion_ocurrencia';

      params = {
        p_ocurrencia_id: id
      };

    } else {

      rpcName = 'admin_previsualizar_eliminacion_reporte';

      params = {
        p_reporte_id: id
      };
    }


    const { data, error } = await sb.rpc(rpcName, params);

    if (error) {
      alert('No se pudo preparar la eliminación: ' + error.message);
      return;
    }


    const row = firstRow(data);

    if (!row) {
      alert('No se encontró el registro.');
      return;
    }


    const linkedCode =
      type === 'OCCURRENCE'
        ? row.reporte_vinculado_codigo
        : row.ocurrencia_vinculada_codigo;


    const linkedText =
      type === 'OCCURRENCE'
        ? 'reporte de trabajador'
        : 'ocurrencia formal';


    const overlay = document.createElement('div');

    overlay.id = 'adminDeleteOverlay';
    overlay.className = 'admin-delete-overlay';


    overlay.innerHTML = `

      <div class="admin-delete-modal">

        <div class="admin-delete-eyebrow">
          Administración
        </div>

        <h2>Eliminar definitivamente</h2>

        <div class="admin-delete-warning">

          <strong>Esta acción no se puede deshacer.</strong>

          <br>

          Se eliminarán los datos relacionados con este
          registro, incluyendo las evidencias asociadas.

        </div>


        <div class="admin-delete-record">

          <strong>${esc(row.codigo || '')}</strong>

          <span>
            Proyecto:
            ${esc(row.proyecto || 'SIN PROYECTO')}
          </span>

          ${
            type === 'OCCURRENCE'
              ? `<br><span>Evidencias asociadas: ${Number(row.cantidad_evidencias || 0)}</span>`
              : ''
          }

        </div>


        ${
          linkedCode
            ? `
              <label class="admin-delete-check">

                <input
                  id="adminDeleteLinked"
                  type="checkbox"
                >

                <span>
                  Este registro está vinculado al
                  <strong>${esc(linkedText)} ${esc(linkedCode)}</strong>.
                  Confirmo que deseo eliminar ambos registros.
                </span>

              </label>
            `
            : ''
        }


        <div class="admin-delete-field">

          <label for="adminDeleteReason">
            Motivo de eliminación *
          </label>

          <textarea
            id="adminDeleteReason"
            rows="3"
          >Registro de prueba</textarea>

        </div>


        <div class="admin-delete-field">

          <label for="adminDeleteConfirmation">
            Para confirmar escriba ELIMINAR *
          </label>

          <input
            id="adminDeleteConfirmation"
            type="text"
            autocomplete="off"
            placeholder="ELIMINAR"
          >

        </div>


        <div
          id="adminDeleteMessage"
          class="admin-delete-message">
        </div>


        <div class="admin-delete-actions">

          <button
            id="adminDeleteCancel"
            type="button"
            class="admin-delete-cancel">
            Cancelar
          </button>

          <button
            id="adminDeleteConfirm"
            type="button"
            class="admin-delete-confirm"
            disabled>
            Eliminar definitivamente
          </button>

        </div>

      </div>
    `;


    document.body.appendChild(overlay);


    const reason =
      document.getElementById('adminDeleteReason');

    const confirmation =
      document.getElementById('adminDeleteConfirmation');

    const linked =
      document.getElementById('adminDeleteLinked');

    const confirmBtn =
      document.getElementById('adminDeleteConfirm');

    const msg =
      document.getElementById('adminDeleteMessage');


    function validate() {

      const validReason =
        reason.value.trim().length >= 5;

      const validWord =
        confirmation.value.trim().toUpperCase() === 'ELIMINAR';

      const validLinked =
        !linkedCode || linked?.checked === true;

      confirmBtn.disabled =
        !(validReason && validWord && validLinked);
    }


    reason.addEventListener('input', validate);
    confirmation.addEventListener('input', validate);
    linked?.addEventListener('change', validate);


    document
      .getElementById('adminDeleteCancel')
      .addEventListener('click', closeModal);


    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });


    confirmBtn.addEventListener('click', async () => {

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Eliminando...';

      msg.textContent = '';

      try {

        let deleteRpc;
        let deleteParams;


        if (type === 'OCCURRENCE') {

          deleteRpc =
            'admin_eliminar_ocurrencia';

          deleteParams = {

            p_ocurrencia_id: id,

            p_motivo:
              reason.value.trim(),

            p_confirmacion:
              confirmation.value.trim(),

            p_eliminar_reporte_vinculado:
              linkedCode
                ? linked.checked
                : false

          };

        } else {

          deleteRpc =
            'admin_eliminar_reporte';

          deleteParams = {

            p_reporte_id: id,

            p_motivo:
              reason.value.trim(),

            p_confirmacion:
              confirmation.value.trim(),

            p_eliminar_ocurrencia_vinculada:
              linkedCode
                ? linked.checked
                : false

          };
        }


        const { data: deleted, error: deleteError } =
          await sb.rpc(deleteRpc, deleteParams);


        if (deleteError)
          throw deleteError;


        const out =
          firstRow(deleted);


        // Primero la base ya quedó depurada.
        // Ahora elimina los archivos físicos del bucket.

        const storageError =
          await removeStorageFiles(out?.rutas_storage || []);


        if (storageError) {

          console.warn(
            'El registro fue eliminado, pero algunos archivos no pudieron eliminarse:',
            storageError
          );

        }


        msg.style.color = '#067647';

        msg.textContent =
          `${out?.codigo || 'Registro'} eliminado correctamente.`;


        setTimeout(() => {

          closeModal();

          if (
            document.body.dataset.page ===
            'occurrence-detail'
          ) {

            location.href = 'ocurrencias.html';

          } else {

            location.reload();

          }

        }, 700);


      } catch (err) {

        console.error(err);

        msg.style.color = '#b42318';

        msg.textContent =
          err?.message ||
          String(err);

        confirmBtn.disabled = false;

        confirmBtn.textContent =
          'Eliminar definitivamente';

      }

    });


    confirmation.focus();
  }


  // ==========================================================
  // OCURRENCIAS
  // ==========================================================

  function enhanceOccurrenceCards() {

    document
      .querySelectorAll('.occurrence-card')
      .forEach(card => {

        if (
          card.dataset.adminDeleteEnhanced === '1'
        ) return;


        const detail =
          card.querySelector(
            'a[href*="detalle-ocurrencia.html?id="]'
          );


        if (!detail) return;


        const url =
          new URL(detail.href, location.href);

        const id =
          url.searchParams.get('id');


        if (!id) return;


        const btn =
          document.createElement('button');


        btn.type = 'button';

        btn.className =
          'admin-delete-btn';

        btn.textContent =
          'Eliminar';


        btn.addEventListener('click', () =>
          openDeleteModal(
            'OCCURRENCE',
            id
          )
        );


        const actions =
          detail.parentElement || card;


        actions.appendChild(btn);

        card.dataset.adminDeleteEnhanced = '1';

      });
  }


  // ==========================================================
  // DETALLE DE OCURRENCIA
  // ==========================================================

  function enhanceOccurrenceDetail() {

    if (
      document.body.dataset.page !==
      'occurrence-detail'
    ) return;


    if (
      document.getElementById(
        'adminDeleteDetailBtn'
      )
    ) return;


    const id =
      new URLSearchParams(
        location.search
      ).get('id');


    if (!id) return;


    const header =
      document.getElementById(
        'detailHeader'
      );


    if (!header || !header.children.length)
      return;


    const wrapper =
      document.createElement('div');


    wrapper.style.cssText =
      'display:flex;justify-content:flex-end;margin-top:12px;';


    const btn =
      document.createElement('button');


    btn.id =
      'adminDeleteDetailBtn';

    btn.type =
      'button';

    btn.className =
      'admin-delete-btn';

    btn.textContent =
      'Eliminar ocurrencia';


    btn.addEventListener(
      'click',
      () =>
        openDeleteModal(
          'OCCURRENCE',
          id
        )
    );


    wrapper.appendChild(btn);

    header.appendChild(wrapper);
  }


  // ==========================================================
  // REPORTES DE TRABAJADORES
  // ==========================================================

  function enhanceWorkerReports() {

    document
      .querySelectorAll('.worker-report-card')
      .forEach(card => {

        if (
          card.dataset.adminDeleteEnhanced === '1'
        ) return;


        const review =
          card.querySelector(
            '[data-review-id]'
          );


        if (!review) return;


        const id =
          review.dataset.reviewId;


        if (!id) return;


        const btn =
          document.createElement('button');


        btn.type =
          'button';

        btn.className =
          'admin-delete-btn';

        btn.textContent =
          'Eliminar';


        btn.addEventListener(
          'click',
          () =>
            openDeleteModal(
              'REPORT',
              id
            )
        );


        const actions =
          card.querySelector(
            '.worker-report-card-action'
          ) ||
          review.parentElement ||
          card;


        actions.appendChild(btn);

        card.dataset.adminDeleteEnhanced = '1';

      });
  }


  // ==========================================================
  // OBSERVAR CAMBIOS DEL APP.JS
  // ==========================================================

  function enhance() {

    enhanceOccurrenceCards();
    enhanceOccurrenceDetail();
    enhanceWorkerReports();

  }


  enhance();


  const observer =
    new MutationObserver(() => {
      enhance();
    });


  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

})();
