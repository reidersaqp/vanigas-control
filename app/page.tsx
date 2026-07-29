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
  { label: "Movimientos", icon: "" },
  { label: "Caja", icon: "" }, { label: "Reportes", icon: "" },
];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateKey() {
  return toDateKey(new Date());
}

function rowDateKey(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return toDateKey(date);
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const formatted = date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string; accent: string }) {
  return <article className="stat-card">
    <p>{label}</p><strong>{value}</strong><span>{detail}</span>
  </article>;
}

function SalesTable({ sales, onRequestDelete }: { sales: SaleItem[]; onRequestDelete?: (type: "venta", id: string, label: string) => void }) {
  if (sales.length === 0) {
    return <div className="empty-state"><h3>Sin ventas registradas para esta fecha</h3><p>Las ventas que registre en el sistema aparecer?n aqu? en tiempo real.</p></div>;
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
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [capitalObjetivo, setCapitalObjetivo] = useState(5000);
  const [precioProveedorBalon, setPrecioProveedorBalon] = useState(44.30);
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
  const [recCostoUnitario, setRecCostoUnitario] = useState(44.30);
  const [savingRecarga, setSavingRecarga] = useState(false);

  // Cierre de Caja Form State
  const [cierreSaldoReal, setCierreSaldoReal] = useState(0);
  const [cierreObs, setCierreObs] = useState("");
  const [savingCierre, setSavingCierre] = useState(false);

  const title = useMemo(() => view === "Resumen" ? "Resumen del negocio" : view, [view]);

  const currentDateStr = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);
  const isTodaySelected = selectedDate === getTodayDateKey();

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
          costo_unitario: Number(recCostoUnitario),
          costo_total: Number(recQtyNormal) * Number(recCostoUnitario),
          proveedor: "Planta",
          usuario_id: currentUser?.$id || "session_user",
        });
      }
      if (recQtyPremium > 0) {
        await createRecarga({
          tipo_balon: "Premium",
          cantidad_enviada: Number(recQtyPremium),
          costo_unitario: Number(recCostoUnitario),
          costo_total: Number(recQtyPremium) * Number(recCostoUnitario),
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

  async function handleSetAggregateStock(estado: "lleno" | "vacío", target: number) {
    const safeTarget = Math.max(0, Number(target || 0));
    const currentTotal = inventory
      .filter((item) => item.estado === estado)
      .reduce((acc, item) => acc + item.cantidad, 0);
    let diff = safeTarget - currentTotal;
    if (diff === 0) return;

    const previousInventory = inventory;

    try {
      if (diff > 0) {
        await updateInventoryStock("Normal", estado, diff, true);
      } else {
        let pendingToRemove = Math.abs(diff);
        const rows = inventory.filter((item) => item.estado === estado && item.cantidad > 0);
        for (const row of rows) {
          if (pendingToRemove <= 0) break;
          const removeNow = Math.min(row.cantidad, pendingToRemove);
          await updateInventoryStock(row.tipo_balon, estado, -removeNow, true);
          pendingToRemove -= removeNow;
        }
      }
      setInventory(await fetchInventario());
    } catch (err) {
      console.error("Error setting aggregate stock:", err);
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

  function isNumericInput(target: HTMLInputElement) {
    return target?.tagName === "INPUT" && (target.type === "number" || target.inputMode === "numeric" || /^\d*$/.test(target.value));
  }

  function handleClearZeroOnFocus(event: any) {
    const target = event.target as HTMLInputElement;
    if (isNumericInput(target) && target.value === "0") {
      setTimeout(() => target.select(), 0);
    }
  }

  function handleClearZeroOnKeyDown(event: any) {
    const target = event.target as HTMLInputElement;
    if (!isNumericInput(target) || event.ctrlKey || event.altKey || event.metaKey) return;
    if (/^\d$/.test(event.key) && target.value === "0") {
      target.value = "";
    }
  }

  function handleCleanLeadingZeroOnInput(event: any) {
    const target = event.target as HTMLInputElement;
    if (!isNumericInput(target)) return;
    if (/^0\d+/.test(target.value)) {
      target.value = target.value.replace(/^0+/, "") || "0";
    }
  }

  if (checkingSession) return <main className="session-loading"><div className="session-spinner" /><b>VANIGAS</b><span>Verificando acceso…</span></main>;
  if (!currentUser) return <LoginScreen onLogin={async (user) => { setCurrentUser(user); const p = await fetchUserProfile(user); setUserProfile(p as typeof userProfile); loadAppwriteContent(); }} />;

  const userName = userProfile.name;
  const visibleMenu = menu;

  // Dynamic calculations from Appwrite Database
  const selectedSales = salesList.filter((sale) => rowDateKey(sale.fecha) === selectedDate);
  const selectedGastos = gastosList.filter((gasto) => rowDateKey(gasto.fecha) === selectedDate);
  const selectedMovimientos = movimientosList.filter((movimiento) => rowDateKey(movimiento.fecha) === selectedDate);

  const totalVentasHoy = selectedSales.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const totalBalonesHoy = selectedSales.reduce((acc, curr) => acc + (curr.cantidad || curr.qty || 0), 0);
  const totalGastosHoy = selectedGastos.reduce((acc, curr) => acc + (curr.monto || 0), 0);

  const costoTotalBalones = totalBalonesHoy * 44.30;
  const gananciaBruta = Math.max(0, totalVentasHoy - costoTotalBalones);
  const gananciaEstimada = Math.max(0, gananciaBruta - totalGastosHoy);

  const ventasEfectivo = selectedSales.filter(s => s.forma_pago === "Efectivo").reduce((acc, curr) => acc + (curr.total || 0), 0);
  const ventasDigitales = selectedSales.filter(s => s.forma_pago !== "Efectivo").reduce((acc, curr) => acc + (curr.total || 0), 0);

  const normalLleno = inventory.find(i => i.tipo_balon === "Normal" && i.estado === "lleno")?.cantidad || 0;
  const normalVacio = inventory.find(i => i.tipo_balon === "Normal" && i.estado === "vac\u00edo")?.cantidad || 0;
  const premiumLleno = inventory.find(i => i.tipo_balon === "Premium" && i.estado === "lleno")?.cantidad || 0;
  const premiumVacio = inventory.find(i => i.tipo_balon === "Premium" && i.estado === "vac\u00edo")?.cantidad || 0;

  const costoBaseBalon = Number(precioProveedorBalon || 0);
  const galonesLlenos = normalLleno + premiumLleno;
  const galonesVacios = normalVacio + premiumVacio;
  const galonesEnCarro = Number(galonesChofer || 0);
  const inventarioBruto = galonesLlenos + galonesVacios + galonesEnCarro;
  const capitalActualBalones = inventarioBruto * costoBaseBalon;
  const capitalFaltante = Math.max(0, capitalObjetivo - capitalActualBalones);
  const balonesFaltantesCapital = Math.ceil(capitalFaltante / costoBaseBalon);
  const galonesRestantesCarro = Math.max(0, galonesEnCarro - totalBalonesHoy);

  return <main className="app-shell" onFocusCapture={handleClearZeroOnFocus} onKeyDownCapture={handleClearZeroOnKeyDown} onInputCapture={handleCleanLeadingZeroOnInput}>
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
          <div className="date-filter" aria-label="Filtro por fecha">
            <label htmlFor="sales-date">Fecha de trabajo</label>
            <input id="sales-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value || getTodayDateKey())} />
            {!isTodaySelected ? <button type="button" onClick={() => setSelectedDate(getTodayDateKey())}>Hoy</button> : null}
          </div>
          <div className="user"><div><b>{userName}</b></div><button className="logout-button" onClick={logout}>Salir</button></div>
        </div>
      </header>

      {view === "Resumen" ? <div className="content">
        <section className="welcome-row"><div><h2>Buenos días, {userName}</h2></div><button className="primary" onClick={() => setModal(true)}>Registrar venta</button></section>

        <section className="capital-overview">
          <article className="capital-hero-card">
            <span>Inventario bruto</span>
            <strong>{inventarioBruto} balones</strong>
            <p>Llenos + vacios + en carro</p>
          </article>
          <article className="capital-hero-card highlight">
            <span>Capital actual en balones</span>
            <strong>S/ {capitalActualBalones.toFixed(2)}</strong>
            <p>{inventarioBruto} x S/ {costoBaseBalon.toFixed(2)}</p>
          </article>
          <article className="capital-hero-card danger">
            <span>Falta para el objetivo</span>
            <strong>S/ {capitalFaltante.toFixed(2)}</strong>
            <p>{balonesFaltantesCapital} balones aprox.</p>
          </article>
          <article className="capital-target-card">
            <label htmlFor="capital-objetivo">Capital objetivo</label>
            <input id="capital-objetivo" type="number" value={capitalObjetivo} onChange={(event) => setCapitalObjetivo(Number(event.target.value || 0))} min="0" step="100" />
            <small>Meta recomendada: S/ 3,000 a S/ 5,000</small>
          </article>
        </section>

        <section className="stats-grid">
          <StatCard label={isTodaySelected ? "Ventas de hoy" : "Ventas de la fecha"} value={`S/ ${totalVentasHoy.toFixed(2)}`} detail={`${totalBalonesHoy} balones vendidos`} accent="teal" />
          <StatCard label="Ganancia bruta" value={`S/ ${gananciaBruta.toFixed(2)}`} detail="15% de las ventas" accent="blue" />
          <StatCard label={isTodaySelected ? "Gastos de hoy" : "Gastos de la fecha"} value={`S/ ${totalGastosHoy.toFixed(2)}`} detail={`${selectedGastos.length} registro(s)`} accent="amber" />
          <StatCard label="Ganancia estimada" value={`S/ ${gananciaEstimada.toFixed(2)}`} detail="Despues de gastos" accent="green" />
        </section>

        <section className="dashboard-grid">
          <article className="panel inventory-panel">
            <div className="panel-head"><div><h3>Inventario actual</h3><p>Control general sin separar por tipo de balon</p></div><button onClick={() => setView("Inventario")}>Ver detalle</button></div>
            <div className="stock-grid stock-grid-simple">
              <div className="stock-item"><img src="/balon_gas.png" alt="Galones llenos" className="stock-img" /><div><strong>{galonesLlenos}</strong><p>Galones llenos</p></div></div>
              <div className="stock-item"><img src="/balon_gas.png" alt="Galones vacios" className="stock-img muted" /><div><strong>{galonesVacios}</strong><p>Galones vacios</p></div></div>
              <div className="stock-item"><img src="/carro.png" alt="Galones en carro" className="stock-img premium" /><div><strong>{galonesEnCarro}</strong><p>Galones en carro</p></div></div>
            </div>
            <div className="stock-footer"><span>Total fisico controlado</span><b>{inventarioBruto} balones</b></div>
          </article>

          <article className="panel alerts-panel">
            <div className="panel-head"><div><h3>Atencion requerida</h3><p>Acciones pendientes en tiempo real</p></div><span className="badge">{(galonesVacios > 0 ? 1 : 0) + (galonesLlenos < 10 && galonesLlenos > 0 ? 1 : 0)}</span></div>
            {galonesVacios > 0 ? <div className="alert warning"><div><b>{galonesVacios} galones vacios</b><p>Listos para recarga o revision</p></div><button onClick={() => setView("Recargas")}>Revisar</button></div> : null}
            {galonesLlenos < 10 && galonesLlenos > 0 ? <div className="alert danger"><div><b>Stock de llenos bajo</b><p>Quedan {galonesLlenos} galones llenos disponibles</p></div><button onClick={() => setView("Inventario")}>Ver</button></div> : null}
            {totalVentasHoy > 0 ? <div className="alert neutral"><div><b>Caja del dia</b><p>S/ {ventasEfectivo.toFixed(2)} en efectivo</p></div><button onClick={() => setView("Caja")}>Ver Caja</button></div> : <div className="alert neutral"><div><b>Sin movimientos aun</b><p>El sistema esta listo para registrar las operaciones del dia</p></div><button onClick={() => setView("Inventario")}>Ver Inventario</button></div>}
          </article>
        </section>

        <section className="dashboard-grid lower">
          <article className="panel chart-panel">
            <div className="panel-head chart-head">
              <div><h3>Ventas del periodo</h3></div>
              <div className="chart-controls">
                <select value={chartYear} onChange={(event) => setChartYear(Number(event.target.value))} aria-label={"Seleccionar a\u00f1o"}>
                  {Array.from(new Set([new Date().getFullYear(), ...salesList.map((sale) => new Date(sale.fecha || Date.now()).getFullYear())])).sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
                <div className="segmented"><button className={range === "Hoy" ? "selected" : ""} onClick={() => setRange("Hoy")}>7 dias</button><button className={range === "Mes" ? "selected" : ""} onClick={() => setRange("Mes")}>30 dias</button><button className={range === "Anio" ? "selected" : ""} onClick={() => setRange("Anio")}>{"A\u00f1o"}</button></div>{range === "Anio" ? <button type="button" className="month-toggle-button" onClick={() => setShowMonthlySummary((value) => !value)}>{showMonthlySummary ? "Ocultar meses" : "Ver meses"}</button> : null}
              </div>
            </div>
            <div className={showMonthlySummary && range === "Anio" ? "chart-period-layout" : "chart-period-layout chart-period-layout-collapsed"}>
              <div>
                <div className={range === "Anio" ? "chart chart-year" : "chart chart-wide"}>
                  <div className="axis">
                    <span>S/ 1.5k</span>
                    <span>S/ 1.0k</span>
                    <span>S/ 500</span>
                    <span>S/ 0</span>
                  </div>
                  <div className="bars">
                    {(() => {
                      const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
                      let labels: string[] = [];
                      let values: number[] = [];

                      if (range === "Anio") {
                        labels = monthLabels;
                        values = Array(12).fill(0);
                        salesList.forEach((sale) => {
                          const d = new Date(sale.fecha || Date.now());
                          if (d.getFullYear() === chartYear) values[d.getMonth()] += sale.total || 0;
                        });
                      } else {
                        const numDays = range === "Hoy" ? 7 : 30;
                        values = Array(numDays).fill(0);
                        const now = new Date();
                        for (let i = numDays - 1; i >= 0; i--) {
                          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                          labels.push(numDays === 7 ? ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][d.getDay()] : String(d.getDate()));
                          const dateString = toDateKey(d);
                          values[numDays - 1 - i] = salesList.filter(s => rowDateKey(s.fecha) === dateString).reduce((acc, curr) => acc + (curr.total || 0), 0);
                        }
                      }

                      const maxVal = Math.max(...values, 1);
                      return values.map((val, idx) => {
                        const percentage = (val / maxVal) * 100;
                        const isLast = idx === values.length - 1;
                        const tone = val <= 0 ? "empty" : percentage >= 70 ? "high" : percentage >= 35 ? "mid" : "low";
                        return (
                          <div className={`bar-col ${range === "Mes" ? "bar-col-compact" : ""}`} key={idx} style={{ flex: 1, minWidth: range === "Anio" ? '18px' : range === "Mes" ? '22px' : '42px' }}>
                            <div className={`bar ${tone} ${isLast && val > 0 ? "best" : ""}`} style={{ height: `${Math.max(6, percentage)}%` }}>
                              {val > 0 && <em>S/ {val.toFixed(0)}</em>}
                            </div>
                            <span>{labels[idx]}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                {(() => {
                  const yearlySales = salesList.filter((sale) => new Date(sale.fecha || Date.now()).getFullYear() === chartYear).reduce((acc, sale) => acc + (sale.total || 0), 0);
                  const yearlyExpenses = gastosList.filter((gasto) => new Date(gasto.fecha || Date.now()).getFullYear() === chartYear).reduce((acc, gasto) => acc + (gasto.monto || 0), 0);
                  const yearlyProfit = (yearlySales * 0.15) - yearlyExpenses;
                  const monthShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--color-rule)', paddingTop: '16px', marginTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Ganancia estimada del {"a\u00f1o"} {chartYear}:</span>
                          <strong style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-ink)' }}>S/ {yearlyProfit.toFixed(2)}</strong>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Ventas Totales:</span>
                          <strong style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-ink)' }}>S/ {yearlySales.toFixed(2)}</strong>
                        </div>
                      </div>

                      <div style={{ width: '100%' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>Ventas por meses ({chartYear})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {monthShort.map((mLabel, mIdx) => {
                            const mTotal = salesList
                              .filter((s) => {
                                const d = new Date(s.fecha || Date.now());
                                return d.getFullYear() === chartYear && d.getMonth() === mIdx;
                              })
                              .reduce((acc, curr) => acc + (curr.total || 0), 0);
                            const hasSales = mTotal > 0;
                            return (
                              <div
                                key={mLabel}
                                style={{
                                  display: 'inline-flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid ' + (hasSales ? '#f87171' : 'var(--color-rule)'),
                                  background: hasSales ? '#fef2f2' : 'var(--color-paper-2)',
                                  minWidth: '54px',
                                  textAlign: 'center'
                                }}
                              >
                                <span style={{ fontSize: '11px', fontWeight: 800, color: hasSales ? '#dc2626' : 'var(--color-muted)' }}>{mLabel}</span>
                                <span style={{ fontSize: '12px', fontWeight: 900, color: hasSales ? '#dc2626' : 'var(--color-ink)', marginTop: '2px' }}>
                                  S/ {mTotal >= 1000 ? `${(mTotal / 1000).toFixed(1)}k` : mTotal.toFixed(0)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {showMonthlySummary && range === "Anio" ? <aside className="monthly-result-panel">
                <h4>Resumen por meses</h4>
                {(() => {
                  const monthLabels = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                  return monthLabels.map((label, monthIndex) => {
                    const monthSales = salesList.filter((sale) => { const d = new Date(sale.fecha || Date.now()); return d.getFullYear() === chartYear && d.getMonth() === monthIndex; }).reduce((acc, sale) => acc + (sale.total || 0), 0);
                    const monthExpenses = gastosList.filter((gasto) => { const d = new Date(gasto.fecha || Date.now()); return d.getFullYear() === chartYear && d.getMonth() === monthIndex; }).reduce((acc, gasto) => acc + (gasto.monto || 0), 0);
                    const monthProfit = (monthSales * 0.15) - monthExpenses;
                    return <div className="month-result-row" key={label}><span>{label}</span><b>S/ {monthProfit.toFixed(2)}</b></div>;
                  });
                })()}
              </aside> : null}
            </div>
          </article>
          <article className="panel capital-panel">
            <div className="panel-head"><div><h3>Capital e inventario</h3></div></div>
            <div className="capital-main"><span>Capital actual en balones</span><strong>S/ {capitalActualBalones.toFixed(2)}</strong><small>{inventarioBruto} balones x S/ {costoBaseBalon.toFixed(2)} costo base</small></div>
            <div className="capital-row"><span>Inventario bruto</span><b>{inventarioBruto} balones</b></div>
            <div className="capital-row"><span>Objetivo de capital</span><b>S/ {capitalObjetivo.toFixed(2)}</b></div>
            <div className="capital-row"><span>Capital faltante</span><b>S/ {capitalFaltante.toFixed(2)} - {balonesFaltantesCapital} balones</b></div>
            <div className="capital-row"><span>Efectivo en caja</span><b>S/ {ventasEfectivo.toFixed(2)}</b></div>
          </article>
        </section>

        <section className="panel sales-panel"><div className="panel-head"><div><h3>Últimas ventas</h3></div><button onClick={() => setView("Ventas")}>Ver todas</button></div><SalesTable sales={selectedSales} onRequestDelete={handleRequestDelete} /></section>
      </div> : <ModuleView view={view} onAdd={() => setModal(true)} onAddGasto={() => setGastoModal(true)} onCierreCaja={() => setCierreModal(true)} onAddCliente={() => setClienteModal(true)} onAddRecarga={() => setRecargaModal(true)} onRecepcionar={handleRecepcionar} sales={selectedSales} inventory={inventory} clients={clientsList} gastos={selectedGastos} movimientos={selectedMovimientos} recargas={recargasList} onAdjust={handleAdjustStock} onSetAggregateStock={handleSetAggregateStock} onRequestDelete={handleRequestDelete} galonesChofer={galonesChofer} setGalonesChofer={setGalonesChofer} savingGalones={savingGalones} setSavingGalones={setSavingGalones} saveGalonesHoy={saveGalonesHoy} precioProveedorBalon={precioProveedorBalon} setPrecioProveedorBalon={setPrecioProveedorBalon} />}
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
      }}><option value="">-- Seleccionar o escribir cliente --</option>{clientsList.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.tipo_cliente})</option>)}</select> : null}<input type="text" placeholder="Escribir nombre de cliente" value={saleClient} onChange={(e)=>setSaleClient(e.target.value)} required /></label><label>Teléfono<input type="text" placeholder="Ej. 987654321" value={saleTelefono} onChange={(e)=>setSaleTelefono(e.target.value)} /></label><label>Enlace de Ubicación GPS<input type="text" placeholder="Ej. https://maps.google.com/..." value={saleUbicacionUrl} onChange={(e)=>setSaleUbicacionUrl(e.target.value)} /></label><label>Tipo de cliente<select value={saleClientType} onChange={(e)=>setSaleClientType(e.target.value)}><option value="Restaurante">Restaurante</option><option value="Negocio">Negocio</option><option value="Domicilio">Domicilio</option></select></label><label>Tipo de balón<select value={saleType} onChange={(e)=>{ setSaleType(e.target.value); setSalePrice(e.target.value === "Premium" ? 55 : 52); }}><option value="Normal">Normal</option><option value="Premium">Premium</option></select></label><label>Cantidad<input type="number" value={saleQty} onChange={(e)=>{ const val = Number(e.target.value); setSaleQty(val); setSaleVacios(val); }} min="1" required /></label><label>Balones vacíos recibidos<input type="number" value={saleVacios} onChange={(e)=>setSaleVacios(Number(e.target.value))} min="0" required /></label><label>Precio unitario (S/)<input type="number" value={salePrice} onChange={(e)=>setSalePrice(Number(e.target.value))} step="0.5" required /></label><label>Forma de pago<select value={salePayment} onChange={(e)=>setSalePayment(e.target.value)}><option value="Por definir">Por definir (En entrega)</option><option value="Efectivo">Efectivo</option><option value="Yape">Yape / Plin</option><option value="Transferencia">Transferencia</option><option value="Crédito">Crédito</option></select></label><label>Estado de entrega<select value={saleEstado} onChange={(e)=>setSaleEstado(e.target.value)}><option value="pendiente">Pendiente (Por entregar)</option><option value="confirmada">Completo (Entregado y cobrado)</option><option value="debe_pago">Debe pagar</option><option value="debe_balon">Debe balón</option><option value="debe_ambos">Debe ambos</option></select></label></div><div className="sale-total"><span>Total de la venta</span><strong>S/ {(saleQty * salePrice).toFixed(2)}</strong></div><div className="modal-actions"><button type="button" onClick={()=>setModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingSale}>{savingSale ? "Guardando…" : "Guardar venta"}</button></div></form></section></div>}

    {clienteModal && <div className="modal-backdrop" onMouseDown={() => setClienteModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setClienteModal(false)}>×</button><span className="eyebrow">NUEVO CLIENTE</span><h2>Registrar cliente</h2><form onSubmit={handleSaveCliente}><div className="form-grid"><label>Nombre del cliente / Empresa<input type="text" placeholder="Ej. Cevichería El Sabor" value={cliNombre} onChange={(e)=>setCliNombre(e.target.value)} required /></label><label>Teléfono<input type="text" placeholder="Ej. 987654321" value={cliTelefono} onChange={(e)=>setCliTelefono(e.target.value)} /></label><label>Dirección<input type="text" placeholder="Ej. Av. Principal 123" value={cliDireccion} onChange={(e)=>setCliDireccion(e.target.value)} /></label><label>Tipo de cliente<select value={cliTipo} onChange={(e)=>setCliTipo(e.target.value)}><option value="Restaurante">Restaurante</option><option value="Negocio">Negocio</option><option value="Domicilio">Domicilio</option></select></label><label>Precio habitual (S/)<input type="number" value={cliPrecioHabitual} onChange={(e)=>setCliPrecioHabitual(Number(e.target.value))} step="0.5" required /></label></div><div className="modal-actions"><button type="button" onClick={()=>setClienteModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingCliente}>{savingCliente ? "Guardando cliente…" : "Guardar cliente"}</button></div></form></section></div>}

    {recargaModal && <div className="modal-backdrop" onMouseDown={() => setRecargaModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setRecargaModal(false)} >x</button><span className="eyebrow">ENVIO A PLANTA</span><h2>Registrar envio a recarga</h2><form onSubmit={handleSaveRecarga}><div className="form-grid"><label>Cantidad vacios Normal<input type="text" value={recQtyNormal === 0 ? "" : recQtyNormal} onChange={(e)=>{
      const val = e.target.value;
      if (val === "" || /^\d+$/.test(val)) {
        setRecQtyNormal(val === "" ? 0 : Number(val));
      }
    }} placeholder="0" /></label><label>Cantidad vacios Premium<input type="text" value={recQtyPremium === 0 ? "" : recQtyPremium} onChange={(e)=>{
      const val = e.target.value;
      if (val === "" || /^\d+$/.test(val)) {
        setRecQtyPremium(val === "" ? 0 : Number(val));
      }
    }} placeholder="0" /></label><label>Costo por balon recargado (S/)<input type="number" value={recCostoUnitario} onChange={(e)=>setRecCostoUnitario(Number(e.target.value || 0))} min="0" step="0.10" required /></label><label>Total estimado de recarga<span style={{display:'block',padding:'12px 14px',border:'1px solid #cbd5e1',borderRadius:'8px',fontWeight:800,color:'#0f172a'}}>S/ {((Number(recQtyNormal || 0) + Number(recQtyPremium || 0)) * Number(recCostoUnitario || 0)).toFixed(2)}</span></label></div><div className="modal-actions"><button type="button" onClick={()=>setRecargaModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingRecarga}>{savingRecarga ? "Enviando..." : "Registrar envio a recarga"}</button></div></form></section></div>}

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
  onSetAggregateStock: (estado: "lleno" | "vacío", target: number) => Promise<void>;
  onRequestDelete?: (type: "venta" | "cliente" | "gasto" | "recarga", id: string, label: string) => void;
  galonesChofer: string | number;
  setGalonesChofer: React.Dispatch<React.SetStateAction<string | number>>;
  savingGalones: boolean;
  setSavingGalones: React.Dispatch<React.SetStateAction<boolean>>;
  saveGalonesHoy: (galones: number) => Promise<void>;
  precioProveedorBalon: number;
  setPrecioProveedorBalon: React.Dispatch<React.SetStateAction<number>>;
}

function ModuleView({ view, onAdd, onAddGasto, onCierreCaja, onAddCliente, onAddRecarga, onRecepcionar, sales, inventory, clients, gastos, movimientos, recargas, onAdjust, onSetAggregateStock, onRequestDelete, galonesChofer, setGalonesChofer, savingGalones, setSavingGalones, saveGalonesHoy, precioProveedorBalon, setPrecioProveedorBalon }: ModuleViewProps) {
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
  const moduleCostoBaseBalon = Number(precioProveedorBalon || 0);
  const moduleGalonesLlenos = inventory.filter(i => i.estado === "lleno").reduce((a, b) => a + b.cantidad, 0);
  const moduleGalonesVacios = inventory.filter(i => i.estado === "vac\u00edo").reduce((a, b) => a + b.cantidad, 0);
  const moduleGalonesEnCarro = Number(galonesChofer || 0);
  const moduleInventarioBruto = moduleGalonesLlenos + moduleGalonesVacios + moduleGalonesEnCarro;
  const moduleCapitalBalones = moduleInventarioBruto * moduleCostoBaseBalon;
  const [draftGalonesLlenos, setDraftGalonesLlenos] = useState(moduleGalonesLlenos);
  const [draftGalonesVacios, setDraftGalonesVacios] = useState(moduleGalonesVacios);
  const [savingAggregateStock, setSavingAggregateStock] = useState<"lleno" | "vacío" | null>(null);
  const [driveBackupState, setDriveBackupState] = useState<"idle" | "connecting" | "saving" | "success" | "error">("idle");
  const [driveBackupMessage, setDriveBackupMessage] = useState("");

  useEffect(() => {
    setDraftGalonesLlenos(moduleGalonesLlenos);
    setDraftGalonesVacios(moduleGalonesVacios);
  }, [moduleGalonesLlenos, moduleGalonesVacios]);

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
    } else if (view === "Recargas") {
      exportToCSV("Recargas_VANIGAS.csv", recargas.map(r => ({
        "Fecha envio": r.fecha_envio ? new Date(r.fecha_envio).toLocaleString() : "Hoy",
        "Tipo balon": r.tipo_balon,
        "Cantidad enviada": r.cantidad_enviada,
        "Costo unitario": r.costo_unitario || 0,
        "Costo total": r.costo_total || ((r.cantidad_enviada || 0) * (r.costo_unitario || 0)),
        "Proveedor": r.proveedor || "Planta",
        "Estado": r.estado || "enviada"
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
            <span>Galones llenos</span>
            <strong style={{color: 'var(--color-success)'}}>{moduleGalonesLlenos} unidades</strong>
            <small style={{fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px'}}>Listos para venta</small>
          </div>
          <div className="caja-card">
            <span>Galones vacíos</span>
            <strong style={{color: 'var(--color-warning)'}}>{moduleGalonesVacios} unidades</strong>
            <small style={{fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px'}}>En almacén local</small>
          </div>
          <div className="caja-card">
            <span>Galones en carro</span>
            <strong>{moduleGalonesEnCarro} unidades</strong>
            <small style={{fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px'}}>Asignados a choferes</small>
          </div>
          <div className="caja-card highlight">
            <span>Inventario Bruto Total</span>
            <strong style={{color: 'var(--color-accent)'}}>{moduleInventarioBruto} balones</strong>
            <small style={{fontSize: '11px', color: 'var(--color-ink)', fontWeight: 700, marginTop: '4px'}}>Inversión Carga: S/ {moduleCapitalBalones.toFixed(2)}</small>
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
         <div className="inventory-detail-grid inventory-aggregate-grid">
           <article className="inventory-card aggregate-card editable-stock-card">
             <div className="inv-card-head">
               <div className="inv-img-wrap"><img src="/balon_gas.png" alt="Galones llenos" className="stock-img" /></div>
               <div className="inv-info"><h4>Galones llenos</h4><span className="pill normal">LISTOS PARA VENTA</span></div>
             </div>
             <label className="stock-edit-field">Cantidad actual
               <input type="number" value={draftGalonesLlenos} min="0" onChange={(event) => setDraftGalonesLlenos(Number(event.target.value || 0))} />
             </label>
             <button className="stock-save-button" disabled={savingAggregateStock === "lleno"} onClick={async () => { setSavingAggregateStock("lleno"); try { await onSetAggregateStock("lleno", draftGalonesLlenos); } finally { setSavingAggregateStock(null); } }}>{savingAggregateStock === "lleno" ? "Guardando..." : "Guardar llenos"}</button>
             <div className="inv-card-body"><strong className="inv-qty">{moduleGalonesLlenos}</strong><span>unidades fisicas disponibles</span></div>
           </article>
           <article className="inventory-card aggregate-card editable-stock-card">
             <div className="inv-card-head">
               <div className="inv-img-wrap"><img src="/balon_gas.png" alt="Galones vacios" className="stock-img muted" /></div>
               <div className="inv-info"><h4>Galones vacios</h4><span className="pill premium">PARA RECARGA</span></div>
             </div>
             <label className="stock-edit-field">Cantidad actual
               <input type="number" value={draftGalonesVacios} min="0" onChange={(event) => setDraftGalonesVacios(Number(event.target.value || 0))} />
             </label>
             <button className="stock-save-button" disabled={savingAggregateStock === "vac\u00edo"} onClick={async () => { setSavingAggregateStock("vac\u00edo"); try { await onSetAggregateStock("vac\u00edo", draftGalonesVacios); } finally { setSavingAggregateStock(null); } }}>{savingAggregateStock === "vac\u00edo" ? "Guardando..." : "Guardar vacios"}</button>
             <div className="inv-card-body"><strong className="inv-qty">{moduleGalonesVacios}</strong><span>unidades fisicas en almacen</span></div>
           </article>
           <article className="inventory-card aggregate-card editable-stock-card">
             <div className="inv-card-head">
               <div className="inv-img-wrap"><img src="/carro.png" alt="Galones en carro" className="stock-img premium" /></div>
               <div className="inv-info"><h4>Galones en carro</h4><span className="pill normal">REPARTO DEL DIA</span></div>
             </div>
             <label className="stock-edit-field">Cantidad actual
               <input type="text" value={galonesChofer} onChange={(event) => { const val = event.target.value; if (val === "" || /^\d+$/.test(val)) setGalonesChofer(val); }} placeholder="0" />
             </label>
             <button className="stock-save-button" disabled={savingGalones} onClick={async () => { setSavingGalones(true); try { await saveGalonesHoy(Number(galonesChofer || 0)); } finally { setSavingGalones(false); } }}>{savingGalones ? "Guardando..." : "Guardar carro"}</button>
             <div className="inv-card-body"><strong className="inv-qty">{moduleGalonesEnCarro}</strong><span>carga registrada para el chofer</span></div>
           </article>
           <article className="inventory-card aggregate-card capital-card">
              <div className="inv-card-head">
                <div className="inv-info"><h4>Inventario Bruto Total</h4><span className="pill normal">TODOS LOS BALONES</span></div>
              </div>
              <label className="stock-edit-field">Costo recarga proveedor (S/)
                <input type="number" value={precioProveedorBalon} min="0" step="0.10" onChange={(event) => setPrecioProveedorBalon(Number(event.target.value || 0))} />
              </label>
              <div className="inv-card-body">
                <strong className="inv-qty">{moduleInventarioBruto} balones</strong>
                <span style={{display:'block',marginTop:'4px',fontSize:'12px',color:'var(--color-muted)'}}>Llenos ({moduleGalonesLlenos}) + Vacíos ({moduleGalonesVacios}) + Carro ({moduleGalonesEnCarro})</span>
                <span style={{display:'block',marginTop:'6px',fontWeight:800,color:'var(--color-accent)',fontSize:'13px'}}>Capital en Stock: S/ {moduleCapitalBalones.toFixed(2)}</span>
              </div>
           </article>
         </div>
       ) :
       view === "Clientes" ? <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Dirección</th><th>Tipo</th><th>Precio habitual</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{clients.length === 0 ? <tr><td colSpan={7} style={{textAlign:'center',padding:'24px',color:'#718090'}}>No hay clientes guardados aún. Agregue uno con el botón Registrar cliente.</td></tr> : clients.map((cli, i) => <tr key={cli.$id || i}><td><b>{cli.nombre}</b></td><td>{cli.telefono || "-"}</td><td>{cli.direccion || "Dirección no especificada"}</td><td><span className="pill normal">{cli.tipo_cliente}</span></td><td>S/ {(cli.precio_habitual || 52).toFixed(2)}</td><td><span className="badge">Activo</span></td><td>{cli.$id && onRequestDelete ? <button className="delete-btn" onClick={() => onRequestDelete("cliente", cli.$id!, `el cliente ${cli.nombre}`)}>Eliminar</button> : null}</td></tr>)}</tbody></table></div> :
       view === "Movimientos" ? <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo movimiento</th><th>Balón</th><th>Estado</th><th>Cantidad</th><th>Observación</th></tr></thead><tbody>{movimientos.length === 0 ? <tr><td colSpan={6} style={{textAlign:'center',padding:'24px',color:'#718090'}}>Sin movimientos registrados aún. Se generarán al realizar ventas o recargas.</td></tr> : movimientos.map((mov, i) => <tr key={mov.$id || i}><td>{mov.fecha ? new Date(mov.fecha).toLocaleString([], { dateStyle:'short', timeStyle:'short' }) : "Hoy"}</td><td><b>{mov.tipo_movimiento}</b></td><td>{mov.tipo_balon}</td><td>{mov.estado_balon}</td><td><b>{mov.cantidad}</b></td><td>{mov.observacion || "Movimiento del sistema"}</td></tr>)}</tbody></table></div> :
       view === "Recargas" ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {(() => {
              const lastRecarga = recargas.length > 0 ? recargas[0] : null;
              const lastDate = lastRecarga && lastRecarga.fecha_envio ? new Date(lastRecarga.fecha_envio) : null;
              
              const salesAcumuladas = sales.filter((s) => {
                if (!lastDate) return true;
                const sDate = new Date(s.fecha || Date.now());
                return sDate >= lastDate;
              }).reduce((acc, curr) => acc + (curr.total || 0), 0);

              const totalCajaAcumulada = salesAcumuladas > 0 ? salesAcumuladas : (sales.reduce((acc, curr) => acc + (curr.total || 0), 0));

              const vaciosNormal = inventory.find(i => i.tipo_balon === "Normal" && i.estado === "vacío")?.cantidad || 0;
              const vaciosPremium = inventory.find(i => i.tipo_balon === "Premium" && i.estado === "vacío")?.cantidad || 0;
              const totalVacios = vaciosNormal + vaciosPremium;
              const valorizacionVacios = totalVacios * 100;

              const costoRecargaUnitario = precioProveedorBalon || 42.0;
              const capacidadPresupuesto = Math.floor(totalCajaAcumulada / costoRecargaUnitario);
              const recomendacionBalones = Math.min(capacidadPresupuesto, totalVacios);
              const costoTotalRecarga = recomendacionBalones * costoRecargaUnitario;
              const saldoCajaSobrante = Math.max(0, totalCajaAcumulada - costoTotalRecarga);

              const diasDesdeUltima = lastDate ? Math.max(1, Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;

              return (
                <div className="panel" style={{ padding: '20px', background: 'var(--color-paper)', border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--color-accent)', fontWeight: 800, fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block' }}>
                        PLANIFICACIÓN INTELIGENTE DE COMPRA
                      </span>
                      <h3 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 800, color: 'var(--color-ink)' }}>
                        Sugerencia de Recarga a Planta NEWGAS
                      </h3>
                    </div>
                    {lastDate ? (
                      <span className="pill normal" style={{ fontSize: '11px', padding: '4px 10px' }}>
                        Última recarga hace {diasDesdeUltima} {diasDesdeUltima === 1 ? 'día' : 'días'} ({lastDate.toLocaleDateString()})
                      </span>
                    ) : (
                      <span className="pill normal" style={{ fontSize: '11px', padding: '4px 10px' }}>
                        Primer envío de período
                      </span>
                    )}
                  </div>

                  <div className="caja-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div className="caja-card">
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Caja Acumulada (Ventas)</span>
                      <strong style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-ink)' }}>S/ {totalCajaAcumulada.toFixed(2)}</strong>
                      <small style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>Dinero juntado desde la última recarga</small>
                    </div>

                    <div className="caja-card">
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Vacíos Disponibles</span>
                      <strong style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-warning)' }}>{totalVacios} envases</strong>
                      <small style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>Valorizados en S/ {valorizacionVacios.toFixed(2)}</small>
                    </div>

                    <div className="caja-card highlight" style={{ background: 'oklch(97% 0.02 240)', borderColor: 'oklch(85% 0.05 240)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', textTransform: 'uppercase' }}>Sugerencia Compra NEWGAS</span>
                      <strong style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-accent)' }}>
                        {recomendacionBalones > 0 ? `${recomendacionBalones} balones` : "Sin recarga requerida"}
                      </strong>
                      <small style={{ fontSize: '11px', color: 'var(--color-ink)', fontWeight: 700, marginTop: '4px' }}>
                        {recomendacionBalones > 0
                          ? `Costo S/ ${costoTotalRecarga.toFixed(2)} (${recomendacionBalones} x S/ ${costoRecargaUnitario.toFixed(2)})`
                          : "Caja o vacíos insuficientes"}
                      </small>
                    </div>

                    <div className="caja-card">
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Saldo Libre en Caja</span>
                      <strong style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-success)' }}>S/ {saldoCajaSobrante.toFixed(2)}</strong>
                      <small style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>Sobrante tras recargar</small>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      className="primary"
                      onClick={() => onAddRecarga()}
                      style={{ padding: '10px 18px', fontSize: '13px', fontWeight: 800 }}
                    >
                      + Registrar Envío a Planta NEWGAS
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha envío</th>
                    <th>Proveedor</th>
                    <th>Tipo balón</th>
                    <th>Cant. enviada</th>
                    <th>Costo unitario</th>
                    <th>Total recarga</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {recargas.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#718090' }}>
                        Sin recargas registradas aún. Registre envíos de balones vacíos a Planta NEWGAS.
                      </td>
                    </tr>
                  ) : (
                    recargas.map((rec, i) => (
                      <tr key={rec.$id || i}>
                        <td>{rec.fecha_envio ? new Date(rec.fecha_envio).toLocaleDateString() : "Hoy"}</td>
                        <td><b>{rec.proveedor || "Planta NEWGAS"}</b></td>
                        <td>{rec.tipo_balon}</td>
                        <td><b>{rec.cantidad_enviada} balones</b></td>
                        <td>S/ {(rec.costo_unitario || 0).toFixed(2)}</td>
                        <td><b>S/ {(rec.costo_total || ((rec.cantidad_enviada || 0) * (rec.costo_unitario || 0))).toFixed(2)}</b></td>
                        <td>
                          <span className={`pill ${rec.estado === "recibida" ? "normal" : "premium"}`}>
                            {rec.estado || "enviada"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {rec.estado !== "recibida" ? (
                              <button
                                className="logout-button"
                                style={{ background: '#e6f4f1', color: 'var(--teal)', fontWeight: 800 }}
                                onClick={() => onRecepcionar(rec.$id || "", rec.tipo_balon, rec.cantidad_enviada)}
                              >
                                Recepcionar
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 700 }}>Recibidas</span>
                            )}
                            {rec.$id && onRequestDelete ? (
                              <button
                                className="delete-btn"
                                onClick={() => onRequestDelete("recarga", rec.$id!, `el envío a recarga de ${rec.cantidad_enviada} balones`)}
                              >
                                Eliminar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) :
       view === "Caja" ? <div className="caja-view-container"><div className="caja-summary-grid"><div className="caja-card"><span>Ventas en efectivo</span><strong>S/ {totalEfectivo.toFixed(2)}</strong></div><div className="caja-card"><span>Ventas digitales (Yape/Plin)</span><strong>S/ {totalDigital.toFixed(2)}</strong></div><div className="caja-card"><span>Gastos registrados</span><strong style={{color:'#c74e49'}}>S/ {totalGastos.toFixed(2)}</strong></div><div className="caja-card highlight"><span>Saldo en Caja Esperado</span><strong>S/ {(totalEfectivo - totalGastos).toFixed(2)}</strong></div></div><div className="table-wrap" style={{marginTop:'20px'}}><table><thead><tr><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Forma de pago</th><th>Acciones</th></tr></thead><tbody>{gastos.length === 0 ? <tr><td colSpan={5} style={{textAlign:'center',padding:'20px',color:'#81909a'}}>No hay gastos registrados el día de hoy.</td></tr> : gastos.map((g, i) => <tr key={g.$id || i}><td><b>{g.concepto}</b></td><td>{g.categoria}</td><td>S/ {(g.monto || 0).toFixed(2)}</td><td>{g.forma_pago || "Efectivo"}</td><td>{g.$id && onRequestDelete ? <button className="delete-btn" onClick={() => onRequestDelete("gasto", g.$id!, `el gasto ${g.concepto} por S/ ${g.monto}`)}>Eliminar</button> : null}</td></tr>)}</tbody></table></div></div> :
       view === "Reportes" ? <div className="reportes-container"><div className="caja-summary-grid"><div className="caja-card"><span>Ingreso Bruto Total</span><strong>S/ {totalVentas.toFixed(2)}</strong></div><div className="caja-card"><span>Ganancia Estimada</span><strong style={{color:'#1f9d73'}}>S/ {(totalVentas * 0.15 - totalGastos).toFixed(2)}</strong></div><div className="caja-card"><span>Balones Vendidos</span><strong>{sales.reduce((a,b)=>a+(b.cantidad||b.qty||0),0)} unidades</strong></div></div>{driveBackupState !== "idle" ? <div className={`drive-backup-status ${driveBackupState}`}><div><strong>{driveBackupState === "success" ? "Copia guardada" : driveBackupState === "error" ? "No se pudo guardar" : driveBackupState === "saving" ? "Guardando en Drive" : "Conectando Google Drive"}</strong><p>{driveBackupMessage}</p></div>{driveBackupState === "success" ? <span>✓</span> : driveBackupState === "error" ? <span>!</span> : <span className="drive-spinner" />}</div> : null}<div className="module-actions-row drive-actions"><button className="primary drive-save-button" onClick={handleDriveBackup} disabled={driveBackupState === "connecting" || driveBackupState === "saving"}>{driveBackupState === "saving" ? "Guardando..." : driveBackupState === "connecting" ? "Conectando..." : "Guardar copia en Google Drive (.xlsx)"}</button><button className="primary" onClick={handleDownloadPDF}>Descargar Reporte PDF</button><button className="primary" style={{background:'#2670b8'}} onClick={handleExportExcel}>Exportar a Excel</button></div></div> :
       <div className="empty-state"><h3>Módulo {view} sincronizado</h3><p>Información lista en Appwrite.</p></div>}
    </section>
  </div>;
}
