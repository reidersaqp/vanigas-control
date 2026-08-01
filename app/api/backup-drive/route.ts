import { NextResponse } from "next/server";

export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findOrCreateFolder(drive: any, name: string, parentId?: string) {
  const parentQuery = parentId ? ` and '${parentId}' in parents` : "";
  const existing = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQueryValue(name)}' and trashed=false${parentQuery}`,
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 1,
  });

  const foundId = existing.data.files?.[0]?.id;
  if (foundId) return foundId;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });

  if (!created.data.id) {
    throw new Error(`No se pudo crear la carpeta ${name} en Google Drive.`);
  }

  return created.data.id;
}

function appendSheet(XLSX: any, wb: any, name: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Estado: "Sin registros" }]);
  ws["!cols"] = Object.keys(rows[0] || { Estado: "" }).map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function getSaleDebtInfo(sale: any) {
  const estado = sale.estado || "confirmada";
  const total = Number(sale.total || 0);
  const qty = Number(sale.cantidad || sale.qty || 1);
  const moneyDebt = estado === "debe_pago" || estado === "debe_ambos" || estado === "pendiente"
    ? Number(sale.monto_deuda_soles !== undefined && sale.monto_deuda_soles !== null ? sale.monto_deuda_soles : total)
    : 0;
  const cylinderDebt = estado === "debe_balon" || estado === "debe_ambos"
    ? Number(sale.cant_deba_balon !== undefined && sale.cant_deba_balon !== null ? sale.cant_deba_balon : qty)
    : 0;
  const charged = Math.max(0, total - moneyDebt);
  const hasDebt = moneyDebt > 0 || cylinderDebt > 0 || estado === "pendiente";
  return { moneyDebt, cylinderDebt, charged, hasDebt };
}

function getDebtLabel(sale: any) {
  const estado = sale.estado;
  if (!estado || estado === "confirmada") return "Completo";
  if (estado === "debe_pago") return "Debe pagar";
  if (estado === "debe_balon") return "Debe balon";
  if (estado === "debe_ambos") return "Debe pago y balon";
  return "Pendiente";
}

export async function POST(req: Request) {
  try {
    const { sales, allSales, inventory, gastos, allGastos, recargas, clients, movimientos, selectedDate } = await req.json();
    const [{ google }, XLSX, { Readable }, { getAuthorizedGoogleOAuthClient }] = await Promise.all([
      import("googleapis"),
      import("xlsx"),
      import("stream"),
      import("../../../lib/google-drive-oauth"),
    ]);

    const auth = getAuthorizedGoogleOAuthClient();
    const drive = google.drive({ version: "v3", auth });
    const wb = XLSX.utils.book_new();
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().slice(0, 5).replace(":", "-");
    const yearFolderName = String(now.getFullYear());
    const monthFolderName = String(now.getMonth() + 1).padStart(2, "0");

    const baseFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || await findOrCreateFolder(drive, "VANIGAS");
    const backupsFolderId = await findOrCreateFolder(drive, "Copias de seguridad", baseFolderId);
    const yearFolderId = await findOrCreateFolder(drive, yearFolderName, backupsFolderId);
    const monthFolderId = await findOrCreateFolder(drive, monthFolderName, yearFolderId);
    const salesData = Array.isArray(allSales) && allSales.length > 0 ? allSales : (sales || []);
    const gastosData = Array.isArray(allGastos) && allGastos.length > 0 ? allGastos : (gastos || []);
    const debtSales = salesData.filter((s: any) => getSaleDebtInfo(s).hasDebt);
    const totalVendido = salesData.reduce((acc: number, s: any) => acc + Number(s.total || 0), 0);
    const totalCobrado = salesData.reduce((acc: number, s: any) => acc + getSaleDebtInfo(s).charged, 0);
    const totalPorCobrar = salesData.reduce((acc: number, s: any) => acc + getSaleDebtInfo(s).moneyDebt, 0);
    const totalEnvasesPendientes = salesData.reduce((acc: number, s: any) => acc + getSaleDebtInfo(s).cylinderDebt, 0);
    const totalGastos = gastosData.reduce((acc: number, g: any) => acc + Number(g.monto || 0), 0);
    const ventasDia = (sales || []);
    const gastosDia = (gastos || []);
    const efectivoDia = ventasDia
      .filter((s: any) => s.forma_pago === "Efectivo")
      .reduce((acc: number, s: any) => acc + getSaleDebtInfo(s).charged, 0);
    const digitalDia = ventasDia
      .filter((s: any) => s.forma_pago !== "Efectivo")
      .reduce((acc: number, s: any) => acc + getSaleDebtInfo(s).charged, 0);
    const gastosDelDia = gastosDia.reduce((acc: number, g: any) => acc + Number(g.monto || 0), 0);

    appendSheet(XLSX, wb, "Resumen", [{
      Empresa: "VANIGAS",
      "Fecha de copia": now.toLocaleString("es-PE"),
      "Fecha de trabajo": selectedDate || "",
      "Ventas registradas": salesData.length,
      "Clientes registrados": (clients || []).length,
      "Productos en inventario": (inventory || []).length,
      "Movimientos registrados": (movimientos || []).length,
      "Recargas registradas": (recargas || []).length,
      "Gastos registrados": gastosData.length,
      "Total vendido": totalVendido,
      "Cobrado real": totalCobrado,
      "Por cobrar": totalPorCobrar,
      "Envases pendientes": totalEnvasesPendientes,
      "Gastos": totalGastos,
    }]);

    appendSheet(XLSX, wb, "Ventas", salesData.map((s: any) => {
      const deuda = getSaleDebtInfo(s);
      return {
      ID: s.$id || s.id,
      Fecha: s.fecha,
      Cliente: s.cliente_nombre || s.client,
      Distrito: s.distrito || "",
      "Tipo de balon": s.tipo_balon || s.type,
      Cantidad: s.cantidad || s.qty,
      "Precio unitario": s.precio_unitario || s.price,
      "Total vendido": s.total,
      "Cobrado": deuda.charged,
      "Por cobrar": deuda.moneyDebt,
      "Envases prestados": deuda.cylinderDebt,
      "Forma de pago": s.forma_pago,
      Estado: getDebtLabel(s),
      Observacion: s.observacion || "",
      };
    }));

    appendSheet(XLSX, wb, "Deudas", debtSales.map((s: any) => {
      const deuda = getSaleDebtInfo(s);
      return {
        Fecha: s.fecha,
        Cliente: s.cliente_nombre || s.client,
        Distrito: s.distrito || "",
        "Total vendido": s.total,
        "Cobrado": deuda.charged,
        "Por cobrar": deuda.moneyDebt,
        "Envases prestados": deuda.cylinderDebt,
        "Forma de pago": s.forma_pago,
        Estado: getDebtLabel(s),
        Observacion: s.observacion || "",
      };
    }));

    appendSheet(XLSX, wb, "Caja diaria", [{
      "Fecha de trabajo": selectedDate || "",
      "Efectivo recibido": efectivoDia,
      "Digital recibido": digitalDia,
      "Gastos del dia": gastosDelDia,
      "Saldo esperado": efectivoDia - gastosDelDia,
    }]);

    appendSheet(XLSX, wb, "Inventario", (inventory || []).map((i: any) => ({
      "Tipo de balon": i.tipo_balon,
      Estado: i.estado,
      Cantidad: i.cantidad,
      "Stock minimo": i.stock_minimo ?? "",
    })));

    appendSheet(XLSX, wb, "Movimientos", (movimientos || []).map((m: any) => ({
      Fecha: m.fecha,
      "Tipo de movimiento": m.tipo_movimiento,
      "Tipo de balon": m.tipo_balon,
      "Estado del balon": m.estado_balon,
      Cantidad: m.cantidad,
      Observacion: m.observacion || "",
    })));

    appendSheet(XLSX, wb, "Gastos", gastosData.map((g: any) => ({
      Fecha: g.fecha,
      Concepto: g.concepto,
      Categoria: g.categoria,
      Monto: g.monto,
      "Forma de pago": g.forma_pago,
    })));

    appendSheet(XLSX, wb, "Recargas", (recargas || []).map((r: any) => ({
      "Fecha de envio": r.fecha_envio,
      "Tipo de balon": r.tipo_balon,
      "Balones enviados": r.cantidad_enviada,
      "Balones recibidos": r.cantidad_recibida,
      "Costo unitario": r.costo_unitario || 0,
      "Costo total": r.costo_total || ((r.cantidad_enviada || 0) * (r.costo_unitario || 0)),
      Proveedor: r.proveedor || "Planta",
      Estado: r.estado,
    })));

    appendSheet(XLSX, wb, "Clientes", (clients || []).map((c: any) => ({
      Nombre: c.nombre,
      Telefono: c.telefono,
      Direccion: c.direccion,
      "Tipo de cliente": c.tipo_cliente,
      "Precio habitual": c.precio_habitual,
    })));

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `Backup_VANIGAS_${dateStr}_${timeStr}.xlsx`;

    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [monthFolderId],
      },
      media: {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Readable.from(buffer),
      },
    });

    return NextResponse.json({
      success: true,
      fileId: response.data.id,
      filename,
      folderPath: `VANIGAS / Copias de seguridad / ${yearFolderName} / ${monthFolderName}`,
    });
  } catch (err: any) {
    console.error("API Backup Drive error:", err);
    const reason = err?.errors?.[0]?.reason || err?.cause?.errors?.[0]?.reason;
    const message = reason === "storageQuotaExceeded"
      ? "Google Drive no tiene cuota disponible para guardar el archivo."
      : err?.message || "No se pudo guardar en Google Drive.";

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
