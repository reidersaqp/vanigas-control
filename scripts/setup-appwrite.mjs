import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const envPath = path.join(root, ".env.local");

function loadEnv(file) {
  const values = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

const env = loadEnv(envPath);
const endpoint = env.APPWRITE_ENDPOINT;
const projectId = env.APPWRITE_PROJECT_ID;
const databaseId = env.APPWRITE_DATABASE_ID;
const apiKey = env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !databaseId || !apiKey) {
  throw new Error("Faltan datos de Appwrite en .env.local");
}

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Response-Format": "1.9.5",
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
};

async function request(route, options = {}) {
  const response = await fetch(`${endpoint}${route}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `Error HTTP ${response.status}`);
    error.code = body.code || response.status;
    throw error;
  }
  return body;
}

const s = (key, size = 255, required = false, defaultValue) => ({
  key,
  type: "string",
  size,
  required,
  ...(defaultValue !== undefined && !required ? { default: defaultValue } : {}),
  array: false,
});
const i = (key, required = false, defaultValue = 0, min = 0) => ({
  key,
  type: "integer",
  required,
  ...(!required ? { default: defaultValue } : {}),
  min,
  array: false,
});
const f = (key, required = false, defaultValue = 0, min = 0) => ({
  key,
  type: "float",
  required,
  ...(!required ? { default: defaultValue } : {}),
  min,
  array: false,
});
const b = (key, defaultValue = true) => ({
  key,
  type: "boolean",
  required: false,
  default: defaultValue,
  array: false,
});
const d = (key, required = false) => ({
  key,
  type: "datetime",
  required,
  array: false,
});
const index = (key, columns, type = "key") => ({
  key,
  type,
  columns,
  orders: columns.map(() => "ASC"),
});

const schema = [
  {
    id: "usuarios",
    name: "Usuarios",
    columns: [
      s("nombre", 120, true),
      s("email", 160, true),
      s("telefono", 30),
      s("rol", 30, true),
      s("auth_user_id", 64),
      b("activo", true),
    ],
    indexes: [
      index("email_unico", ["email"], "unique"),
      index("auth_user", ["auth_user_id"], "unique"),
      index("por_rol", ["rol"]),
    ],
  },
  {
    id: "clientes",
    name: "Clientes",
    columns: [
      s("nombre", 160, true),
      s("telefono", 30),
      s("direccion", 300),
      s("tipo_cliente", 30, true),
      f("precio_habitual"),
      b("activo", true),
      d("fecha_registro"),
    ],
    indexes: [
      index("por_nombre", ["nombre"]),
      index("por_tipo", ["tipo_cliente"]),
      index("por_telefono", ["telefono"]),
    ],
  },
  {
    id: "inventario",
    name: "Inventario",
    columns: [
      s("tipo_balon", 20, true),
      s("estado", 20, true),
      i("cantidad"),
      i("stock_minimo"),
      d("actualizado_en"),
      s("actualizado_por", 64),
    ],
    indexes: [
      index("tipo_estado_unico", ["tipo_balon", "estado"], "unique"),
      index("por_estado", ["estado"]),
    ],
  },
  {
    id: "ventas",
    name: "Ventas",
    columns: [
      d("fecha", true),
      s("cliente_id", 64),
      s("cliente_nombre", 160),
      s("tipo_cliente", 30, true),
      s("tipo_balon", 20, true),
      i("cantidad", true),
      f("precio_unitario", true),
      f("costo_unitario"),
      f("total", true),
      f("ganancia_bruta"),
      s("forma_pago", 30, true),
      i("vacios_recibidos"),
      s("usuario_id", 64, true),
      s("observacion", 1000),
      s("estado", 30, false, "confirmada"),
    ],
    indexes: [
      index("por_fecha", ["fecha"]),
      index("por_cliente", ["cliente_id"]),
      index("por_tipo_balon", ["tipo_balon"]),
      index("por_usuario", ["usuario_id"]),
    ],
  },
  {
    id: "movimientos",
    name: "Movimientos",
    columns: [
      d("fecha", true),
      s("tipo_movimiento", 40, true),
      s("tipo_balon", 20, true),
      s("estado_balon", 20, true),
      i("cantidad", true),
      s("referencia_tipo", 30),
      s("referencia_id", 64),
      s("usuario_id", 64, true),
      s("observacion", 1000),
    ],
    indexes: [
      index("por_fecha", ["fecha"]),
      index("por_tipo", ["tipo_movimiento"]),
      index("por_referencia", ["referencia_id"]),
    ],
  },
  {
    id: "recargas",
    name: "Recargas",
    columns: [
      d("fecha_envio", true),
      d("fecha_recepcion"),
      s("tipo_balon", 20, true),
      i("cantidad_enviada", true),
      i("cantidad_recibida"),
      f("costo_unitario"),
      f("costo_total"),
      s("proveedor", 160),
      s("estado", 30, false, "enviada"),
      s("usuario_id", 64, true),
      s("observacion", 1000),
    ],
    indexes: [
      index("por_fecha_envio", ["fecha_envio"]),
      index("por_estado", ["estado"]),
      index("por_tipo_balon", ["tipo_balon"]),
    ],
  },
  {
    id: "gastos",
    name: "Gastos",
    columns: [
      d("fecha", true),
      s("concepto", 200, true),
      s("categoria", 50, true),
      f("monto", true),
      s("forma_pago", 30),
      s("usuario_id", 64, true),
      s("observacion", 1000),
    ],
    indexes: [
      index("por_fecha", ["fecha"]),
      index("por_categoria", ["categoria"]),
    ],
  },
  {
    id: "caja",
    name: "Caja diaria",
    columns: [
      d("fecha", true),
      f("saldo_inicial"),
      f("ventas_efectivo"),
      f("ventas_digitales"),
      f("ventas_credito"),
      f("gastos"),
      f("saldo_esperado"),
      f("saldo_real"),
      f("diferencia"),
      s("estado", 30, false, "abierta"),
      s("usuario_id", 64, true),
      s("observacion", 1000),
    ],
    indexes: [
      index("fecha_unica", ["fecha"], "unique"),
      index("por_estado", ["estado"]),
    ],
  },
  {
    id: "cierres_mensuales",
    name: "Cierres mensuales",
    columns: [
      i("anio", true),
      i("mes", true),
      f("total_ventas"),
      f("costo_ventas"),
      f("ganancia_bruta"),
      f("total_gastos"),
      f("ganancia_neta"),
      i("balones_vendidos"),
      i("vacios_recibidos"),
      d("cerrado_en"),
      s("cerrado_por", 64),
    ],
    indexes: [
      index("periodo_unico", ["anio", "mes"], "unique"),
      index("por_anio", ["anio"]),
    ],
  },
  {
    id: "configuracion",
    name: "Configuración",
    columns: [
      s("clave", 80, true),
      s("valor", 500, true),
      s("descripcion", 300),
      d("actualizado_en"),
      s("actualizado_por", 64),
    ],
    indexes: [index("clave_unica", ["clave"], "unique")],
  },
];

async function listAll(resource) {
  const result = await request(resource);
  return result.tables || result.columns || result.indexes || [];
}

async function waitForColumns(tableId, expectedKeys) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const columns = await listAll(
      `/tablesdb/${databaseId}/tables/${tableId}/columns?total=false`,
    );
    const ready = new Set(
      columns.filter((column) => column.status === "available").map((column) => column.key),
    );
    if (expectedKeys.every((key) => ready.has(key))) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Las columnas de ${tableId} no terminaron de prepararse`);
}

async function createColumn(tableId, column) {
  const type = column.type === "string" ? "varchar" : column.type;
  const body = { ...column };
  delete body.type;
  await request(
    `/tablesdb/${databaseId}/tables/${tableId}/columns/${type}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

async function ensureExistingTable(table) {
  const existingColumns = await listAll(
    `/tablesdb/${databaseId}/tables/${table.id}/columns?total=false`,
  );
  const columnKeys = new Set(existingColumns.map((column) => column.key));
  for (const column of table.columns) {
    if (columnKeys.has(column.key)) continue;
    await createColumn(table.id, column);
    process.stdout.write(`  + columna ${column.key}\n`);
  }
  await waitForColumns(table.id, table.columns.map((column) => column.key));

  const existingIndexes = await listAll(
    `/tablesdb/${databaseId}/tables/${table.id}/indexes?total=false`,
  );
  const indexKeys = new Set(existingIndexes.map((item) => item.key));
  for (const item of table.indexes) {
    if (indexKeys.has(item.key)) continue;
    await request(`/tablesdb/${databaseId}/tables/${table.id}/indexes`, {
      method: "POST",
      body: JSON.stringify(item),
    });
    process.stdout.write(`  + índice ${item.key}\n`);
  }
}

await request(`/tablesdb/${databaseId}`);
process.stdout.write("Conexión con Appwrite confirmada.\n");

const existingTables = await listAll(
  `/tablesdb/${databaseId}/tables?total=false`,
);
const tableIds = new Set(existingTables.map((table) => table.$id));
const applicationPermissions = [
  'read("any")',
  'create("any")',
  'update("any")',
  'delete("any")',
  'read("users")',
  'create("users")',
  'update("users")',
  'delete("users")',
];

for (const table of schema) {
  process.stdout.write(`Preparando ${table.name}...\n`);
  if (!tableIds.has(table.id)) {
    await request(`/tablesdb/${databaseId}/tables`, {
      method: "POST",
      body: JSON.stringify({
        tableId: table.id,
        name: table.name,
        permissions: applicationPermissions,
        rowSecurity: false,
        enabled: true,
      }),
    });
    process.stdout.write(`  + tabla creada\n`);
  }
  await ensureExistingTable(table);
  await request(`/tablesdb/${databaseId}/tables/${table.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: table.name,
      permissions: applicationPermissions,
      rowSecurity: false,
      enabled: true,
      purge: false,
    }),
  });
}

process.stdout.write(`\nConfiguración completada: ${schema.length} tablas preparadas.\n`);
