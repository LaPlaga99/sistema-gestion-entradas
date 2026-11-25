import './style.css';
import {
  state,
  DEFAULT_EVENT_CONFIG,
  loginUser,
  saveEventConfig,
  saveIntegrantAssignment,
  resetAllData,
  subscribeRealtimeData
} from './firebase.js';
import {
  refreshIcons,
  showToast,
  showConfirmModal,
  applyEventConfigToUI,
  updateOperatorSeatsDisplay,
  renderAllGrids,
  renderIntegrantsList,
  updateKPIs,
  renderAuthControls
} from './ui.js';
import { exportIntegrantsCSV, downloadPDFReport, downloadMapPNG } from './reports.js';

function startEditingIntegrant(item) {
  state.editingIntegrantId = item.id;
  document.getElementById('op-integrant-name').value = item.name;
  document.getElementById('op-integrant-dni').value = item.dni || '';
  document.getElementById('op-seat-status').value = item.seatStatus || 'asignado';

  state.operatorSelectedSeats = new Set(item.seats || []);
  updateOperatorSeatsDisplay();

  document.getElementById('btn-save-text').innerText = "Guardar";
  document.getElementById('btn-cancel-edit').classList.remove('hidden');

  renderAllGrids();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(`Editando butacas de ${item.name}`, 'info');
}

function cancelEditingIntegrant() {
  state.editingIntegrantId = null;
  state.operatorSelectedSeats.clear();

  document.getElementById('op-integrant-name').value = '';
  document.getElementById('op-integrant-dni').value = '';
  document.getElementById('op-seat-status').value = 'asignado';
  document.getElementById('btn-save-text').innerText = "Asignar";
  document.getElementById('btn-cancel-edit').classList.add('hidden');

  updateOperatorSeatsDisplay();
  renderAllGrids();
}

function openEventConfigModal() {
  const cfg = state.eventConfig;
  document.getElementById('cfg-title').value = cfg.title || '';
  document.getElementById('cfg-subtitle').value = cfg.subtitle || '';
  document.getElementById('cfg-map-heading').value = cfg.mapHeading || '';
  document.getElementById('cfg-stage-label').value = cfg.stageLabel || '';

  const zonesContainer = document.getElementById('cfg-zones-container');
  zonesContainer.innerHTML = '';

  const orderedKeys = ['grid-platinum', 'grid-vip-a', 'grid-vip-b', 'grid-gen-a', 'grid-gen-b', 'grid-gen-c'];
  orderedKeys.forEach(gridId => {
    const z = cfg.zones[gridId];
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 items-center bg-slate-950/90 p-2.5 rounded-xl border border-slate-800 text-xs';
    row.dataset.gridId = gridId;
    row.innerHTML = `
      <div class="col-span-3">
        <label class="text-[10px] text-slate-400 block">Zona</label>
        <input type="text" class="cfg-z-name w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-bold" value="${z.name}">
      </div>
      <div class="col-span-3">
        <label class="text-[10px] text-slate-400 block">Sub-etiqueta</label>
        <input type="text" placeholder="Opcional" class="cfg-z-tag w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200" value="${z.tag || ''}">
      </div>
      <div class="col-span-2">
        <label class="text-[10px] text-slate-400 block">Precio (S/)</label>
        <input type="number" min="0" step="1" class="cfg-z-price w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-amber-300 font-bold" value="${z.price}">
      </div>
      <div class="col-span-2">
        <label class="text-[10px] text-slate-400 block">Inicio #</label>
        <input type="number" min="1" class="cfg-z-start w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200" value="${z.start}">
      </div>
      <div class="col-span-2">
        <label class="text-[10px] text-slate-400 block">Fin #</label>
        <input type="number" min="1" class="cfg-z-end w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200" value="${z.end}">
      </div>
    `;
    zonesContainer.appendChild(row);
  });

  document.getElementById('event-config-modal').classList.remove('hidden');
  refreshIcons();
}

async function handleResetMap() {
  const confirmed = await showConfirmModal(
    'Reiniciar Mapa Completo',
    'Esta acción liberará todas las butacas y eliminará todos los registros de integrantes. No se puede deshacer.',
    'Sí, Reiniciar Todo'
  );
  if (!confirmed) return;

  try {
    await resetAllData();
    state.operatorSelectedSeats.clear();
    state.highlightedIntegrantSeats.clear();
    state.currentHighlightedIntegrantId = null;
    state.editingIntegrantId = null;
    updateOperatorSeatsDisplay();
    showToast("Mapa e integrantes reiniciados con éxito.", 'success');
  } catch {
    showToast("Error al reiniciar. Solo el administrador principal tiene permisos.", 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyEventConfigToUI();
  renderAllGrids();
  renderAuthControls({ onOpenConfig: openEventConfigModal, onResetMap: handleResetMap });

  document.getElementById('close-login-modal').addEventListener('click', () => {
    document.getElementById('login-modal').classList.add('hidden');
  });
  document.getElementById('close-config-modal').addEventListener('click', () => {
    document.getElementById('event-config-modal').classList.add('hidden');
  });
  document.getElementById('btn-cancel-config').addEventListener('click', () => {
    document.getElementById('event-config-modal').classList.add('hidden');
  });
  document.getElementById('btn-cancel-edit').addEventListener('click', cancelEditingIntegrant);

  document.getElementById('btn-restore-default-config').addEventListener('click', () => {
    state.eventConfig = JSON.parse(JSON.stringify(DEFAULT_EVENT_CONFIG));
    openEventConfigModal();
    showToast("Valores por defecto cargados. Guarda en Firebase para aplicar.", 'info');
  });

  document.getElementById('event-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSave = document.getElementById('btn-save-config');
    const updatedZones = JSON.parse(JSON.stringify(state.eventConfig.zones));

    document.querySelectorAll('#cfg-zones-container > div').forEach(row => {
      const gridId = row.dataset.gridId;
      updatedZones[gridId] = {
        ...updatedZones[gridId],
        name: row.querySelector('.cfg-z-name').value.trim().toUpperCase(),
        tag: row.querySelector('.cfg-z-tag').value.trim().toUpperCase(),
        price: Number(row.querySelector('.cfg-z-price').value) || 0,
        start: Number(row.querySelector('.cfg-z-start').value) || 1,
        end: Number(row.querySelector('.cfg-z-end').value) || 1
      };
    });

    const payload = {
      title: document.getElementById('cfg-title').value.trim(),
      subtitle: document.getElementById('cfg-subtitle').value.trim().toUpperCase(),
      mapHeading: document.getElementById('cfg-map-heading').value.trim().toUpperCase(),
      stageLabel: document.getElementById('cfg-stage-label').value.trim().toUpperCase(),
      zones: updatedZones,
      updatedAt: new Date().toISOString()
    };

    try {
      btnSave.innerText = "Guardando...";
      btnSave.disabled = true;
      await saveEventConfig(payload);
      document.getElementById('event-config-modal').classList.add('hidden');
      showToast("Configuración del evento actualizada en tiempo real.", 'success');
    } catch {
      showToast("Error de permisos al guardar la configuración.", 'error');
    } finally {
      btnSave.innerText = "Guardar en Firebase";
      btnSave.disabled = false;
    }
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('btn-submit-login');

    try {
      errorEl.classList.add('hidden');
      btn.innerText = "Verificando...";
      btn.disabled = true;
      await loginUser(email, password);
      document.getElementById('login-modal').classList.add('hidden');
      showToast('Bienvenido al panel operativo.', 'success');
    } catch {
      errorEl.innerText = "Credenciales incorrectas o usuario no autorizado.";
      errorEl.classList.remove('hidden');
    } finally {
      btn.innerText = "Iniciar Sesión";
      btn.disabled = false;
    }
  });

  document.getElementById('btn-save-integrant-assignment').addEventListener('click', async () => {
    const name = document.getElementById('op-integrant-name').value.trim();
    const dni = document.getElementById('op-integrant-dni').value.trim();
    const seatStatus = document.getElementById('op-seat-status').value;
    const seatsArray = Array.from(state.operatorSelectedSeats).sort((a, b) => a - b);

    if (!name) return showToast("Ingresa el nombre del integrante.", 'warning');
    if (seatsArray.length === 0) return showToast("Selecciona al menos una butaca en el mapa.", 'warning');

    try {
      const wasEditing = Boolean(state.editingIntegrantId);
      await saveIntegrantAssignment({ name, dni, seatStatus, seatsArray });
      showToast(
        wasEditing
          ? `Butacas actualizadas para ${name}.`
          : `Asignación registrada para ${name} (${seatsArray.length} butacas).`,
        'success'
      );
      cancelEditingIntegrant();
    } catch {
      showToast("Error al guardar en la base de datos. Verifica tus permisos.", 'error');
    }
  });

  document.getElementById('search-input').addEventListener('input', () => {
    renderIntegrantsList(startEditingIntegrant);
    renderAllGrids();
  });
  document.getElementById('filter-zone').addEventListener('change', renderAllGrids);
  document.getElementById('filter-status').addEventListener('change', renderAllGrids);

  document.getElementById('btn-export-integrants').addEventListener('click', exportIntegrantsCSV);
  document.getElementById('btn-download-pdf-report').addEventListener('click', downloadPDFReport);
  document.getElementById('btn-download-map').addEventListener('click', downloadMapPNG);

  subscribeRealtimeData({
    onConfigChange: () => {
      applyEventConfigToUI();
      renderAllGrids();
      updateKPIs();
    },
    onMapChange: () => {
      renderAllGrids();
      updateKPIs();
    },
    onIntegrantsChange: () => {
      renderIntegrantsList(startEditingIntegrant);
      renderAllGrids();
    },
    onAuthChange: (user) => {
      const syncText = document.getElementById('sync-status-text');
      const syncIndicator = document.getElementById('sync-status-indicator');

      if (user && (state.currentUserRole === 'admin' || state.currentUserRole === 'operator')) {
        syncText.innerText = `${state.currentUserRole.toUpperCase()}: ${user.email}`;
        syncIndicator.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse";
      } else if (user) {
        syncText.innerText = "Usuario sin rol autorizado";
        syncIndicator.className = "w-2.5 h-2.5 rounded-full bg-red-500";
      } else {
        syncText.innerText = "Vista Pública (Invitado)";
        syncIndicator.className = "w-2.5 h-2.5 rounded-full bg-amber-500";
      }

      renderAuthControls({ onOpenConfig: openEventConfigModal, onResetMap: handleResetMap });
      renderAllGrids();
    }
  });
});