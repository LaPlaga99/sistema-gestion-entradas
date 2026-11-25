import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { state, calculateTotalAmount } from './firebase.js';
import { showToast } from './ui.js';

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