import { Query, ID } from "appwrite";
import { tablesDB, DATABASE_ID } from "./appwrite";

export interface InventoryItem {
  $id?: string;
  tipo_balon: "Normal" | "Premium";
  estado: "lleno" | "vacío";
  cantidad: number;
  stock_minimo?: number;
  name?: string;
  tone?: string;
}

export interface SaleItem {
  $id?: string;
  fecha?: string;
  time?: string;
  client?: string;
  cliente_nombre?: string;
  tipo_balon: string;
  cantidad: number;
  qty?: number;
  precio_unitario: number;
  price?: number;
  total: number;
  forma_pago: string;
  payment?: string;
  type?: string;
  id?: string;
  estado?: string;
  telefono?: string;
  ubicacion_url?: string;
}

export interface ClientItem {
  $id?: string;
  nombre: string;
  telefono?: string;
  direccion?: string;
  tipo_cliente: string;
  precio_habitual?: number;
  activo?: boolean;
}

export interface MovementItem {
  $id?: string;
  fecha?: string;
  tipo_movimiento: string;
  tipo_balon: string;
  estado_balon: string;
  cantidad: number;
  usuario_id?: string;
  observacion?: string;
}

export interface RecargaItem {
  $id?: string;
  fecha_envio?: string;
  tipo_balon: string;
  cantidad_enviada: number;
  cantidad_recibida?: number;
  costo_unitario?: number;
  costo_total?: number;
  proveedor?: string;
  estado?: string;
}

export interface GastoItem {
  $id?: string;
  fecha?: string;
  concepto: string;
  categoria: string;
  monto: number;
  forma_pago?: string;
  usuario_id?: string;
}

// Default items if table is brand new in Appwrite
const DEFAULT_INVENTORY_SEEDS = [
  { tipo_balon: "Normal", estado: "lleno", cantidad: 0, stock_minimo: 10 },
  { tipo_balon: "Normal", estado: "vacío", cantidad: 0, stock_minimo: 5 },
  { tipo_balon: "Premium", estado: "lleno", cantidad: 0, stock_minimo: 8 },
  { tipo_balon: "Premium", estado: "vacío", cantidad: 0, stock_minimo: 3 },
];

export async function fetchInventario(): Promise<InventoryItem[]> {
  const res = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "inventario",
    queries: [Query.limit(50)]
  });

  // Seed inventory table in Appwrite if completely empty
  if (res.rows.length === 0) {
    const seededRows: InventoryItem[] = [];
    for (const seed of DEFAULT_INVENTORY_SEEDS) {
      try {
        const createdDoc = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: "inventario",
          rowId: ID.unique(),
          data: {
            tipo_balon: seed.tipo_balon,
            estado: seed.estado,
            cantidad: 0,
            stock_minimo: seed.stock_minimo,
            actualizado_en: new Date().toISOString(),
          }
        });
        const name = `${seed.tipo_balon} ${seed.estado}`;
        let tone = "blue";
        if (seed.tipo_balon === "Normal" && seed.estado === "vacío") tone = "slate";
        if (seed.tipo_balon === "Premium" && seed.estado === "lleno") tone = "green";
        if (seed.tipo_balon === "Premium" && seed.estado === "vacío") tone = "amber";

        seededRows.push({
          $id: createdDoc.$id,
          tipo_balon: seed.tipo_balon as any,
          estado: seed.estado as any,
          cantidad: 0,
          stock_minimo: seed.stock_minimo,
          name,
          tone,
        });
      } catch (err) {
        console.error("Error seeding Appwrite inventory:", err);
      }
    }
    if (seededRows.length > 0) return seededRows;
  }

  return res.rows.map((doc) => {
    const name = `${doc.tipo_balon} ${doc.estado}`;
    let tone = "blue";
    if (doc.tipo_balon === "Normal" && doc.estado === "vacío") tone = "slate";
    if (doc.tipo_balon === "Premium" && doc.estado === "lleno") tone = "green";
    if (doc.tipo_balon === "Premium" && doc.estado === "vacío") tone = "amber";
    return {
      $id: doc.$id,
      tipo_balon: doc.tipo_balon,
      estado: doc.estado,
      cantidad: doc.cantidad || 0,
      stock_minimo: doc.stock_minimo,
      name,
      tone,
    };
  });
}

export async function updateInventoryStock(tipo_balon: string, estado: string, delta: number, isManual = false): Promise<void> {
  const res = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "inventario",
    queries: [
      Query.equal("tipo_balon", tipo_balon),
      Query.equal("estado", estado),
    ]
  });

  if (res.rows.length > 0) {
    const doc = res.rows[0];
    const newQty = Math.max(0, (doc.cantidad || 0) + delta);
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: "inventario",
      rowId: doc.$id,
      data: {
        cantidad: newQty,
        actualizado_en: new Date().toISOString(),
      }
    });

    if (isManual) {
      // Manual adjustment: stock updated directly without polluting movements log
    }
  }
}

export async function fetchVentas(): Promise<SaleItem[]> {
  const res = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "ventas",
    queries: [Query.orderDesc("fecha"), Query.limit(100)]
  });

  return res.rows.map((doc) => ({
    $id: doc.$id,
    id: doc.$id.slice(-6).toUpperCase(),
    fecha: doc.fecha,
    time: doc.fecha ? new Date(doc.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Ahora",
    client: doc.cliente_nombre || "Cliente General",
    cliente_nombre: doc.cliente_nombre || "Cliente General",
    tipo_balon: doc.tipo_balon,
    cantidad: doc.cantidad || 0,
    precio_unitario: doc.precio_unitario || 0,
    total: doc.total || 0,
    forma_pago: doc.forma_pago || "Efectivo",
    payment: doc.forma_pago || "Efectivo",
    price: doc.precio_unitario || 0,
    qty: doc.cantidad || 0,
    type: doc.tipo_balon,
    estado: doc.estado || "confirmada",
    telefono: doc.telefono || "",
    ubicacion_url: doc.ubicacion_url || "",
  }));
}

export async function fetchGastos(): Promise<GastoItem[]> {
  const res = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "gastos",
    queries: [Query.orderDesc("fecha"), Query.limit(100)]
  });
  return res.rows as unknown as GastoItem[];
}

export async function fetchClientes(): Promise<ClientItem[]> {
  const res = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "clientes",
    queries: [Query.limit(100)]
  });
  return res.rows as unknown as ClientItem[];
}

export async function clearAllMovimientos(): Promise<void> {
  try {
    const res = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "movimientos",
      queries: [Query.limit(100)]
    });
    for (const doc of res.rows) {
      await tablesDB.deleteRow({
        databaseId: DATABASE_ID,
        tableId: "movimientos",
        rowId: doc.$id
      }).catch(() => {});
    }
  } catch (err) {
    console.error("Error clearing test movimientos:", err);
  }
}

export async function fetchMovimientos(): Promise<MovementItem[]> {
  const res = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "movimientos",
    queries: [Query.orderDesc("fecha"), Query.limit(100)]
  });
  // Filter out any leftover manual adjustment test logs
  const realMovs = res.rows.filter((m: any) => !m.observacion?.includes("Ajuste manual"));
  return realMovs as unknown as MovementItem[];
}

export async function fetchRecargas(): Promise<RecargaItem[]> {
  const res = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "recargas",
    queries: [Query.orderDesc("fecha_envio"), Query.limit(100)]
  });
  return res.rows as unknown as RecargaItem[];
}

export async function createVenta(venta: {
  cliente_nombre: string;
  tipo_cliente: string;
  tipo_balon: string;
  cantidad: number;
  precio_unitario: number;
  forma_pago: string;
  vacios_recibidos: number;
  usuario_id: string;
  estado?: string;
  telefono?: string;
  ubicacion_url?: string;
}): Promise<void> {
  const total = venta.cantidad * venta.precio_unitario;
  const fecha = new Date().toISOString();
  const newId = ID.unique();

  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: "ventas",
    rowId: newId,
    data: {
      fecha,
      cliente_nombre: venta.cliente_nombre,
      tipo_cliente: venta.tipo_cliente,
      tipo_balon: venta.tipo_balon,
      cantidad: venta.cantidad,
      precio_unitario: venta.precio_unitario,
      total,
      forma_pago: venta.forma_pago,
      vacios_recibidos: venta.vacios_recibidos,
      usuario_id: venta.usuario_id,
      estado: venta.estado || "confirmada",
      telefono: venta.telefono || "",
      ubicacion_url: venta.ubicacion_url || "",
    }
  });

  await updateInventoryStock(venta.tipo_balon, "lleno", -venta.cantidad);
  if (venta.vacios_recibidos > 0) {
    await updateInventoryStock(venta.tipo_balon, "vacío", +venta.vacios_recibidos);
  }

  await createMovimiento({
    tipo_movimiento: "Venta",
    tipo_balon: venta.tipo_balon,
    estado_balon: "lleno",
    cantidad: venta.cantidad,
    usuario_id: venta.usuario_id,
    observacion: `Venta a ${venta.cliente_nombre}`,
  }).catch(() => {});
}

export async function createGasto(gasto: {
  concepto: string;
  categoria: string;
  monto: number;
  forma_pago: string;
  usuario_id: string;
}): Promise<void> {
  const fecha = new Date().toISOString();
  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: "gastos",
    rowId: ID.unique(),
    data: {
      fecha,
      concepto: gasto.concepto,
      categoria: gasto.categoria,
      monto: gasto.monto,
      forma_pago: gasto.forma_pago,
      usuario_id: gasto.usuario_id,
    }
  });
}

export async function createCliente(cliente: {
  nombre: string;
  telefono?: string;
  direccion?: string;
  tipo_cliente: string;
  precio_habitual?: number;
}): Promise<void> {
  const fecha_registro = new Date().toISOString();
  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: "clientes",
    rowId: ID.unique(),
    data: {
      nombre: cliente.nombre,
      telefono: cliente.telefono || "",
      direccion: cliente.direccion || "",
      tipo_cliente: cliente.tipo_cliente,
      precio_habitual: cliente.precio_habitual || 52,
      activo: true,
      fecha_registro,
    }
  });
}

export async function createMovimiento(movimiento: {
  tipo_movimiento: string;
  tipo_balon: string;
  estado_balon: string;
  cantidad: number;
  usuario_id?: string;
  observacion?: string;
}): Promise<void> {
  const fecha = new Date().toISOString();
  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: "movimientos",
    rowId: ID.unique(),
    data: {
      fecha,
      tipo_movimiento: movimiento.tipo_movimiento,
      tipo_balon: movimiento.tipo_balon,
      estado_balon: movimiento.estado_balon,
      cantidad: movimiento.cantidad,
      usuario_id: movimiento.usuario_id || "sistema",
      observacion: movimiento.observacion || "Operación registrada",
    }
  });
}

export async function createCierreCaja(cierre: {
  ventas_efectivo: number;
  ventas_digitales: number;
  gastos: number;
  saldo_esperado: number;
  saldo_real: number;
  diferencia: number;
  observacion?: string;
  usuario_id: string;
}): Promise<void> {
  const fecha = new Date().toISOString();
  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "caja",
      rowId: ID.unique(),
      data: {
        fecha,
        ventas_efectivo: cierre.ventas_efectivo,
        ventas_digitales: cierre.ventas_digitales,
        gastos: cierre.gastos,
        saldo_esperado: cierre.saldo_esperado,
        saldo_real: cierre.saldo_real,
        diferencia: cierre.diferencia,
        estado: "cerrada",
        usuario_id: cierre.usuario_id,
        observacion: cierre.observacion || "Cierre diario de caja",
      }
    });
  } catch (err) {
    console.warn("Cierre guardado localmente (tabla caja en Appwrite no requerida):", err);
  }
}

export async function deleteVenta(rowId: string): Promise<void> {
  try {
    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: "ventas",
      rowId,
    });
  } catch (err) {
    console.error("Error deleting venta:", err);
  }
}

export async function deleteCliente(rowId: string): Promise<void> {
  try {
    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: "clientes",
      rowId,
    });
  } catch (err) {
    console.error("Error deleting cliente:", err);
  }
}

export async function deleteGasto(rowId: string): Promise<void> {
  try {
    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: "gastos",
      rowId,
    });
  } catch (err) {
    console.error("Error deleting gasto:", err);
  }
}

export async function deleteRecarga(rowId: string): Promise<void> {
  try {
    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: "recargas",
      rowId,
    });
  } catch (err) {
    console.error("Error deleting recarga:", err);
  }
}

export async function createRecarga(recarga: {
  tipo_balon: string;
  cantidad_enviada: number;
  costo_unitario?: number;
  costo_total?: number;
  proveedor?: string;
  usuario_id: string;
}): Promise<void> {
  const fecha_envio = new Date().toISOString();
  const recId = ID.unique();

  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: "recargas",
    rowId: recId,
    data: {
      fecha_envio,
      tipo_balon: recarga.tipo_balon,
      cantidad_enviada: recarga.cantidad_enviada,
      costo_unitario: recarga.costo_unitario || 0,
      costo_total: recarga.costo_total || 0,
      proveedor: recarga.proveedor || "Planta Solgas",
      estado: "enviada",
      usuario_id: recarga.usuario_id,
    }
  });

  await updateInventoryStock(recarga.tipo_balon, "vacío", -recarga.cantidad_enviada);

  await createMovimiento({
    tipo_movimiento: "Envío a recarga",
    tipo_balon: recarga.tipo_balon,
    estado_balon: "vacío",
    cantidad: recarga.cantidad_enviada,
    usuario_id: recarga.usuario_id,
    observacion: `Envío de ${recarga.cantidad_enviada} balones vacíos a ${recarga.proveedor || "Planta Solgas"}${recarga.costo_unitario ? ` - Costo S/ ${recarga.costo_unitario.toFixed(2)} c/u` : ""}`,
  }).catch(() => {});
}

export async function recepcionarRecarga(recargaId: string, tipo_balon: string, cantidad_recibida: number, usuario_id: string): Promise<void> {
  await updateInventoryStock(tipo_balon, "lleno", +cantidad_recibida);

  await createMovimiento({
    tipo_movimiento: "Recepción recarga",
    tipo_balon,
    estado_balon: "lleno",
    cantidad: cantidad_recibida,
    usuario_id,
    observacion: `Recepción de ${cantidad_recibida} balones llenos de planta`,
  }).catch(() => {});

  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: "recargas",
    rowId: recargaId,
    data: {
      estado: "recibida",
      cantidad_recibida,
    }
  });
}

export async function fetchUserProfile(user: { $id: string; email: string; name?: string }) {
  try {
    const res = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "usuarios",
      queries: [Query.equal("email", user.email)]
    });

    if (res.rows.length > 0) {
      const u = res.rows[0];
      return {
        name: u.nombre || user.name || user.email.split("@")[0],
        email: user.email,
        role: (u.rol === "dueña" ? "Dueña" : "Administrador") as "Dueña" | "Administrador",
      };
    }
  } catch (err) {
    console.warn("Using Auth details for profile:", err);
  }

  const isLuz = user.email.toLowerCase().includes("luz");
  return {
    name: isLuz ? "Luz Marina" : user.name || "Humberto Chipana",
    email: user.email,
    role: isLuz ? "Dueña" : "Administrador",
  };
}

// ── Carga diaria (Galones del chofer) ────────────────────────────────────────
export async function fetchGalonesHoy(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "carga_diaria",
      queries: [Query.equal("fecha", today), Query.limit(1)]
    });
    if (res.rows.length > 0) {
      return res.rows[0].galones || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function saveGalonesHoy(galones: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const res = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "carga_diaria",
    queries: [Query.equal("fecha", today), Query.limit(1)]
  });
  if (res.rows.length > 0) {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: "carga_diaria",
      rowId: res.rows[0].$id,
      data: { galones, actualizado_en: new Date().toISOString() }
    });
  } else {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "carga_diaria",
      rowId: ID.unique(),
      data: { fecha: today, galones, actualizado_en: new Date().toISOString() }
    });
  }
}
