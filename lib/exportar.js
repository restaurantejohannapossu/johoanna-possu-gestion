'use client';
import { moneda, numero, fecha } from './formato';

/**
 * columnas: [{ clave, titulo, tipo: 'texto'|'moneda'|'numero'|'fecha'|'porcentaje' }]
 * filas: arreglo de objetos
 */
function valorTexto(v, tipo) {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'moneda') return moneda(v);
  if (tipo === 'numero') return numero(v);
  if (tipo === 'porcentaje') return `${numero(v, 1)} %`;
  if (tipo === 'fecha') return fecha(v);
  return String(v);
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

const limpio = (s) => (s || 'reporte').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').toLowerCase();

export function exportarCSV(nombre, columnas, filas) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [columnas.map((c) => esc(c.titulo)).join(';')];
  for (const f of filas) lineas.push(columnas.map((c) => esc(f[c.clave])).join(';'));
  descargar(new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${limpio(nombre)}.csv`);
}

export async function exportarExcel(nombre, columnas, filas) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const encabezado = columnas.map((c) => ({ value: c.titulo, fontWeight: 'bold', backgroundColor: '#F4E9D3' }));
  const datos = filas.map((f) =>
    columnas.map((c) => {
      const v = f[c.clave];
      if (v === null || v === undefined || v === '') return null;
      if (['moneda', 'numero', 'porcentaje'].includes(c.tipo) && !isNaN(Number(v))) {
        return { value: Number(v), format: c.tipo === 'moneda' ? '"$"#,##0' : c.tipo === 'porcentaje' ? '0.0' : '#,##0.###' };
      }
      return { value: String(v) };
    })
  );
  await writeExcelFile([encabezado, ...datos], { columns: columnas.map(() => ({ width: 18 })) }).toFile(`${limpio(nombre)}.xlsx`);
}

export async function exportarPDF(titulo, columnas, filas, { subtitulo = '', empresa = 'Restaurante Johoanna Possu', horizontal } = {}) {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: horizontal ?? columnas.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(107, 30, 46); doc.rect(0, 0, ancho, 56, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('times', 'bold'); doc.setFontSize(16);
  doc.text(empresa, 40, 26);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(224, 169, 42);
  doc.text(titulo, 40, 43);
  doc.setTextColor(62, 42, 31);
  if (subtitulo) { doc.setFontSize(9); doc.text(subtitulo, 40, 74); }
  autoTable(doc, {
    startY: subtitulo ? 84 : 72,
    head: [columnas.map((c) => c.titulo)],
    body: filas.map((f) => columnas.map((c) => valorTexto(f[c.clave], c.tipo))),
    styles: { fontSize: 8, cellPadding: 4, textColor: [62, 42, 31] },
    headStyles: { fillColor: [244, 233, 211], textColor: [62, 42, 31], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 253, 248] },
    columnStyles: Object.fromEntries(columnas.map((c, i) => [i, ['moneda', 'numero', 'porcentaje'].includes(c.tipo) ? { halign: 'right' } : {}])),
    didDrawPage: () => {
      const alto = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(125, 99, 82);
      doc.text(`Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, 40, alto - 20);
      doc.text(`Página ${doc.getNumberOfPages()}`, ancho - 80, alto - 20);
    },
  });
  doc.save(`${limpio(titulo)}.pdf`);
}

export function imprimirTabla(titulo, columnas, filas, { subtitulo = '', empresa = 'Restaurante Johoanna Possu' } = {}) {
  const w = window.open('', '_blank');
  if (!w) return alert('Permite las ventanas emergentes para imprimir.');
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const derecha = (c) => (['moneda', 'numero', 'porcentaje'].includes(c.tipo) ? ' style="text-align:right"' : '');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
  <style>body{font-family:system-ui,sans-serif;color:#3e2a1f;margin:24px}h1{font-family:Georgia,serif;color:#6b1e2e;margin:0}
  h2{font-size:14px;color:#a87012;margin:4px 0 12px}table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#f4e9d3;text-align:left;padding:5px}td{border-bottom:1px solid #eee;padding:4px 5px}</style></head><body>
  <h1>${esc(empresa)}</h1><h2>${esc(titulo)} ${subtitulo ? '· ' + esc(subtitulo) : ''}</h2>
  <table><thead><tr>${columnas.map((c) => `<th${derecha(c)}>${esc(c.titulo)}</th>`).join('')}</tr></thead>
  <tbody>${filas.map((f) => `<tr>${columnas.map((c) => `<td${derecha(c)}>${esc(valorTexto(f[c.clave], c.tipo))}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}
