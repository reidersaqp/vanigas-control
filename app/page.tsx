"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Models } from "appwrite";
import { account } from "../lib/appwrite";

import { fetchInventario, fetchVentas, createVenta, deleteVenta, fetchClientes, createCliente, deleteCliente, fetchGastos, createGasto, deleteGasto, createCierreCaja, fetchMovimientos, clearAllMovimientos, fetchRecargas, createRecarga, deleteRecarga, recepcionarRecarga, updateInventoryStock, fetchUserProfile, fetchGalonesHoy, saveGalonesHoy, InventoryItem, SaleItem, ClientItem, GastoItem, MovementItem, RecargaItem } from "../lib/db";
import { exportToCSV, printPDFReport } from "../lib/export";

type View = "Resumen" | "Inventario" | "Ventas" | "Recargas" | "Movimientos" | "Clientes" | "Caja" | "Reportes";

const menu: { label: View; icon: string }[] = [
  { label: "Resumen", icon: "" }, { label: "Inventario", icon: "" },
  { label: "Ventas", icon: "" }, { label: "Recargas", icon: "" },
  { label: "Movimientos", icon: "" }, { label: "Clientes", icon: "" },
  { label: "Caja", icon: "" }, { label: "Reportes", icon: "" },
];

function StatCard({ label, value, detail }: { label: string; value: string; detail: string; accent: string }) {
  return <article className="stat-card">
    <p>{label}</p><strong>{value}</strong><span>{detail}</span>
  </article>;
}

function SalesTable({ sales, onRequestDelete }: { sales: SaleItem[]; onRequestDelete?: (type: "venta", id: string, label: string) => void }) {
  if (sales.length === 0) {
    return <div className="empty-state"><h3>Sin ventas registradas hoy</h3><p>Las ventas que registre en el sistema aparecerán aquí en tiempo real.</p></div>;
  }

  return <div className="table-wrap"><table>
    <thead><tr><th>Venta</th><th>Hora</th><th>Cliente</th><th>Balón</th><th>Cant.</th><th>Precio</th><th>Total</th><th>Pago</th><th>Estado</th>{onRequestDelete ? <th>Acciones</th> : null}</tr></thead>
    <tbody>{sales.map((sale, idx) => <tr key={sale.$id || sale.id || idx}>
      <td className="code">{sale.id || sale.$id?.slice(-6).toUpperCase()}</td>
      <td>{sale.time || "Ahora"}</td>
      <td className="customer">{sale.client || sale.cliente_nombre}</td>
      <td><span className={`pill ${(sale.tipo_balon || sale.type) === "Premium" ? "premium" : "normal"}`}>{sale.tipo_balon || sale.type}</span></td>
      <td>{sale.cantidad || sale.qty}</td>
      <td>S/ {(sale.precio_unitario || sale.price || 0).toFixed(2)}</td>
      <td className="total">S/ {(sale.total || 0).toFixed(2)}</td>
      <td>{sale.forma_pago || sale.payment}</td>
      <td>
        <span style={{
          display: "inline-block",
          padding: "4px 8px",
          borderRadius: "4px",
          fontSize: "12px",
          fontWeight: "bold",
          border: "1px solid",
          background: (!sale.estado || sale.estado === "confirmada") ? "#e6f4ea" : "#fce8e6",
          color: (!sale.estado || sale.estado === "confirmada") ? "#137333" : "#c5221f",
          borderColor: (!sale.estado || sale.estado === "confirmada") ? "#c3e6cb" : "#f5c6cb"
        }}>
          {(!sale.estado || sale.estado === "confirmada") ? "Completo" :
           sale.estado === "debe_pago" ? "Debe pagar" :
           sale.estado === "debe_balon" ? "Debe balón" : "Debe ambos"}
        </span>
      </td>
      {onRequestDelete && sale.$id ? <td><button className="delete-btn" onClick={() => onRequestDelete("venta", sale.$id!, `la venta por S/ ${(sale.total || 0).toFixed(2)}`)}>Eliminar</button></td> : null}
    </tr>)}</tbody>
  </table></div>;
}

function getLoginErrorMessage(error: unknown) {
  const details = error as { message?: string; type?: string; code?: number };

  if (details.type === "user_invalid_credentials") {
    return "El correo o la contraseña no son correctos.";
  }

  if (details.type === "user_email_not_verified") {
    return "La cuenta existe, pero falta verificarla en Appwrite.";
  }

  if (details.type === "user_blocked") {
    return "La cuenta está bloqueada en Appwrite.";
  }

  if (details.code === 0 || details.message?.toLowerCase().includes("failed to fetch")) {
    return "Appwrite está bloqueando la conexión. Revisa que el dominio de Vercel está agregado en Platforms.";
  }

  return details.message || "No se pudo iniciar sesión. Revisa la configuración de Appwrite.";
}

function LoginScreen({ onLogin }: { onLogin: (user: Models.User<Models.Preferences>) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await account.createEmailPasswordSession({ email: email.trim(), password });
      onLogin(await account.get());
    } catch (err) {
      console.error("Error de inicio de sesión:", err);
      setError(getLoginErrorMessage(err));
      return;
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="login-page">
    <section className="login-brand-panel">
      <div className="login-brand">
        <img src="/logo_vanigas.png" alt="Logotipo de VANIGAS" />
        <div><b>VANIGAS</b><span>Control comercial</span></div>
      </div>
      <div className="typing-container">
        <span className="login-kicker">CONTROL COMERCIAL</span>
        <h1 className="typing-title">
          <span>DISTRIBUIDORA VANIGAS</span>
        </h1>
      </div>
      <small className="login-copyright">© 2026 VANIGAS · Sistema de uso interno</small>
    </section>

    <section className="login-form-panel">
      <div className="login-card">
        <h2>Iniciar sesión</h2>
        <form onSubmit={handleSubmit}>
          <label>Correo electrónico
            <div className="login-input">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@vanigas.pe" autoComplete="email" required />
            </div>
          </label>
          <label>Contraseña
            <div className="login-input">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingrese su contraseña" autoComplete="current-password" minLength={8} required />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Ocultar" : "Ver"}</button>
            </div>
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-submit" type="submit" disabled={submitting}>{submitting ? "Verificando…" : "Ingresar al sistema"}</button>
        </form>
      </div>
    </section>
  </main>;
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [userProfile, setUserProfile] = useState<{ name: string; email: string; role: "Dueña" | "Administrador" | "Vendedor" }>({
    name: "Usuario VANIGAS",
    email: "",
    role: "Administrador",
  });
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>("Resumen");
  const [range, setRange] = useState("Hoy");
  const [modal, setModal] = useState(false);
  const [gastoModal, setGastoModal] = useState(false);
  const [cierreModal, setCierreModal] = useState(false);
  const [clienteModal, setClienteModal] = useState(false);
  const [recargaModal, setRecargaModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "venta" | "cliente" | "gasto" | "recarga"; id: string; label: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

  // Appwrite Real Database States
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [salesList, setSalesList] = useState<SaleItem[]>([]);
  const [clientsList, setClientsList] = useState<ClientItem[]>([]);
  const [gastosList, setGastosList] = useState<GastoItem[]>([]);
  const [movimientosList, setMovimientosList] = useState<MovementItem[]>([]);
  const [recargasList, setRecargasList] = useState<RecargaItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [galonesChofer, setGalonesChofer] = useState<string | number>("");
  const [savingGalones, setSavingGalones] = useState(false);

  // New Sale Form State
  const [saleClient, setSaleClient] = useState("");
  const [saleClientType, setSaleClientType] = useState("Restaurante");
  const [saleType, setSaleType] = useState("Normal");
  const [saleQty, setSaleQty] = useState(1);
  const [salePrice, setSalePrice] = useState(52);
  const [salePayment, setSalePayment] = useState("Por definir");
  const [saleVacios, setSaleVacios] = useState(1);
  const [saleEstado, setSaleEstado] = useState("pendiente");
  const [saleTelefono, setSaleTelefono] = useState("");
  const [saleUbicacionUrl, setSaleUbicacionUrl] = useState("");
  const [savingSale, setSavingSale] = useState(false);

  // New Gasto Form State
  const [gastoConcepto, setGastoConcepto] = useState("");
  const [gastoCategoria, setGastoCategoria] = useState("Combustible");
  const [gastoMonto, setGastoMonto] = useState(15);
  const [gastoPago, setGastoPago] = useState("Efectivo");
  const [savingGasto, setSavingGasto] = useState(false);

  // New Cliente Form State
  const [cliNombre, setCliNombre] = useState("");
  const [cliTelefono, setCliTelefono] = useState("");
  const [cliDireccion, setCliDireccion] = useState("");
  const [cliTipo, setCliTipo] = useState("Restaurante");
  const [cliPrecioHabitual, setCliPrecioHabitual] = useState(52);
  const [savingCliente, setSavingCliente] = useState(false);

  // New Recarga Form State
  const [recQtyNormal, setRecQtyNormal] = useState(0);
  const [recQtyPremium, setRecQtyPremium] = useState(0);
  const [savingRecarga, setSavingRecarga] = useState(false);

  // Cierre de Caja Form State
  const [cierreSaldoReal, setCierreSaldoReal] = useState(0);
  const [cierreObs, setCierreObs] = useState("");
  const [savingCierre, setSavingCierre] = useState(false);

  const title = useMemo(() => view === "Resumen" ? "Resumen del negocio" : view, [view]);

  const currentDateStr = useMemo(() => {
    const date = new Date();
    const formatted = date.toLocaleDateString("es-PE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, []);

  useEffect(() => {
    account.get()
      .then(async (user) => {
        setCurrentUser(user);
        const profile = await fetchUserProfile(user);
        setUserProfile(profile as typeof userProfile);
        loadAppwriteContent();
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  async function loadAppwriteContent() {
    setLoadingData(true);
    try {
      await clearAllMovimientos().catch(() => {});
      const [invData, salesData, cliData, gasData, movData, recData, galonesData] = await Promise.all([
        fetchInventario(),
        fetchVentas(),
        fetchClientes(),
        fetchGastos(),
        fetchMovimientos(),
        fetchRecargas(),
        fetchGalonesHoy(),
      ]);
      setInventory(invData);
      setSalesList(salesData);
      setClientsList(cliData);
      setGastosList(gasData);
      setMovimientosList(movData);
      setRecargasList(recData);
      setGalonesChofer(galonesData || "");
    } catch (err) {
      console.error("Error loading Appwrite content:", err);
    } finally {
      setLoadingData(false);
    }
  }

  async function logout() {
    await account.deleteSession({ sessionId: "current" });
    setCurrentUser(null);
  }

  async function handleSaveSale(e: FormEvent) {
    e.preventDefault();
    setSavingSale(true);
    try {
      await createVenta({
        cliente_nombre: saleClient.trim() || "Cliente General",
        tipo_cliente: saleClientType,
        tipo_balon: saleType,
        cantidad: Number(saleQty),
        precio_unitario: Number(salePrice),
        forma_pago: salePayment,
        vacios_recibidos: Number(saleVacios),
        usuario_id: currentUser?.$id || "session_user",
        estado: saleEstado,
        telefono: saleTelefono.trim(),
        ubicacion_url: saleUbicacionUrl.trim(),
      });
      await loadAppwriteContent();
      setModal(false);
      setSaleClient("");
      setSaleEstado("pendiente");
      setSalePayment("Por definir");
      setSaleTelefono("");
      setSaleUbicacionUrl("");
    } catch (err: any) {
      console.error("Error saving sale:", err);
    } finally {
      setSavingSale(false);
    }
  }

  async function handleSaveRecarga(e: FormEvent) {
    e.preventDefault();
    if (recQtyNormal <= 0 && recQtyPremium <= 0) return;
    setSavingRecarga(true);
    try {
      if (recQtyNormal > 0) {
        await createRecarga({
          tipo_balon: "Normal",
          cantidad_enviada: Number(recQtyNormal),
          proveedor: "Planta",
          usuario_id: currentUser?.$id || "session_user",
        });
      }
      if (recQtyPremium > 0) {
        await createRecarga({
          tipo_balon: "Premium",
          cantidad_enviada: Number(recQtyPremium),
          proveedor: "Planta",
          usuario_id: currentUser?.$id || "session_user",
        });
      }
      await loadAppwriteContent();
      setRecargaModal(false);
      setRecQtyNormal(0);
      setRecQtyPremium(0);
    } catch (err: any) {
      console.error("Error saving recarga:", err);
    } finally {
      setSavingRecarga(false);
    }
  }

  async function handleRecepcionar(recargaId: string, tipo_balon: string, cantidad: number) {
    try {
      await recepcionarRecarga(recargaId, tipo_balon, cantidad, currentUser?.$id || "session_user");
      await loadAppwriteContent();
    } catch (err) {
      console.error("Error recepcionando recarga:", err);
    }
  }

  async function handleSaveCliente(e: FormEvent) {
    e.preventDefault();
    if (!cliNombre.trim()) return;
    setSavingCliente(true);
    try {
      await createCliente({
        nombre: cliNombre.trim(),
        telefono: cliTelefono.trim(),
        direccion: cliDireccion.trim(),
        tipo_cliente: cliTipo,
        precio_habitual: Number(cliPrecioHabitual),
      });
      await loadAppwriteContent();
      setClienteModal(false);
      setCliNombre("");
      setCliTelefono("");
      setCliDireccion("");
    } catch (err) {
      console.error("Error saving client:", err);
    } finally {
      setSavingCliente(false);
    }
  }

  async function handleSaveGasto(e: FormEvent) {
    e.preventDefault();
    if (!gastoConcepto.trim()) return;
    setSavingGasto(true);
    try {
      await createGasto({
        concepto: gastoConcepto.trim(),
        categoria: gastoCategoria,
        monto: Number(gastoMonto),
        forma_pago: gastoPago,
        usuario_id: currentUser?.$id || "session_user",
      });
      await loadAppwriteContent();
      setGastoModal(false);
      setGastoConcepto("");
    } catch (err) {
      console.error("Error saving gasto:", err);
    } finally {
      setSavingGasto(false);
    }
  }

  async function handleSaveCierre(e: FormEvent, saldoEsperado: number, vEfectivo: number, vDigital: number, totalG: number) {
    e.preventDefault();
    setSavingCierre(true);
    try {
      await createCierreCaja({
        ventas_efectivo: vEfectivo,
        ventas_digitales: vDigital,
        gastos: totalG,
        saldo_esperado: saldoEsperado,
        saldo_real: Number(cierreSaldoReal),
        diferencia: Number(cierreSaldoReal) - saldoEsperado,
        observacion: cierreObs,
        usuario_id: currentUser?.$id || "session_user",
      });
    } catch (err) {
      console.log("Cierre guardado");
    } finally {
      await loadAppwriteContent();
      setCierreModal(false);
      setSavingCierre(false);
    }
  }

  async function handleAdjustStock(tipo_balon: string, estado: string, delta: number) {
    const currentItem = inventory.find((item) => item.tipo_balon === tipo_balon && item.estado === estado);
    if (!currentItem || currentItem.cantidad + delta < 0) return;

    const previousInventory = inventory;
    setInventory((items) =>
      items.map((item) =>
        item.tipo_balon === tipo_balon && item.estado === estado
          ? { ...item, cantidad: item.cantidad + delta }
          : item
      )
    );

    try {
      await updateInventoryStock(tipo_balon, estado, delta, true);
      setInventory(await fetchInventario());
    } catch (err) {
      console.error("Error updating stock:", err);
      setInventory(previousInventory);
    }
  }

  async function handleDeleteVenta(id: string) {
    await deleteVenta(id);
    await loadAppwriteContent();
  }

  async function handleDeleteCliente(id: string) {
    await deleteCliente(id);
    await loadAppwriteContent();
  }

  async function handleDeleteGasto(id: string) {
    await deleteGasto(id);
    await loadAppwriteContent();
  }

  async function handleDeleteRecarga(id: string) {
    await deleteRecarga(id);
    await loadAppwriteContent();
  }

  function handleRequestDelete(type: "venta" | "cliente" | "gasto" | "recarga", id: string, label: string) {
    setDeleteTarget({ type, id, label });
  }

  if (checkingSession) return <main className="session-loading"><div className="session-spinner" /><b>VANIGAS</b><span>Verificando acceso…</span></main>;
  if (!currentUser) return <LoginScreen onLogin={async (user) => { setCurrentUser(user); const p = await fetchUserProfile(user); setUserProfile(p as typeof userProfile); loadAppwriteContent(); }} />;

  const userName = userProfile.name;
  const visibleMenu = menu;

  // Dynamic calculations from Appwrite Database
  const totalVentasHoy = salesList.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const totalBalonesHoy = salesList.reduce((acc, curr) => acc + (curr.cantidad || curr.qty || 0), 0);
  const totalGastosHoy = gastosList.reduce((acc, curr) => acc + (curr.monto || 0), 0);

  const costoTotalBalones = totalBalonesHoy * 44.30;
  const gananciaBruta = Math.max(0, totalVentasHoy - costoTotalBalones);
  const gananciaEstimada = Math.max(0, gananciaBruta - totalGastosHoy);

  const ventasEfectivo = salesList.filter(s => s.forma_pago === "Efectivo").reduce((acc, curr) => acc + (curr.total || 0), 0);
  const ventasDigitales = salesList.filter(s => s.forma_pago !== "Efectivo").reduce((acc, curr) => acc + (curr.total || 0), 0);

  const normalLleno = inventory.find(i => i.tipo_balon === "Normal" && i.estado === "lleno")?.cantidad || 0;
  const normalVacio = inventory.find(i => i.tipo_balon === "Normal" && i.estado === "vac\u00edo")?.cantidad || 0;
  const premiumLleno = inventory.find(i => i.tipo_balon === "Premium" && i.estado === "lleno")?.cantidad || 0;
  const premiumVacio = inventory.find(i => i.tipo_balon === "Premium" && i.estado === "vac\u00edo")?.cantidad || 0;

  const valorCargasLlenas = (normalLleno + premiumLleno) * 44.30;
  const valorReferencialTotal = valorCargasLlenas + (normalVacio * 20) + (premiumVacio * 22);

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo_vanigas.png" alt="Logotipo de VANIGAS" className="brand-logo" />
        <div className="brand-copy">
          <b>VANIGAS</b>
          <span>Control comercial</span>
        </div>
      </div>
      <nav aria-label="Navegación principal">{visibleMenu.map((item) => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => setView(item.label)}>{item.label}</button>)}</nav>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <div><h1>{title}</h1><p>{currentDateStr}</p></div>
        <div className="top-actions">
          <div className="user"><div><b>{userName}</b></div><button className="logout-button" onClick={logout}>Salir</button></div>
        </div>
      </header>

      {view === "Resumen" ? <div className="content">
        <section className="welcome-row"><div><h2>Buenos días, {userName}</h2></div><button className="primary" onClick={() => setModal(true)}>Registrar venta</button></section>

        <section className="stats-grid">
          <StatCard label="Ventas de hoy" value={`S/ ${totalVentasHoy.toFixed(2)}`} detail={`${totalBalonesHoy} balones vendidos`} accent="teal" />
          <StatCard label="Ganancia bruta" value={`S/ ${gananciaBruta.toFixed(2)}`} detail="15% de las ventas" accent="blue" />
          <StatCard label="Gastos de hoy" value={`S/ ${totalGastosHoy.toFixed(2)}`} detail={`${gastosList.length} registro(s)`} accent="amber" />
          <StatCard label="Ganancia estimada" value={`S/ ${gananciaEstimada.toFixed(2)}`} detail="Después de gastos" accent="green" />
        </section>

        <section className="dashboard-grid">
          <article className="panel inventory-panel">
            <div className="panel-head"><div><h3>Inventario actual</h3><p>Existencias reales registradas en almacén</p></div><button onClick={() => setView("Inventario")}>Ver detalle</button></div>
            <div className="stock-grid">{inventory.map((item) => <div className="stock-item" key={item.name}><img src="/balon_gas.png" alt={item.name} className={`stock-img ${item.tone}`} /><div><strong>{item.cantidad}</strong><p>{item.name}</p></div></div>)}</div>
            <div className="stock-footer"><span>Total físico registrado</span><b>{inventory.reduce((acc, i) => acc + i.cantidad, 0)} balones</b></div>
          </article>

          <article className="panel alerts-panel">
            <div className="panel-head"><div><h3>Atención requerida</h3><p>Acciones pendientes en tiempo real</p></div><span className="badge">{(normalVacio + premiumVacio > 0 ? 1 : 0) + (premiumLleno < 10 && (normalLleno + premiumLleno > 0) ? 1 : 0)}</span></div>
            {normalVacio + premiumVacio > 0 ? <div className="alert warning"><div><b>{normalVacio + premiumVacio} balones vacíos</b><p>{normalVacio} normales y {premiumVacio} premium listos para recargar</p></div><button onClick={() => setView("Recargas")}>Revisar</button></div> : null}
            {premiumLleno < 10 && (normalLleno + premiumLleno > 0) ? <div className="alert danger"><div><b>Stock premium bajo</b><p>Quedan {premiumLleno} unidades llenas</p></div><button onClick={() => setView("Inventario")}>Ver</button></div> : null}
            {totalVentasHoy > 0 ? <div className="alert neutral"><div><b>Caja del día</b><p>S/ {ventasEfectivo.toFixed(2)} en efectivo</p></div><button onClick={() => setView("Caja")}>Ver Caja</button></div> : <div className="alert neutral"><div><b>Sin movimientos aún</b><p>El sistema está listo para registrar las operaciones del día</p></div><button onClick={() => setView("Inventario")}>Ver Inventario</button></div>}
          </article>
        </section>

        <section className="dashboard-grid lower">
          <article className="panel chart-panel">
            <div className="panel-head"><div><h3>Ventas del periodo</h3></div><div className="segmented"><button className={range === "Hoy" ? "selected" : ""} onClick={() => setRange("Hoy")}>7 días</button><button className={range === "Mes" ? "selected" : ""} onClick={() => setRange("Mes")}>30 días</button></div></div>
            <div className="chart">
              <div className="axis">
                <span>S/ 1.5k</span>
                <span>S/ 1.0k</span>
                <span>S/ 500</span>
                <span>S/ 0</span>
              </div>
              <div className="bars">
                {(() => {
                  const numDays = range === "Hoy" ? 7 : 30;
                  const dayLabels: string[] = [];
                  const dayValues: number[] = Array(numDays).fill(0);
                  const now = new Date();

                  for (let i = numDays - 1; i >= 0; i--) {
                    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                    const label = numDays === 7 
                      ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()]
                      : String(d.getDate());
                    dayLabels.push(label);

                    const dateString = d.toISOString().split("T")[0];
                    const dailyTotal = salesList
                      .filter(s => s.fecha && s.fecha.split("T")[0] === dateString)
                      .reduce((acc, curr) => acc + (curr.total || 0), 0);
                    dayValues[numDays - 1 - i] = dailyTotal;
                  }

                  const maxVal = Math.max(...dayValues, 1);
                  return dayValues.map((val, idx) => {
                    const percentage = (val / maxVal) * 100;
                    const isLast = idx === numDays - 1;
                    return (
                      <div className="bar-col" key={idx} style={{ flex: 1, minWidth: '8px' }}>
                        <div className={isLast && val > 0 ? "bar best" : "bar"} style={{ height: `${Math.max(5, percentage)}%` }}>
                          {val > 0 && <em style={{ fontSize: '9px', whiteSpace: 'nowrap' }}>S/ {val.toFixed(0)}</em>}
                        </div>
                        <span style={{ fontSize: '10px' }}>{dayLabels[idx]}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </article>
          <article className="panel capital-panel">
            <div className="panel-head"><div><h3>Capital e inventario</h3></div></div>
            <div className="capital-main"><span>Valor de cargas llenas</span><strong>S/ {valorCargasLlenas.toFixed(2)}</strong><small>{normalLleno + premiumLleno} balones llenos × S/ 44.30 costo base</small></div>
            <div className="capital-row"><span>Valor referencial total</span><b>S/ {valorReferencialTotal.toFixed(2)}</b></div>
            <div className="capital-row"><span>Efectivo en caja</span><b>S/ {ventasEfectivo.toFixed(2)}</b></div>
            <div className="capital-row"><span>Ventas digitales</span><b>S/ {ventasDigitales.toFixed(2)}</b></div>
          </article>
        </section>

        <section className="panel sales-panel"><div className="panel-head"><div><h3>Últimas ventas</h3></div><button onClick={() => setView("Ventas")}>Ver todas</button></div><SalesTable sales={salesList} onRequestDelete={handleRequestDelete} /></section>
      </div> : <ModuleView view={view} onAdd={() => setModal(true)} onAddGasto={() => setGastoModal(true)} onCierreCaja={() => setCierreModal(true)} onAddCliente={() => setClienteModal(true)} onAddRecarga={() => setRecargaModal(true)} onRecepcionar={handleRecepcionar} sales={salesList} inventory={inventory} clients={clientsList} gastos={gastosList} movimientos={movimientosList} recargas={recargasList} onAdjust={handleAdjustStock} onRequestDelete={handleRequestDelete} galonesChofer={galonesChofer} setGalonesChofer={setGalonesChofer} savingGalones={savingGalones} setSavingGalones={setSavingGalones} saveGalonesHoy={saveGalonesHoy} />}
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal(false)}>×</button><span className="eyebrow">NUEVA OPERACIÓN</span><h2>Registrar venta</h2><form onSubmit={handleSaveSale}>
      <div style={{marginBottom:'16px'}}>
        <button type="button" onClick={async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              const phoneMatch = text.match(/\b9\d{8}\b/);
              if (phoneMatch) setSaleTelefono(phoneMatch[0]);
              const urlMatch = text.match(/https?:\/\/[^\s]+/);
              if (urlMatch) setSaleUbicacionUrl(urlMatch[0]);
            }
          } catch (e) {
            console.error("Error al leer portapapeles:", e);
          }
        }} style={{width:'100%',padding:'12px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'8px',fontWeight:700,cursor:'pointer',fontSize:'14px'}}>Pegar datos desde WhatsApp</button>
      </div>
      <div className="form-grid"><label>Nombre del cliente{clientsList.length > 0 ? <select value={saleClient} onChange={(e)=>{
        const selected = clientsList.find(c => c.nombre === e.target.value);
        setSaleClient(e.target.value);
        if (selected && selected.telefono) setSaleTelefono(selected.telefono);
      }}><option value="">-- Seleccionar o escribir cliente --</option>{clientsList.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.tipo_cliente})</option>)}</select> : null}<input type="text" placeholder="Escribir nombre de cliente" value={saleClient} onChange={(e)=>setSaleClient(e.target.value)} required /></label><label>Teléfono<input type="text" placeholder="Ej. 987654321" value={saleTelefono} onChange={(e)=>setSaleTelefono(e.target.value)} /></label><label>Enlace de Ubicación GPS<input type="text" placeholder="Ej. https://maps.google.com/..." value={saleUbicacionUrl} onChange={(e)=>setSaleUbicacionUrl(e.target.value)} /></label><label>Tipo de cliente<select value={saleClientType} onChange={(e)=>setSaleClientType(e.target.value)}><option value="Restaurante">Restaurante</option><option value="Negocio">Negocio</option><option value="Domicilio">Domicilio</option></select></label><label>Tipo de balón<select value={saleType} onChange={(e)=>{ setSaleType(e.target.value); setSalePrice(e.target.value === "Premium" ? 55 : 52); }}><option value="Normal">Normal</option><option value="Premium">Premium</option></select></label><label>Cantidad<input type="number" value={saleQty} onChange={(e)=>setSaleQty(Number(e.target.value))} min="1" required /></label><label>Precio unitario (S/)<input type="number" value={salePrice} onChange={(e)=>setSalePrice(Number(e.target.value))} step="0.5" required /></label><label>Forma de pago<select value={salePayment} onChange={(e)=>setSalePayment(e.target.value)}><option value="Por definir">Por definir (En entrega)</option><option value="Efectivo">Efectivo</option><option value="Yape">Yape / Plin</option><option value="Transferencia">Transferencia</option><option value="Crédito">Crédito</option></select></label><label>Estado de entrega<select value={saleEstado} onChange={(e)=>setSaleEstado(e.target.value)}><option value="pendiente">Pendiente (Por entregar)</option><option value="confirmada">Completo (Entregado y cobrado)</option><option value="debe_pago">Debe pagar</option><option value="debe_balon">Debe balón</option><option value="debe_ambos">Debe ambos</option></select></label></div><div className="sale-total"><span>Total de la venta</span><strong>S/ {(saleQty * salePrice).toFixed(2)}</strong></div><div className="modal-actions"><button type="button" onClick={()=>setModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingSale}>{savingSale ? "Guardando…" : "Guardar venta"}</button></div></form></section></div>}

    {clienteModal && <div className="modal-backdrop" onMouseDown={() => setClienteModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setClienteModal(false)}>×</button><span className="eyebrow">NUEVO CLIENTE</span><h2>Registrar cliente</h2><form onSubmit={handleSaveCliente}><div className="form-grid"><label>Nombre del cliente / Empresa<input type="text" placeholder="Ej. Cevichería El Sabor" value={cliNombre} onChange={(e)=>setCliNombre(e.target.value)} required /></label><label>Teléfono<input type="text" placeholder="Ej. 987654321" value={cliTelefono} onChange={(e)=>setCliTelefono(e.target.value)} /></label><label>Dirección<input type="text" placeholder="Ej. Av. Principal 123" value={cliDireccion} onChange={(e)=>setCliDireccion(e.target.value)} /></label><label>Tipo de cliente<select value={cliTipo} onChange={(e)=>setCliTipo(e.target.value)}><option value="Restaurante">Restaurante</option><option value="Negocio">Negocio</option><option value="Domicilio">Domicilio</option></select></label><label>Precio habitual (S/)<input type="number" value={cliPrecioHabitual} onChange={(e)=>setCliPrecioHabitual(Number(e.target.value))} step="0.5" required /></label></div><div className="modal-actions"><button type="button" onClick={()=>setClienteModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingCliente}>{savingCliente ? "Guardando cliente…" : "Guardar cliente"}</button></div></form></section></div>}

    {recargaModal && <div className="modal-backdrop" onMouseDown={() => setRecargaModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setRecargaModal(false)}>×</button><span className="eyebrow">ENVÍO A PLANTA</span><h2>Registrar envío a recarga</h2><form onSubmit={handleSaveRecarga}><div className="form-grid"><label>Cantidad vacíos Normal<input type="text" value={recQtyNormal === 0 ? "" : recQtyNormal} onChange={(e)=>{
      const val = e.target.value;
      if (val === "" || /^\d+$/.test(val)) {
        setRecQtyNormal(val === "" ? 0 : Number(val));
      }
    }} placeholder="0" /></label><label>Cantidad vacíos Premium<input type="text" value={recQtyPremium === 0 ? "" : recQtyPremium} onChange={(e)=>{
      const val = e.target.value;
      if (val === "" || /^\d+$/.test(val)) {
        setRecQtyPremium(val === "" ? 0 : Number(val));
      }
    }} placeholder="0" /></label></div><div className="modal-actions"><button type="button" onClick={()=>setRecargaModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingRecarga}>{savingRecarga ? "Enviando…" : "Registrar envío a recarga"}</button></div></form></section></div>}

    {gastoModal && <div className="modal-backdrop" onMouseDown={() => setGastoModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setGastoModal(false)}>×</button><span className="eyebrow">REGISTRO DE GASTO</span><h2>Registrar gasto diario</h2><form onSubmit={handleSaveGasto}><div className="form-grid"><label>Concepto del gasto<input type="text" placeholder="Ej. Combustible moto repartidora" value={gastoConcepto} onChange={(e)=>setGastoConcepto(e.target.value)} required /></label><label>Categoría<select value={gastoCategoria} onChange={(e)=>setGastoCategoria(e.target.value)}><option value="Combustible">Combustible</option><option value="Reparto">Reparto</option><option value="Mantenimiento">Mantenimiento</option><option value="Personal">Personal</option><option value="Otros">Otros</option></select></label><label>Monto (S/)<input type="number" value={gastoMonto} onChange={(e)=>setGastoMonto(Number(e.target.value))} min="1" step="0.5" required /></label><label>Forma de pago<select value={gastoPago} onChange={(e)=>setGastoPago(e.target.value)}><option value="Efectivo">Efectivo</option><option value="Yape">Yape / Plin</option><option value="Transferencia">Transferencia</option></select></label></div><div className="modal-actions"><button type="button" onClick={()=>setGastoModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingGasto}>{savingGasto ? "Guardando gasto…" : "Guardar gasto"}</button></div></form></section></div>}

    {cierreModal && <div className="modal-backdrop" onMouseDown={() => setCierreModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setCierreModal(false)}>×</button><span className="eyebrow">ARQUEO DIARIO</span><h2>Cierre de caja del día</h2><form onSubmit={(e) => handleSaveCierre(e, (ventasEfectivo - totalGastosHoy), ventasEfectivo, ventasDigitales, totalGastosHoy)}><div className="form-grid"><label>Ventas en efectivo<span>S/ {ventasEfectivo.toFixed(2)}</span></label><label>Ventas digitales (Yape/Plin)<span>S/ {ventasDigitales.toFixed(2)}</span></label><label>Gastos del día<span>S/ {totalGastosHoy.toFixed(2)}</span></label><label>Saldo esperado en efectivo<strong>S/ {(ventasEfectivo - totalGastosHoy).toFixed(2)}</strong></label><label>Saldo real contado en caja (S/)<input type="number" value={cierreSaldoReal} onChange={(e)=>setCierreSaldoReal(Number(e.target.value))} step="0.5" required /></label><label>Observación<input type="text" placeholder="Observaciones del cierre" value={cierreObs} onChange={(e)=>setCierreObs(e.target.value)} /></label></div><div className="modal-actions"><button type="button" onClick={()=>setCierreModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingCierre}>{savingCierre ? "Cerrando caja…" : "Confirmar Cierre de Caja"}</button></div></form></section></div>}

    {deleteTarget && <div className="modal-backdrop" onMouseDown={() => setDeleteTarget(null)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setDeleteTarget(null)}>×</button><span className="eyebrow" style={{color:'#c74e49'}}>CONFIRMAR ELIMINACIÓN</span><h2>¿Eliminar registro?</h2><p style={{margin:'12px 0 24px',color:'#64748b',fontSize:'14px'}}>¿Está seguro de que desea eliminar <b>{deleteTarget.label}</b>? Esta acción se aplicará en tiempo real en Appwrite.</p><div className="modal-actions"><button type="button" onClick={()=>setDeleteTarget(null)}>Cancelar</button><button type="button" className="primary" style={{background:'#c74e49'}} disabled={deletingItem} onClick={async ()=>{ setDeletingItem(true); try { if (deleteTarget.type === "venta") await handleDeleteVenta(deleteTarget.id); else if (deleteTarget.type === "cliente") await handleDeleteCliente(deleteTarget.id); else if (deleteTarget.type === "gasto") await handleDeleteGasto(deleteTarget.id); else if (deleteTarget.type === "recarga") await handleDeleteRecarga(deleteTarget.id); } finally { setDeletingItem(false); setDeleteTarget(null); } }}>{deletingItem ? "Eliminando…" : "Sí, eliminar"}</button></div></section></div>}
  </main>;
}

interface ModuleViewProps {
  view: View;
  onAdd: () => void;
  onAddGasto: () => void;
  onCierreCaja: () => void;
  onAddCliente: () => void;
  onAddRecarga: () => void;
  onRecepcionar: (id: string, tipo: string, qty: number) => void;
  sales: SaleItem[];
  inventory: InventoryItem[];
  clients: ClientItem[];
  gastos: GastoItem[];
  movimientos: MovementItem[];
  recargas: RecargaItem[];
  onAdjust: (tipo: string, estado: string, delta: number) => void;
  onRequestDelete?: (type: "venta" | "cliente" | "gasto" | "recarga", id: string, label: string) => void;
  galonesChofer: string | number;
  setGalonesChofer: React.Dispatch<React.SetStateAction<string | number>>;
  savingGalones: boolean;
  setSavingGalones: React.Dispatch<React.SetStateAction<boolean>>;
  saveGalonesHoy: (galones: number) => Promise<void>;
}

function ModuleView({ view, onAdd, onAddGasto, onCierreCaja, onAddCliente, onAddRecarga, onRecepcionar, sales, inventory, clients, gastos, movimientos, recargas, onAdjust, onRequestDelete, galonesChofer, setGalonesChofer, savingGalones, setSavingGalones, saveGalonesHoy }: ModuleViewProps) {
  const copy: Record<View, [string,string]> = {
    Resumen: ["", ""],
    Inventario: ["Control de existencias", ""],
    Ventas: ["Registro de ventas", ""],
    Recargas: ["Control de recargas", ""],
    Movimientos: ["Movimientos de inventario", ""],
    Clientes: ["Directorio de clientes", ""],
    Caja: ["Caja diaria y arqueo", ""],
    Reportes: ["Reportes del negocio", ""],
  };

  const totalVentas = sales.reduce((a, b) => a + (b.total || 0), 0);
  const totalGastos = gastos.reduce((a, b) => a + (b.monto || 0), 0);
  const totalEfectivo = sales.filter(s => s.forma_pago === "Efectivo").reduce((a, b) => a + (b.total || 0), 0);
  const totalDigital = sales.filter(s => s.forma_pago !== "Efectivo").reduce((a, b) => a + (b.total || 0), 0);
  const [driveBackupState, setDriveBackupState] = useState<"idle" | "connecting" | "saving" | "success" | "error">("idle");
  const [driveBackupMessage, setDriveBackupMessage] = useState("");

  function handleExportExcel() {
    if (view === "Ventas") {
      exportToCSV("Ventas_VANIGAS.csv", sales.map(s => ({
        "Venta ID": s.id || s.$id,
        "Hora": s.time || "Ahora",
        "Cliente": s.client || s.cliente_nombre,
        "Tipo Balón": s.tipo_balon || s.type,
        "Cantidad": s.cantidad || s.qty,
        "Precio Unitario": s.precio_unitario || s.price,
        "Total (S/)": s.total,
        "Forma de Pago": s.forma_pago || s.payment
      })));
    } else if (view === "Inventario") {
      exportToCSV("Inventario_VANIGAS.csv", inventory.map(i => ({
        "Tipo de Balón": i.tipo_balon,
        "Estado": i.estado,
        "Cantidad": i.cantidad,
        "Stock Mínimo": i.stock_minimo ?? 5
      })));
    } else if (view === "Clientes") {
      exportToCSV("Clientes_VANIGAS.csv", clients.map(c => ({
        "Nombre": c.nombre,
        "Teléfono": c.telefono || "",
        "Dirección": c.direccion || "",
        "Tipo Cliente": c.tipo_cliente,
        "Precio Habitual": c.precio_habitual || 52
      })));
    } else if (view === "Movimientos") {
      exportToCSV("Movimientos_VANIGAS.csv", movimientos.map(m => ({
        "Fecha": m.fecha ? new Date(m.fecha).toLocaleString() : "Hoy",
        "Tipo Movimiento": m.tipo_movimiento,
        "Tipo Balón": m.tipo_balon,
        "Estado Balón": m.estado_balon,
        "Cantidad": m.cantidad,
        "Observación": m.observacion || ""
      })));
    } else {
      exportToCSV(`Reporte_VANIGAS_${view}_2026.csv`, sales.map(s => ({
        "Venta ID": s.id || s.$id,
        "Cliente": s.client || s.cliente_nombre,
        "Balón": s.tipo_balon || s.type,
        "Cantidad": s.cantidad || s.qty,
        "Total": s.total
      })));
    }
  }

  function handleDownloadPDF() {
    const summary = [
      { label: "Ventas Totales", value: `S/ ${totalVentas.toFixed(2)}` },
      { label: "Gastos del Día", value: `S/ ${totalGastos.toFixed(2)}` },
      { label: "Ganancia Estimada", value: `S/ ${(totalVentas * 0.15 - totalGastos).toFixed(2)}` },
      { label: "Balones Vendidos", value: `${sales.reduce((a,b)=>a+(b.cantidad||b.qty||0),0)} unidades` },
    ];
    const headers = ["Venta ID", "Hora", "Cliente", "Balón", "Cant.", "Precio", "Total (S/)", "Pago"];
    const rows = sales.map(s => [
      s.id || s.$id?.slice(-6).toUpperCase() || "V-001",
      s.time || "Ahora",
      s.client || s.cliente_nombre || "Cliente General",
      s.tipo_balon || s.type || "Normal",
      s.cantidad || s.qty || 1,
      `S/ ${(s.precio_unitario || s.price || 0).toFixed(2)}`,
      `S/ ${(s.total || 0).toFixed(2)}`,
      s.forma_pago || s.payment || "Efectivo"
    ]);
    printPDFReport(`Reporte Consolidado de Ventas e Inventario - VANIGAS`, summary, headers, rows);
  }

  async function handleDriveBackup() {
    try {
      setDriveBackupState("connecting");
      setDriveBackupMessage("Verificando conexión con Google Drive...");

      const status = await fetch("/api/google/status").then((res) => res.json());
      if (!status.connected) {
        setDriveBackupMessage("Se abrirá Google para autorizar Drive. Luego vuelve y presiona este botón otra vez.");
        window.location.href = "/api/google/auth";
        return;
      }

      setDriveBackupState("saving");
      setDriveBackupMessage("Generando archivo Excel y guardándolo directamente en Google Drive...");

      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `Backup_VANIGAS_${dateStr}.xlsx`;
      
      const res = await fetch("/api/backup-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales, inventory, gastos, recargas, clients, movimientos })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Error al conectar con Drive");
      }

      setDriveBackupState("success");
      setDriveBackupMessage(`Copia guardada correctamente en Google Drive: ${data.folderPath ? `${data.folderPath} / ` : ""}${data.filename || filename}`);
    } catch (err: any) {
      console.error("Error en respaldo directo a Drive:", err);
      setDriveBackupState("error");
      setDriveBackupMessage(err.message || "No se pudo guardar en Google Drive.");
    }
  }

  return <div className="content module-content">
    <section className="welcome-row">
      <div><h2>{copy[view]?.[0] || view}</h2></div>
      <div style={{display:'flex',gap:'10px'}}>
        {view === "Caja" ? <button className="primary" style={{background:'#c74e49'}} onClick={onAddGasto}>Registrar gasto</button> : null}
        {view === "Caja" ? <button className="primary" onClick={onCierreCaja}>Cerrar caja del día</button> : view === "Clientes" ? <button className="primary" onClick={onAddCliente}>Registrar cliente</button> : view === "Recargas" ? <button className="primary" onClick={onAddRecarga}>Registrar envío a recarga</button> : <button className="primary" onClick={onAdd}>Nuevo registro</button>}
      </div>
    </section>

    {view === "Inventario" ? (
      <>
        <section className="galones-section" style={{margin:'0 0 16px',padding:'16px 20px',background:'#fff',border:'1px solid #e2e8f0',borderRadius:'12px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px',flexWrap:'wrap'}}>
            <div>
              <h3 style={{margin:0,fontSize:'15px',fontWeight:700,color:'#0f172a'}}>Galones del chofer</h3>
              <p style={{margin:'4px 0 0',fontSize:'13px',color:'#64748b'}}>Cantidad de galones que lleva el chofer en el carro hoy. El valor se actualiza en tiempo real en la app del chofer.</p>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <input type="text" value={galonesChofer} onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^\d+$/.test(val)) {
                  setGalonesChofer(val);
                }
              }} style={{width:'90px',padding:'10px 14px',border:'1px solid #cbd5e1',borderRadius:'8px',fontSize:'18px',fontWeight:700,textAlign:'center',color:'#0f172a'}} placeholder="0" />
              <button disabled={savingGalones} onClick={async () => { setSavingGalones(true); try { await saveGalonesHoy(Number(galonesChofer || 0)); } catch(err) { console.error('Error guardando galones:', err); } finally { setSavingGalones(false); } }} style={{padding:'10px 20px',background:'#0f172a',color:'#fff',border:'none',borderRadius:'8px',fontWeight:600,fontSize:'14px',cursor:'pointer'}}>{savingGalones ? 'Guardando...' : 'Guardar galones'}</button>
            </div>
          </div>
        </section>

        <div className="caja-summary-grid" style={{marginBottom: '20px'}}>
          <div className="caja-card">
            <span>Balones Llenos (Disponibles)</span>
            <strong style={{color: 'var(--color-success)'}}>
              {inventory.filter(i => i.estado === "lleno").reduce((a, b) => a + b.cantidad, 0)} unidades
            </strong>
          </div>
          <div className="caja-card">
            <span>Balones Vacíos (Almacén)</span>
            <strong style={{color: 'var(--color-warning)'}}>
              {inventory.filter(i => i.estado === "vac\u00edo").reduce((a, b) => a + b.cantidad, 0)} unidades
            </strong>
          </div>
          <div className="caja-card highlight">
            <span>Valor Cargas Llenas (S/ 44.30)</span>
            <strong>
              S/ {(inventory.filter(i => i.estado === "lleno").reduce((a, b) => a + b.cantidad, 0) * 44.30).toFixed(2)}
            </strong>
          </div>
        </div>
      </>
    ) : (
      <div className="module-cards" style={{gridTemplateColumns: 'minmax(0, 320px)'}}>
        <div><span>Total registrado</span><strong>{view === "Ventas" ? `S/ ${totalVentas.toFixed(2)}` : view === "Recargas" ? `${recargas.filter(r => r.estado !== "recibida").reduce((a, b) => a + (b.cantidad_enviada || 0), 0)} balones en planta` : view === "Movimientos" ? `${movimientos.length} movimientos` : view === "Clientes" ? `${clients.length} clientes` : view === "Caja" ? `S/ ${totalEfectivo.toFixed(2)}` : view === "Reportes" ? `${sales.length} ventas procesadas` : `${inventory.reduce((a,b)=>a+b.cantidad,0)} balones`}</strong></div>
      </div>
    )}

    <section className="panel module-table">
      <div className="panel-head">
        <div><h3>{view}</h3></div>
        <div className="module-actions">
          <button onClick={handleExportExcel}>Exportar Excel</button>
        </div>
      </div>

      {view === "Ventas" ? <SalesTable sales={sales} onRequestDelete={onRequestDelete} /> :
       view === "Inventario" ? (
         <div className="inventory-detail-grid">
           {inventory.map((item) => (
             <div className="inventory-card" key={item.name}>
               <div className="inv-card-head">
                 <div className="inv-img-wrap">
                   <img src="/balon_gas.png" alt={item.name} className={`stock-img ${item.tone}`} />
                 </div>
                 <div className="inv-info">
                   <h4>{item.name}</h4>
                   <span className={`pill ${item.estado === "lleno" ? "normal" : "premium"}`}>
                     {item.tipo_balon} · {item.estado.toUpperCase()}
                   </span>
                 </div>
               </div>
               <div className="inv-card-body">
                 <strong className="inv-qty">{item.cantidad}</strong>
                 <span>unidades físicas en almacén</span>
               </div>
               <div className="inv-card-actions">
                 <button onClick={() => onAdjust(item.tipo_balon, item.estado, -1)}>- 1</button>
                 <button onClick={() => onAdjust(item.tipo_balon, item.estado, +1)}>+ 1</button>
                 <button className="inv-add-five" onClick={() => onAdjust(item.tipo_balon, item.estado, +5)}>+ 5 Balones</button>
               </div>
             </div>
           ))}
         </div>
       ) :
       view === "Clientes" ? <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Dirección</th><th>Tipo</th><th>Precio habitual</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{clients.length === 0 ? <tr><td colSpan={7} style={{textAlign:'center',padding:'24px',color:'#718090'}}>No hay clientes guardados aún. Agregue uno con el botón Registrar cliente.</td></tr> : clients.map((cli, i) => <tr key={cli.$id || i}><td><b>{cli.nombre}</b></td><td>{cli.telefono || "-"}</td><td>{cli.direccion || "Dirección no especificada"}</td><td><span className="pill normal">{cli.tipo_cliente}</span></td><td>S/ {(cli.precio_habitual || 52).toFixed(2)}</td><td><span className="badge">Activo</span></td><td>{cli.$id && onRequestDelete ? <button className="delete-btn" onClick={() => onRequestDelete("cliente", cli.$id!, `el cliente ${cli.nombre}`)}>Eliminar</button> : null}</td></tr>)}</tbody></table></div> :
       view === "Movimientos" ? <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo movimiento</th><th>Balón</th><th>Estado</th><th>Cantidad</th><th>Observación</th></tr></thead><tbody>{movimientos.length === 0 ? <tr><td colSpan={6} style={{textAlign:'center',padding:'24px',color:'#718090'}}>Sin movimientos registrados aún. Se generarán al realizar ventas o recargas.</td></tr> : movimientos.map((mov, i) => <tr key={mov.$id || i}><td>{mov.fecha ? new Date(mov.fecha).toLocaleString([], { dateStyle:'short', timeStyle:'short' }) : "Hoy"}</td><td><b>{mov.tipo_movimiento}</b></td><td>{mov.tipo_balon}</td><td>{mov.estado_balon}</td><td><b>{mov.cantidad}</b></td><td>{mov.observacion || "Movimiento del sistema"}</td></tr>)}</tbody></table></div> :
       view === "Recargas" ? <div className="table-wrap"><table><thead><tr><th>Fecha envío</th><th>Tipo balón</th><th>Cant. enviada</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{recargas.length === 0 ? <tr><td colSpan={5} style={{textAlign:'center',padding:'24px',color:'#718090'}}>Sin recargas registradas aún. Registre envíos de balones vacíos a recarga.</td></tr> : recargas.map((rec, i) => <tr key={rec.$id || i}><td>{rec.fecha_envio ? new Date(rec.fecha_envio).toLocaleDateString() : "Hoy"}</td><td>{rec.tipo_balon}</td><td><b>{rec.cantidad_enviada} balones</b></td><td><span className={`pill ${rec.estado === "recibida" ? "normal" : "premium"}`}>{rec.estado || "enviada"}</span></td><td><div style={{display:'flex',gap:'6px'}}>{rec.estado !== "recibida" ? <button className="logout-button" style={{background:'#e6f4f1',color:'var(--teal)',fontWeight:800}} onClick={() => onRecepcionar(rec.$id || "", rec.tipo_balon, rec.cantidad_enviada)}>Recepcionar</button> : <span style={{fontSize:'11px',color:'var(--teal)',fontWeight:700}}>Recibidas</span>}{rec.$id && onRequestDelete ? <button className="delete-btn" onClick={() => onRequestDelete("recarga", rec.$id!, `el envío a recarga de ${rec.cantidad_enviada} balones`)}>Eliminar</button> : null}</div></td></tr>)}</tbody></table></div> :
       view === "Caja" ? <div className="caja-view-container"><div className="caja-summary-grid"><div className="caja-card"><span>Ventas en efectivo</span><strong>S/ {totalEfectivo.toFixed(2)}</strong></div><div className="caja-card"><span>Ventas digitales (Yape/Plin)</span><strong>S/ {totalDigital.toFixed(2)}</strong></div><div className="caja-card"><span>Gastos registrados</span><strong style={{color:'#c74e49'}}>S/ {totalGastos.toFixed(2)}</strong></div><div className="caja-card highlight"><span>Saldo en Caja Esperado</span><strong>S/ {(totalEfectivo - totalGastos).toFixed(2)}</strong></div></div><div className="table-wrap" style={{marginTop:'20px'}}><table><thead><tr><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Forma de pago</th><th>Acciones</th></tr></thead><tbody>{gastos.length === 0 ? <tr><td colSpan={5} style={{textAlign:'center',padding:'20px',color:'#81909a'}}>No hay gastos registrados el día de hoy.</td></tr> : gastos.map((g, i) => <tr key={g.$id || i}><td><b>{g.concepto}</b></td><td>{g.categoria}</td><td>S/ {(g.monto || 0).toFixed(2)}</td><td>{g.forma_pago || "Efectivo"}</td><td>{g.$id && onRequestDelete ? <button className="delete-btn" onClick={() => onRequestDelete("gasto", g.$id!, `el gasto ${g.concepto} por S/ ${g.monto}`)}>Eliminar</button> : null}</td></tr>)}</tbody></table></div></div> :
       view === "Reportes" ? <div className="reportes-container"><div className="caja-summary-grid"><div className="caja-card"><span>Ingreso Bruto Total</span><strong>S/ {totalVentas.toFixed(2)}</strong></div><div className="caja-card"><span>Ganancia Estimada</span><strong style={{color:'#1f9d73'}}>S/ {(totalVentas * 0.15 - totalGastos).toFixed(2)}</strong></div><div className="caja-card"><span>Balones Vendidos</span><strong>{sales.reduce((a,b)=>a+(b.cantidad||b.qty||0),0)} unidades</strong></div></div>{driveBackupState !== "idle" ? <div className={`drive-backup-status ${driveBackupState}`}><div><strong>{driveBackupState === "success" ? "Copia guardada" : driveBackupState === "error" ? "No se pudo guardar" : driveBackupState === "saving" ? "Guardando en Drive" : "Conectando Google Drive"}</strong><p>{driveBackupMessage}</p></div>{driveBackupState === "success" ? <span>✓</span> : driveBackupState === "error" ? <span>!</span> : <span className="drive-spinner" />}</div> : null}<div className="module-actions-row drive-actions"><button className="primary drive-save-button" onClick={handleDriveBackup} disabled={driveBackupState === "connecting" || driveBackupState === "saving"}>{driveBackupState === "saving" ? "Guardando..." : driveBackupState === "connecting" ? "Conectando..." : "Guardar copia en Google Drive (.xlsx)"}</button><button className="primary" onClick={handleDownloadPDF}>Descargar Reporte PDF</button><button className="primary" style={{background:'#2670b8'}} onClick={handleExportExcel}>Exportar a Excel</button></div></div> :
       <div className="empty-state"><h3>Módulo {view} sincronizado</h3><p>Información lista en Appwrite.</p></div>}
    </section>
  </div>;
}
