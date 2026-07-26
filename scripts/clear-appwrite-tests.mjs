import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const projectId = env.match(/NEXT_PUBLIC_APPWRITE_PROJECT_ID=(.*)/)[1].trim();
const apiKey = env.match(/APPWRITE_API_KEY=(.*)/)[1].trim();
const databaseId = "6a6177dd0032115b3906";

async function clearTable(tableId) {
  const res = await fetch(`https://nyc.cloud.appwrite.io/v1/tablesdb/${databaseId}/tables/${tableId}/rows?limit=100`, {
    headers: { 'x-appwrite-project': projectId, 'x-appwrite-key': apiKey }
  });
  const data = await res.json();
  if (data.rows && data.rows.length > 0) {
    for (const row of data.rows) {
      await fetch(`https://nyc.cloud.appwrite.io/v1/tablesdb/${databaseId}/tables/${tableId}/rows/${row.$id}`, {
        method: "DELETE",
        headers: { 'x-appwrite-project': projectId, 'x-appwrite-key': apiKey }
      });
    }
    console.log(`Tabla ${tableId} limpiada: ${data.rows.length} fila(s) eliminadas.`);
  } else {
    console.log(`Tabla ${tableId} ya estaba vacia.`);
  }
}

async function resetInventory() {
  const res = await fetch(`https://nyc.cloud.appwrite.io/v1/tablesdb/${databaseId}/tables/inventario/rows?limit=100`, {
    headers: { 'x-appwrite-project': projectId, 'x-appwrite-key': apiKey }
  });
  const data = await res.json();
  if (data.rows && data.rows.length > 0) {
    for (const row of data.rows) {
      await fetch(`https://nyc.cloud.appwrite.io/v1/tablesdb/${databaseId}/tables/inventario/rows/${row.$id}`, {
        method: "PATCH",
        headers: { 'x-appwrite-project': projectId, 'x-appwrite-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ cantidad: 0, actualizado_en: new Date().toISOString() })
      });
    }
    console.log('Inventario en Appwrite reseteado a 0 unidades.');
  }
}

async function run() {
  await clearTable("ventas");
  await clearTable("gastos");
  await clearTable("clientes");
  await clearTable("movimientos");
  await clearTable("recargas");
  await clearTable("caja");
  await clearTable("cierres_mensuales");
  await resetInventory();
  console.log("Limpieza total completada con exito.");
}

run();
