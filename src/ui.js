import { createIcons, icons } from 'lucide';
import { state, calculateTotalAmount, deleteIntegrantAndSeats, logoutUser } from './firebase.js';
// Al inicio de src/ui.js:
import { downloadJSONBackup, triggerJSONRestore } from './reports.js';

export const refreshIcons = () => createIcons({ icons });

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const styles = {
    success: { border: 'border-emerald-500/60', bg: 'bg-slate-900/95', icon: 'check-circle-2', iconColor: 'text-emerald-400' },
    warning: { border: 'border-amber-500/60', bg: 'bg-slate-900/95', icon: 'alert-circle', iconColor: 'text-amber-400' },
    error:   { border: 'border-rose-500/60', bg: 'bg-slate-900/95', icon: 'x-circle', iconColor: 'text-rose-400' },
    info:    { border: 'border-sky-500/60', bg: 'bg-slate-900/95', icon: 'info', iconColor: 'text-sky-400' }
  };

  const cfg = styles[type] || styles.info;
  const toast = document.createElement('div');
  toast.className = `toast-enter pointer-events-auto flex items-center gap-3 ${cfg.bg} border ${cfg.border} text-slate-100 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md text-xs font-medium`;
  toast.innerHTML = `
    <i data-lucide="${cfg.icon}" class="w-4 h-4 ${cfg.iconColor} shrink-0"></i>
    <span class="flex-1 leading-snug">${message}</span>
  `;

  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3600);
}

export function showConfirmModal(title, message, acceptLabel = 'Confirmar') {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-title').innerText = title;
    document.getElementById('confirm-modal-message').innerText = message;
    const btnAccept = document.getElementById('confirm-modal-accept');
    const btnCancel = document.getElementById('confirm-modal-cancel');
    btnAccept.innerText = acceptLabel;

    modal.classList.remove('hidden');
    refreshIcons();

    const cleanup = (result) => {
      modal.classList.add('hidden');
      btnAccept.removeEventListener('click', onAccept);
      btnCancel.removeEventListener('click', onCancel);
      resolve(result);
    };

    const onAccept = () => cleanup(true);
    const onCancel = () => cleanup(false);

    btnAccept.addEventListener('click', onAccept);
    btnCancel.addEventListener('click', onCancel);
  });
}

export function applyEventConfigToUI() {
  const cfg = state.eventConfig;
  document.title = `${cfg.mapHeading} - ${cfg.title}`;
  document.getElementById('header-event-title').innerText = cfg.title;
  document.getElementById('map-heading-text').innerText = cfg.mapHeading;
  document.getElementById('map-subtitle-text').innerText = cfg.subtitle;
  document.getElementById('stage-label-text').innerText = cfg.stageLabel;

  const orderedKeys = ['grid-platinum', 'grid-vip-a', 'grid-vip-b', 'grid-gen-a', 'grid-gen-b', 'grid-gen-c'];
  const filterZoneSelect = document.getElementById('filter-zone');
  const currentZoneFilter = filterZoneSelect.value || 'ALL';
  filterZoneSelect.innerHTML = '<option value="ALL">Todas las zonas</option>';

  orderedKeys.forEach(gridId => {
    const z = cfg.zones[gridId];
    if (!z) return;

    const labelEl = document.getElementById(`label-${gridId}`);
    const tagEl = document.getElementById(`tag-${gridId}`);
    if (labelEl) labelEl.innerText = `${z.name} S/${z.price}`;
    if (tagEl) {
      if (z.tag && z.tag.trim() !== '') {
        tagEl.innerText = z.tag;
        tagEl.classList.remove('hidden');
      } else {
        tagEl.classList.add('hidden');
      }
    }

    const opt = document.createElement('option');
    opt.value = z.name;
    opt.innerText = `${z.name} (S/ ${z.price})`;
    filterZoneSelect.appendChild(opt);
  });

  filterZoneSelect.value = Array.from(filterZoneSelect.options).some(o => o.value === currentZoneFilter)
    ? currentZoneFilter : 'ALL';
}

export function updateOperatorSeatsDisplay() {
  const display = document.getElementById('op-selected-seats-display');
  if (!display) return;
  const sorted = Array.from(state.operatorSelectedSeats).sort((a, b) => a - b);
  display.value = sorted.length > 0 ? sorted.map(s => `#${s}`).join(', ') : '';
}

export function renderAllGrids() {
  const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
  const zoneFilter = document.getElementById('filter-zone').value || 'ALL';
  const statusFilter = document.getElementById('filter-status').value || 'all';
  const isStaff = (state.currentUserRole === 'admin' || state.currentUserRole === 'operator');

  for (const [gridId, zone] of Object.entries(state.eventConfig.zones)) {
    const container = document.getElementById(gridId);
    const parentContainer = document.getElementById(zone.containerId);
    if (!container || !parentContainer) continue;

    if (zoneFilter !== 'ALL' && zone.name !== zoneFilter) {
      parentContainer.style.display = 'none';
      continue;
    } else {
      parentContainer.style.display = 'flex';
    }

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let i = zone.start; i <= zone.end; i++) {
      const rawSeatInfo = state.seatsData[i];
      let status = 'disponible';
      let seatOwner = '';

      if (rawSeatInfo) {
        if (!isStaff && rawSeatInfo.status === 'asignado') {
          status = 'disponible';
        } else {
          status = rawSeatInfo.status || 'disponible';
          seatOwner = isStaff ? (rawSeatInfo.clientName || '').toLowerCase() : '';
        }
      }

      if (statusFilter !== 'all' && status !== statusFilter) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerText = i;

      if (searchTerm) {
        const matchesSeatNum = i.toString().includes(searchTerm);
        const matchesOwner = isStaff && seatOwner.includes(searchTerm);
        btn.style.opacity = (matchesSeatNum || matchesOwner) ? '1' : '0.15';
      } else {
        btn.style.opacity = '1';
      }

      let colorClasses = '';
      if (state.highlightedIntegrantSeats.has(i)) {
        colorClasses = 'seat-highlighted';
      } else if (state.operatorSelectedSeats.has(i)) {
        colorClasses = 'seat-selected';
      } else if (status === 'reservado') {
        colorClasses = 'seat-reserved';
        if (!isStaff) btn.classList.add('cursor-not-allowed');
      } else if (status === 'asignado') {
        colorClasses = 'seat-assigned';
      } else {
        colorClasses = (gridId === 'grid-platinum') ? 'seat-platinum' : 'seat-available';
      }

      btn.title = (isStaff && rawSeatInfo?.clientName)
        ? `Butaca #${i} (${zone.name} - S/ ${zone.price}) | ${status.toUpperCase()}: ${rawSeatInfo.clientName}`
        : `Butaca #${i} | ${zone.name} (S/ ${zone.price}) - ${status === 'reservado' ? 'Ocupada' : 'Disponible'}`;

      btn.className = `seat-btn ${colorClasses}`;

      btn.addEventListener('click', () => {
        if (isStaff) {
          if (status !== 'disponible' && !state.operatorSelectedSeats.has(i)) {
            const ownerLabel = rawSeatInfo?.clientName ? ` a ${rawSeatInfo.clientName}` : '';
            showToast(`La butaca #${i} ya está ${status}${ownerLabel}.`, 'warning');
            return;
          }
          if (state.operatorSelectedSeats.has(i)) {
            state.operatorSelectedSeats.delete(i);
          } else {
            state.operatorSelectedSeats.add(i);
          }
          updateOperatorSeatsDisplay();
          renderAllGrids();
        } else {
          if (status === 'reservado') {
            showToast(`La butaca #${i} (${zone.name}) ya se encuentra ocupada.`, 'warning');
          } else {
            showToast(`Butaca #${i} (${zone.name} - S/ ${zone.price}.00) disponible en taquilla.`, 'info');
          }
        }
      });
      fragment.appendChild(btn);
    }
    container.appendChild(fragment);
  }
}

export function renderIntegrantsList(onStartEdit) {
  const container = document.getElementById('integrants-list-container');
  if (!container) return;

  const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
  const filtered = state.integrantsList.filter(item => {
    if (!searchTerm) return true;
    return item.name.toLowerCase().includes(searchTerm) ||
           (item.dni && item.dni.toLowerCase().includes(searchTerm)) ||
           (item.seats || []).some(s => s.toString().includes(searchTerm));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 italic">No se encontraron integrantes.</p>`;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(item => {
    const seats = item.seats || [];
    const seatsText = seats.length > 0 ? seats.map(s => `#${s}`).join(', ') : 'Ninguno';
    const totalAmount = calculateTotalAmount(seats);
    const isHighlighted = state.currentHighlightedIntegrantId === item.id;
    const seatStatusBadge = item.seatStatus === 'reservado'
      ? '<span class="text-amber-400 font-bold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-600/40">Reservado (Pagado)</span>'
      : '<span class="text-sky-300 font-bold bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-600/40">Asignado</span>';

    const card = document.createElement('div');
    card.className = `p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs border transition cursor-pointer ${isHighlighted ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500' : 'bg-slate-950/90 border-amber-600/30 hover:border-amber-500'}`;
    card.innerHTML = `
      <div class="flex items-center gap-3 flex-1">
        <div class="bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded-md text-xs font-cinzel">${item.name}</div>
        <div>
          <div class="text-slate-300">DNI: <span class="font-semibold text-white">${item.dni || 'N/A'}</span> | Estado: ${seatStatusBadge}</div>
          <div class="text-[10px] text-amber-300 font-bold mt-0.5">Butacas: ${seatsText} | <span class="text-emerald-400">Monto: S/ ${totalAmount}.00</span></div>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn-edit-integrant bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-700 px-2 py-1 rounded-md text-[11px] transition flex items-center gap-1"><i data-lucide="edit-3" class="w-3 h-3"></i> Editar</button>
        <button class="btn-highlight px-2.5 py-1 rounded-md text-[11px] border transition ${isHighlighted ? 'bg-amber-600 text-slate-950 font-bold border-amber-400' : 'bg-amber-950/80 text-amber-200 border-amber-700'}">${isHighlighted ? 'Ocultar' : 'Ver en Mapa'}</button>
        <button class="btn-delete-integrant bg-rose-950/60 hover:bg-rose-900 text-rose-300 px-2 py-1 rounded-md text-[11px] transition"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
      </div>
    `;

    card.querySelector('.btn-edit-integrant').addEventListener('click', (e) => {
      e.stopPropagation();
      onStartEdit(item);
    });

    card.querySelector('.btn-highlight').addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.currentHighlightedIntegrantId === item.id) {
        state.currentHighlightedIntegrantId = null;
        state.highlightedIntegrantSeats.clear();
      } else {
        state.currentHighlightedIntegrantId = item.id;
        state.highlightedIntegrantSeats = new Set(seats);
      }
      renderIntegrantsList(onStartEdit);
      renderAllGrids();
    });

    card.querySelector('.btn-delete-integrant').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirmModal(
        'Eliminar Integrante',
        `¿Deseas eliminar a ${item.name} y liberar sus ${seats.length} butaca(s) asignadas?`,
        'Sí, Eliminar'
      );
      if (confirmed) {
        try {
          await deleteIntegrantAndSeats(item);
          if (state.currentHighlightedIntegrantId === item.id) {
            state.currentHighlightedIntegrantId = null;
            state.highlightedIntegrantSeats.clear();
          }
          showToast(`Registro de ${item.name} eliminado correctamente.`, 'success');
        } catch {
          showToast("Error de permisos o conexión al eliminar.", 'error');
        }
      }
    });

    container.appendChild(card);
  });
  refreshIcons();
}

export function updateKPIs() {
  let totalSeats = 0, potentialRevenue = 0;
  let available = 0, assigned = 0, reserved = 0, val = 0;

  for (const zone of Object.values(state.eventConfig.zones)) {
    for (let i = zone.start; i <= zone.end; i++) {
      totalSeats++;
      const price = Number(zone.price || 0);
      potentialRevenue += price;

      const seat = state.seatsData[i] || { status: 'disponible' };
      if (seat.status === 'reservado') {
        reserved++;
        val += price;
      } else if (seat.status === 'asignado') {
        assigned++;
      } else {
        available++;
      }
    }
  }

  document.getElementById('kpi-total').innerText = totalSeats;
  document.getElementById('kpi-available').innerText = available;
  document.getElementById('kpi-assigned-sub').innerText = `${assigned} asignados pendientes`;
  document.getElementById('kpi-reserved').innerText = reserved;
  document.getElementById('kpi-reserved-val').innerText = `S/ ${val.toLocaleString('es-PE')} recaudados`;
  document.getElementById('kpi-potential').innerText = `S/ ${potentialRevenue.toLocaleString('es-PE')}`;
}

export function renderAuthControls({ onOpenConfig, onResetMap }) {
  const dynamicAdminContainer = document.getElementById('dynamic-admin-actions');
  const authButtonsContainer = document.getElementById('auth-buttons-container');
  const operatorSection = document.getElementById('operator-integrants-section');
  const kpiSection = document.getElementById('kpi-section');
  const staffLegends = document.querySelectorAll('.staff-only-legend, .staff-only-option');

  dynamicAdminContainer.innerHTML = '';
  authButtonsContainer.innerHTML = '';

  if (state.currentUserRole === 'admin' || state.currentUserRole === 'operator') {
    operatorSection.classList.remove('hidden');
    kpiSection.classList.remove('hidden');
    staffLegends.forEach(el => el.classList.remove('hidden'));

    if (state.currentUserRole === 'admin') {
      const btnConfig = document.createElement('button');
      btnConfig.className = 'flex items-center gap-2 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg border border-indigo-700/60 transition';
      btnConfig.innerHTML = `<i data-lucide="sliders" class="w-4 h-4"></i><span class="hidden sm:inline">Configurar Evento</span>`;
      btnConfig.addEventListener('click', onOpenConfig);
      dynamicAdminContainer.appendChild(btnConfig);

      const btnReset = document.createElement('button');
      btnReset.className = 'flex items-center gap-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg border border-rose-800/60 transition';
      btnReset.innerHTML = `<i data-lucide="rotate-ccw" class="w-4 h-4"></i><span class="hidden sm:inline">Reiniciar Mapa</span>`;
      btnReset.addEventListener('click', onResetMap);
      dynamicAdminContainer.appendChild(btnReset);

      // Dentro de renderAuthControls, en if (state.currentUserRole === 'admin'):
      const btnBackup = document.createElement('button');
      btnBackup.className = 'flex items-center gap-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg border border-emerald-700/60 transition';
      btnBackup.title = 'Descargar copia de seguridad completa en JSON';
      btnBackup.innerHTML = `<i data-lucide="database-backup" class="w-4 h-4"></i><span class="hidden xl:inline">Backup</span>`;
      btnBackup.addEventListener('click', downloadJSONBackup);
      dynamicAdminContainer.appendChild(btnBackup);

      const btnRestore = document.createElement('button');
      btnRestore.className = 'flex items-center gap-1.5 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg border border-amber-700/60 transition';
      btnRestore.title = 'Restaurar estado desde un archivo JSON';
      btnRestore.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i><span class="hidden xl:inline">Restaurar</span>`;
      btnRestore.addEventListener('click', triggerJSONRestore);
      dynamicAdminContainer.appendChild(btnRestore);
    }

    const btnLogout = document.createElement('button');
    btnLogout.className = 'flex items-center gap-2 bg-slate-800 hover:bg-red-900/50 text-slate-300 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg border border-slate-700 transition';
    btnLogout.innerHTML = `<i data-lucide="log-out" class="w-4 h-4"></i><span>Salir</span>`;
    btnLogout.addEventListener('click', async () => {
      await logoutUser();
      showToast('Sesión cerrada correctamente.', 'info');
    });
    authButtonsContainer.appendChild(btnLogout);
  } else {
    operatorSection.classList.add('hidden');
    kpiSection.classList.add('hidden');
    staffLegends.forEach(el => el.classList.add('hidden'));

    const btnLogin = document.createElement('button');
    btnLogin.className = 'flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm px-3 py-2 rounded-lg shadow-lg transition font-cinzel';
    btnLogin.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4"></i><span>Acceso Autorizado</span>`;
    btnLogin.addEventListener('click', () => {
      document.getElementById('login-modal').classList.remove('hidden');
    });
    authButtonsContainer.appendChild(btnLogin);
  }
  refreshIcons();
}