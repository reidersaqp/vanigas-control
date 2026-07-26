// Helper utility for generating CSV/Excel files and Printable PDF Reports for VANIGAS

export function exportToCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) {
    alert("No hay datos disponibles para exportar.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map(row => headers.map(header => {
      const val = row[header] ?? "";
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(","))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printPDFReport(title: string, summary: { label: string; value: string }[], tableHeaders: string[], tableData: (string | number)[][]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Por favor permita las ventanas emergentes para generar el reporte PDF.");
    return;
  }

  const dateStr = new Date().toLocaleDateString("es-PE", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>${title} - VANIGAS</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 30px; color: #152b3a; background: #fff; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d2638; padding-bottom: 16px; margin-bottom: 24px; }
        .brand b { font-size: 26px; letter-spacing: 2px; color: #0d2638; }
        .brand p { margin: 2px 0 0; font-size: 13px; color: #52636e; }
        .date { text-align: right; font-size: 12px; color: #627480; }
        h1 { font-size: 22px; margin: 0 0 16px; color: #0d2638; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .summary-box { background: #f4f7f8; border: 1px solid #dce5e8; border-radius: 8px; padding: 12px; }
        .summary-box span { font-size: 11px; color: #627480; display: block; font-weight: 600; }
        .summary-box strong { font-size: 18px; color: #16867a; margin-top: 4px; display: block; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
        th { background: #0d2638; color: #fff; text-align: left; padding: 10px 12px; font-size: 12px; }
        td { padding: 10px 12px; border-bottom: 1px solid #e1e8eb; }
        tr:nth-child(even) { background: #f9fbfe; }
        .footer { margin-top: 40px; font-size: 11px; color: #7f919d; text-align: center; border-top: 1px solid #e1e8eb; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">
          <b>VANIGAS</b>
          <p>Distribuidora de Gas - Sistema Integrado</p>
        </div>
        <div class="date">${dateStr}</div>
      </div>

      <h1>${title}</h1>

      ${summary.length > 0 ? `
        <div class="summary-grid">
          ${summary.map(s => `
            <div class="summary-box">
              <span>${s.label}</span>
              <strong>${s.value}</strong>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${tableHeaders.length > 0 ? `
        <table>
          <thead>
            <tr>${tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${tableData.map(row => `
              <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p>No hay datos para mostrar en este período.</p>'}

      <div class="footer">
        Reporte generado automáticamente por el Sistema Integrado VANIGAS · Documento oficial de control interno
      </div>

      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
