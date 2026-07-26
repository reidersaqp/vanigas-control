import { NextResponse } from "next/server";
import { google } from "googleapis";
import * as XLSX from "xlsx";
import { Readable } from "stream";
import { getAuthorizedGoogleOAuthClient } from "../../../lib/google-drive-oauth";

export const runtime = "nodejs";

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findOrCreateFolder(drive: ReturnType<typeof google.drive>, name: string, parentId?: string) {
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

function appendSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Estado: "Sin registros" }]);
  ws["!cols"] = Object.keys(rows[0] || { Estado: "" }).map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

export async function POST(req: Request) {
  try {
    const { sales, inventory, gastos, recargas, clients, movimientos } = await req.json();
    const auth = getAuthorizedGoogleOAuthClient();
    const drive = google.drive({ version: "v3", auth });
    const wb = XLSX.utils.book_new();
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().slice(0, 5).replace(":", "-");
    const yearFolderName = String(now.getFullYear());
    const monthFolderName = "meses";

    const baseFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || await findOrCreateFolder(drive, "VANIGAS");
    const backupsFolderId = await findOrCreateFolder(drive, "Copias de seguridad", baseFolderId);
    const yearFolderId = await findOrCreateFolder(drive, yearFolderName, backupsFolderId);
    const monthFolderId = await findOrCreateFolder(drive, monthFolderName, yearFolderId);

    appendSheet(wb, "Resumen", [{
      "Empresa": "VANIGAS",
      "Fecha de copia": now.toLocaleString("es-PE"),
      "Ventas registradas": (sales || []).length,
      "Clientes registrados": (clients || []).length,
      "Productos en inventario": (inventory || []).length,
      "Movimientos registrados": (movimientos || []).length,
      "Recargas registradas": (recargas || []).length,
      "Gastos registrados": (gastos || []).length,
    }]);

    const salesData = (sales || []).map((s: any) => ({
      ID: s.$id || s.id,
      Fecha: s.fecha,
      Hora: s.time,
      Cliente: s.cliente_nombre || s.client,
      "Tipo de balón": s.tipo_balon || s.type,
      Cantidad: s.cantidad || s.qty,
      "Precio unitario": s.precio_unitario || s.price,
      "Total vendido": s.total,
      "Forma de pago": s.forma_pago,
      "Estado": s.estado || "confirmada",
    }));
    appendSheet(wb, "Ventas", salesData);

    const invData = (inventory || []).map((i: any) => ({
      "Tipo de balón": i.tipo_balon,
      Estado: i.estado,
      Cantidad: i.cantidad,
      "Stock mínimo": i.stock_minimo ?? "",
    }));
    appendSheet(wb, "Inventario", invData);

    const movimientosData = (movimientos || []).map((m: any) => ({
      Fecha: m.fecha,
      "Tipo de movimiento": m.tipo_movimiento,
      "Tipo de balón": m.tipo_balon,
      "Estado del balón": m.estado_balon,
      Cantidad: m.cantidad,
      Observación: m.observacion || "",
    }));
    appendSheet(wb, "Movimientos", movimientosData);

    const gastosData = (gastos || []).map((g: any) => ({
      Fecha: g.fecha,
      Concepto: g.concepto,
      Categoría: g.categoria,
      Monto: g.monto,
      "Forma de pago": g.forma_pago,
    }));
    appendSheet(wb, "Gastos", gastosData);

    const recargasData = (recargas || []).map((r: any) => ({
      "Fecha de envío": r.fecha_envio,
      "Tipo de balón": r.tipo_balon,
      "Balones enviados": r.cantidad_enviada,
      "Balones recibidos": r.cantidad_recibida,
      Estado: r.estado
    }));
    appendSheet(wb, "Recargas", recargasData);

    const clientsData = (clients || []).map((c: any) => ({
      Nombre: c.nombre,
      Teléfono: c.telefono,
      Dirección: c.direccion,
      "Tipo de cliente": c.tipo_cliente,
      "Precio habitual": c.precio_habitual,
    }));
    appendSheet(wb, "Clientes", clientsData);

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `Backup_VANIGAS_${dateStr}_${timeStr}.xlsx`;

    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [monthFolderId]
      },
      media: {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Readable.from(buffer)
      }
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
      ? "El JSON actual es de una cuenta de servicio. Google Drive no permite guardar en Mi unidad con ese tipo de cuenta porque no tiene cuota. Para Drive personal gratis se necesita OAuth con tu cuenta de Google."
      : err.message;

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
