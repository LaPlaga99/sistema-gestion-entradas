import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { state, calculateTotalAmount } from './firebase.js';
import { showToast } from './ui.js';
// Asegúrate de incluir restoreDatabaseBackup en la importación de firebase.js:
import { state, calculateTotalAmount, restoreDatabaseBackup } from './firebase.js';
import { showToast, showConfirmModal } from './ui.js';

export function exportIntegrantsCSV() {
  const headers = ["Nombre", "DNI", "Estado", "Asientos", "Monto_Total"];
  const rows = [headers];
  state.integrantsList.forEach(item => {
    rows.push([
      `"${item.name}"`,
      `"${item.dni || ''}"`,
      `"${item.seatStatus || 'asignado'}"`,
      `"${(item.seats || []).join(', ')}"`,
      calculateTotalAmount(item.seats)
    ]);
  });
  const csvContent = "\uFEFF" + rows.map(e => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "integrantes_asientos.csv";
  link.click();
  showToast("Archivo CSV exportado.", 'success');
}

export function downloadPDFReport() {
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(180, 83, 9);
  doc.text(state.eventConfig.subtitle || state.eventConfig.title.toUpperCase(), 14, 20);

  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text("Reporte Oficial de Asignación de Integrantes y Butacas", 14, 28);

  const tableData = state.integrantsList.map(item => [
    item.name,
    item.dni || 'N/A',
    (item.seatStatus || 'asignado').toUpperCase(),
    (item.seats || []).map(s => `#${s}`).join(', '),
    `S/ ${calculateTotalAmount(item.seats)}.00`
  ]);

  autoTable(doc, {
    startY: 35,
    head: [['Integrante', 'DNI / Contacto', 'Estado', 'Asientos Asignados', 'Monto Total']],
    body: tableData,
    headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 4 },
    alternateRowStyles: { fillColor: [245, 247, 250] }
  });

  doc.save("reporte_integrantes_evento.pdf");
  showToast("Reporte PDF generado.", 'success');
}

export function downloadMapPNG() {
  showToast("Generando imagen del mapa...", 'info');
  html2canvas(document.getElementById('full-map-container'), { scale: 2, backgroundColor: '#020617' }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'mapa_asientos_evento.png';
    link.href = canvas.toDataURL();
    link.click();
    showToast("Mapa descargado en PNG.", 'success');
  });
}

// ... (mantén tus funciones exportIntegrantsCSV, downloadPDFReport y downloadMapPNG intactas) ...

export function downloadJSONBackup() {
  const backupPayload = {
    version: '4.0',
    exportedAt: new Date().toISOString(),
    eventConfig: state.eventConfig,
    seats: state.seatsData,
    integrants: state.integrantsList
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const link = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  link.href = URL.createObjectURL(blob);
  link.download = `backup_evento_${dateTag}.json`;
  link.click();
  URL.revokeObjectURL(link.href);

  showToast('Respaldo JSON descargado correctamente.', 'success');
}

export function triggerJSONRestore() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const totalSeats = Object.keys(parsed.seats || {}).length;
      const totalIntegrants = Array.isArray(parsed.integrants) ? parsed.integrants.length : 0;

      const confirmed = await showConfirmModal(
        'Restaurar Respaldo JSON',
        `Se sobrescribirá la base de datos actual con este respaldo (${totalSeats} butacas ocupadas y ${totalIntegrants} integrantes). ¿Continuar?`,
        'Sí, Restaurar Ahora'
      );

      if (!confirmed) return;

      showToast('Restaurando base de datos...', 'info');
      await restoreDatabaseBackup(parsed);
      showToast('¡Base de datos restaurada con éxito!', 'success');
    } catch (err) {
      console.error('Error al restaurar backup:', err);
      showToast(err.message || 'Archivo JSON inválido o error de permisos.', 'error');
    }
  });

  input.click();
}