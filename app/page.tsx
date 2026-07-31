"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import type { Models } from "appwrite";
import { account } from "../lib/appwrite";

import { fetchInventario, fetchVentas, createVenta, updateVenta, deleteVenta, fetchClientes, createCliente, deleteCliente, fetchGastos, createGasto, deleteGasto, createCierreCaja, fetchMovimientos, fetchRecargas, createRecarga, deleteRecarga, recepcionarRecarga, updateInventoryStock, fetchUserProfile, fetchGalonesHoy, saveGalonesHoy, InventoryItem, SaleItem, ClientItem, GastoItem, MovementItem, RecargaItem } from "../lib/db";
import { exportToCSV, printPDFReport } from "../lib/export";

type View = "Resumen" | "Inventario" | "Ventas" | "Recargas" | "Movimientos" | "Clientes" | "Caja" | "Reportes";
const views: View[] = ["Resumen", "Inventario", "Ventas", "Recargas", "Movimientos", "Clientes", "Caja", "Reportes"];

const menu: { label: View; icon: string }[] = [
  { label: "Resumen", icon: "" }, { label: "Inventario", icon: "" },
  { label: "Ventas", icon: "" }, { label: "Recargas", icon: "" },
  { label: "Caja", icon: "" }, { label: "Reportes", icon: "" },
];

type AppwriteTimestamp = { $createdAt?: string };

function toNumericInput(value: string): number | "" {
  const clean = value.replace(/\D/g, "");
  return clean === "" ? "" : Number(clean);
}

function toDecimalInput(value: string): number | "" {
  const clean = value.replace(/[^0-9.]/g, "");
  return clean === "" ? "" : Number(clean);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

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

function getSaleDebtInfo(sale: SaleItem) {
  const estado = sale.estado || "confirmada";
  const total = Number(sale.total || 0);
  const qty = Number(sale.cantidad || sale.qty || 1);
  const moneyDebt = estado === "debe_pago" || estado === "debe_ambos"
    ? Number(sale.monto_deuda_soles !== undefined && sale.monto_deuda_soles !== null ? sale.monto_deuda_soles : total)
    : 0;
  const cylinderDebt = estado === "debe_balon" || estado === "debe_ambos"
    ? Number(sale.cant_deba_balon !== undefined && sale.cant_deba_balon !== null ? sale.cant_deba_balon : qty)
    : 0;
  const charged = Math.max(0, total - moneyDebt);
  const hasDebt = moneyDebt > 0 || cylinderDebt > 0 || estado === "pendiente";
  return { estado, total, moneyDebt, cylinderDebt, charged, hasDebt };
}

function SalesTable({ sales, loading, onRequestDelete, onEditVenta }: { sales: SaleItem[]; loading?: boolean; onRequestDelete?: (type: "venta", id: string, label: string) => void; onEditVenta?: (sale: SaleItem) => void }) {
  if (loading && sales.length === 0) {
    return <div className="empty-state"><h3 style={{ color: '#2563eb' }}>Cargando datos...</h3><p>Obteniendo informacion del servidor.</p></div>;
  }
  if (sales.length === 0) {
    return <div className="empty-state"><h3>Sin ventas registradas para esta fecha</h3><p>Las ventas que registre en el sistema apareceran aqui en tiempo real.</p></div>;
  }

  const getDebtLabel = (sale: SaleItem) => {
    const estado = sale.estado;
    if (!estado || estado === "confirmada") return "Completo";
    const debt = getSaleDebtInfo(sale);
    if (estado === "debe_pago") return `Debe pagar`;
    if (estado === "debe_balon") return `Debe balon`;
    if (estado === "debe_ambos") {
      return `Debe pago y balon`;
    }
    return debt.moneyDebt > 0 || debt.cylinderDebt > 0 ? "Pendiente" : "Pendiente";
  };

  const getDisplayDistrito = (sale: SaleItem) => {
    if (sale.distrito) return sale.distrito;
    if (sale.observacion) {
      const match = sale.observacion.match(/Distrito:\s*([^|]+)/i);
      if (match) return match[1].trim();
    }
    return "Mariano Melgar";
  };

  const getCleanObs = (obs?: string) => {
    if (!obs) return "-";
    const cleaned = obs.replace(/^Distrito:\s*[^|]+\|?\s*/i, "").trim();
    return cleaned || "-";
  };

  return <div className="table-wrap sales-table-wrap"><table className="sales-table">
    <thead><tr><th>Hora</th><th>Cliente</th><th>Distrito</th><th>Balon</th><th>Cant.</th><th>Precio</th><th>Total</th><th>Cobrado</th><th>Por cobrar</th><th>Balones prestados</th><th>Pago</th><th>Estado</th><th>Observaciones</th>{(onRequestDelete || onEditVenta) ? <th>Acciones</th> : null}</tr></thead>
    <tbody>{sales.map((sale, idx) => {
      const debt = getSaleDebtInfo(sale);
      const isDebt = debt.hasDebt;
      const payment = sale.forma_pago || sale.payment || "Efectivo";
      return <tr key={sale.$id || sale.id || idx} className={isDebt ? "sale-row-debt" : ""}>
        <td>{sale.time || "Ahora"}</td>
        <td className="customer"><b>{sale.client || sale.cliente_nombre}</b></td>
        <td>{getDisplayDistrito(sale)}</td>
        <td><span className={`sale-balon-chip ${(sale.tipo_balon || sale.type || "Normal").toLowerCase()}`}>{sale.tipo_balon || sale.type}</span></td>
        <td><b>{sale.cantidad || sale.qty}</b></td>
        <td>S/ {(sale.precio_unitario || sale.price || 0).toFixed(2)}</td>
        <td className="total">S/ {(sale.total || 0).toFixed(2)}</td>
        <td className="total">S/ {debt.charged.toFixed(2)}</td>
        <td className={debt.moneyDebt > 0 ? "sale-money-debt" : ""}>S/ {debt.moneyDebt.toFixed(2)}</td>
        <td className={debt.cylinderDebt > 0 ? "sale-money-debt" : ""}>{debt.cylinderDebt} balon{debt.cylinderDebt === 1 ? "" : "es"}</td>
        <td><span className="sale-payment-chip">{payment === "Yape" ? "Yape / Plin" : payment}</span></td>
        <td>
          <span className={isDebt ? "sale-status-chip debt" : "sale-status-chip ok"}>{getDebtLabel(sale)}</span>
        </td>
        <td>{getCleanObs(sale.observacion)}</td>
        {(onRequestDelete || onEditVenta) ? <td>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {onEditVenta ? <button className="table-action-button" onClick={() => onEditVenta(sale)}>Editar</button> : null}
            {onRequestDelete && sale.$id ? <button className="delete-btn" onClick={() => onRequestDelete("venta", sale.$id!, `la venta por S/ ${(sale.total || 0).toFixed(2)}`)}>Eliminar</button> : null}
          </div>
        </td> : null}
      </tr>;
    })}</tbody>
  </table></div>;
}

function getLoginErrorMessage(error: unknown) {
  const details = error as { message?: string; type?: string; code?: number };

  if (details.type === "user_invalid_credentials") {
    return "El correo o la contrasena no son correctos.";
  }

  if (details.type === "user_email_not_verified") {
    return "La cuenta existe, pero falta verificarla en Appwrite.";
  }

  if (details.type === "user_blocked") {
    return "La cuenta esta bloqueada en Appwrite.";
  }

  if (details.code === 0 || details.message?.toLowerCase().includes("failed to fetch")) {
    return "Appwrite esta bloqueando la conexion. Revisa que el dominio de Vercel esta agregado en Platforms.";
  }

  return details.message || "No se pudo iniciar sesion. Revisa la configuracion de Appwrite.";
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
      console.error("Error de inicio de sesion:", err);
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
      <small className="login-copyright">2026 VANIGAS - Sistema de uso interno</small>
    </section>

    <section className="login-form-panel">
      <div className="login-card">
        <h2>Iniciar sesion</h2>
        <form onSubmit={handleSubmit}>
          <label>Correo electronico
            <div className="login-input">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@vanigas.pe" autoComplete="email" required />
            </div>
          </label>
          <label>Contrasena
            <div className="login-input">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingrese su contrasena" autoComplete="current-password" minLength={8} required />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Ocultar" : "Ver"}</button>
            </div>
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-submit" type="submit" disabled={submitting}>{submitting ? "Verificando..." : "Ingresar al sistema"}</button>
        </form>
      </div>
    </section>
  </main>;
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [userProfile, setUserProfile] = useState<{ name: string; email: string; role: "Duena" | "Administrador" | "Vendedor" }>({
    name: "Usuario VANIGAS",
    email: "",
    role: "Administrador",
  });
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "Resumen";
    const savedView = window.localStorage.getItem("vanigas:view") as View | null;
    return savedView && views.includes(savedView) ? savedView : "Resumen";
  });
  const [range, setRange] = useState("Hoy");
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window === "undefined") return getTodayDateKey();
    return window.localStorage.getItem("vanigas:selectedDate") || getTodayDateKey();
  });
  const [capitalObjetivo, setCapitalObjetivo] = useState(() => {
    if (typeof window === "undefined") return 0;
    const savedCapital = Number(window.localStorage.getItem("vanigas:capitalObjetivo"));
    return Number.isFinite(savedCapital) ? savedCapital : 0;
  });
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
  const [, setLoadingData] = useState(false);
  const [galonesChofer, setGalonesChofer] = useState<string | number>("");
  const [savingGalones, setSavingGalones] = useState(false);

  // New Sale Form State
  const [saleClient, setSaleClient] = useState("");
  const [saleClientType, setSaleClientType] = useState("Restaurante");
  const [saleType, setSaleType] = useState("Normal");
  const [saleQty, setSaleQty] = useState<number | "">(1);
  const [salePrice, setSalePrice] = useState<number | "">(52);
  const [salePayment, setSalePayment] = useState("Por definir");
  const [saleEstado, setSaleEstado] = useState("pendiente");
  const [saleTelefono, setSaleTelefono] = useState("");
  const [saleUbicacionUrl, setSaleUbicacionUrl] = useState("");
  const [saleDistrito, setSaleDistrito] = useState("Mariano Melgar");
  const [saleObservacion, setSaleObservacion] = useState("");
  const [saleMontoDeuda, setSaleMontoDeuda] = useState<number | "">("");
  const [saleCantDebaBalon, setSaleCantDebaBalon] = useState<number | "">("");
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
  const [recCostoUnitario, setRecCostoUnitario] = useState(44.30);
  const [savingRecarga, setSavingRecarga] = useState(false);
  const [recargaError, setRecargaError] = useState("");

  // Cierre de Caja Form State
  const [cierreSaldoReal, setCierreSaldoReal] = useState(0);
  const [cierreObs, setCierreObs] = useState("");
  const [savingCierre, setSavingCierre] = useState(false);

  // Edit Sale Form State
  const [editingSale, setEditingSale] = useState<SaleItem | null>(null);
  const [editClient, setEditClient] = useState("");
  const [editClientType, setEditClientType] = useState("Restaurante");
  const [editType, setEditType] = useState("Normal");
  const [editQty, setEditQty] = useState<number | "">(1);
  const [editPrice, setEditPrice] = useState<number | "">(52);
  const [editEstado, setEditEstado] = useState("confirmada");
  const [editFormaPago, setEditFormaPago] = useState("Efectivo");
  const [editTelefono, setEditTelefono] = useState("");
  const [editUbicacionUrl, setEditUbicacionUrl] = useState("");
  const [editDistrito, setEditDistrito] = useState("Mariano Melgar");
  const [editObservacion, setEditObservacion] = useState("");
  const [editMontoDeuda, setEditMontoDeuda] = useState<number | "">("");
  const [editCantDebaBalon, setEditCantDebaBalon] = useState<number | "">("");
  const [savingEditVenta, setSavingEditVenta] = useState(false);

  function handleOpenEditVenta(sale: SaleItem) {
    setEditingSale(sale);
    setEditClient(sale.cliente_nombre || sale.client || "");
    setEditClientType(sale.tipo_cliente || "Restaurante");
    setEditType(sale.tipo_balon || sale.type || "Normal");
    setEditQty(sale.cantidad || sale.qty || 1);
    setEditPrice(sale.precio_unitario || sale.price || 52);
    setEditEstado(sale.estado || "confirmada");
    setEditFormaPago(sale.forma_pago || sale.payment || "Efectivo");
    setEditTelefono(sale.telefono || "");
    setEditUbicacionUrl(sale.ubicacion_url || "");
    setEditDistrito(sale.distrito || "Mariano Melgar");
    const cleanedObs = (sale.observacion || "").replace(/^Distrito:\s*[^|]+\|?\s*/i, "").trim();
    setEditObservacion(cleanedObs);
    setEditMontoDeuda(sale.monto_deuda_soles !== undefined ? sale.monto_deuda_soles : (sale.total || 0));
    setEditCantDebaBalon(sale.cant_deba_balon !== undefined ? sale.cant_deba_balon : (sale.cantidad || 1));
  }

  async function handleSaveEditVenta(e: FormEvent) {
    e.preventDefault();
    const saleId = editingSale?.$id || editingSale?.id;
    if (!saleId) return;
    setSavingEditVenta(true);

    const numQty = editQty === "" ? 1 : Number(editQty);
    const numPrice = editPrice === "" ? 52 : Number(editPrice);
    const finalTotal = numQty * numPrice;
    const finalMontoDeuda = (editEstado === "debe_pago" || editEstado === "debe_ambos")
      ? Number(editMontoDeuda === "" ? finalTotal : editMontoDeuda)
      : 0;
    const finalBalonesDeuda = (editEstado === "debe_balon" || editEstado === "debe_ambos")
      ? Number(editCantDebaBalon === "" ? numQty : editCantDebaBalon)
      : 0;
    const finalVaciosRecibidos = calcularVaciosRecibidos(numQty, editEstado, finalBalonesDeuda);

    const originalQty = editingSale?.cantidad || editingSale?.qty || 1;
    const originalType = editingSale?.tipo_balon || editingSale?.type || "Normal";
    const originalEstado = editingSale?.estado || "confirmada";
    const originalBalonesDeuda = editingSale?.cant_deba_balon !== undefined && editingSale?.cant_deba_balon !== null
      ? Number(editingSale.cant_deba_balon)
      : 0;
    const originalVaciosRecibidos = editingSale?.vacios_recibidos !== undefined && editingSale?.vacios_recibidos !== null
      ? Number(editingSale.vacios_recibidos)
      : calcularVaciosRecibidos(originalQty, originalEstado, originalBalonesDeuda);
    const qtyDelta = originalQty - numQty;

    const localChanges = {
      cliente_nombre: editClient.trim() || "Cliente General",
      client: editClient.trim() || "Cliente General",
      tipo_cliente: editClientType,
      tipo_balon: editType,
      cantidad: numQty,
      qty: numQty,
      precio_unitario: numPrice,
      price: numPrice,
      total: finalTotal,
      forma_pago: editFormaPago,
      payment: editFormaPago,
      estado: editEstado,
      telefono: editTelefono.trim(),
      ubicacion_url: editUbicacionUrl.trim(),
      distrito: editDistrito,
      observacion: editObservacion.trim(),
      monto_deuda_soles: finalMontoDeuda,
      cant_deba_balon: finalBalonesDeuda,
      vacios_recibidos: finalVaciosRecibidos,
    };

    const dbChanges = {
      cliente_nombre: editClient.trim() || "Cliente General",
      tipo_cliente: editClientType,
      tipo_balon: editType,
      cantidad: numQty,
      precio_unitario: numPrice,
      total: finalTotal,
      forma_pago: editFormaPago,
      estado: editEstado,
      telefono: editTelefono.trim(),
      ubicacion_url: editUbicacionUrl.trim(),
      distrito: editDistrito,
      observacion: editObservacion.trim(),
      monto_deuda_soles: finalMontoDeuda,
      cant_deba_balon: finalBalonesDeuda,
      vacios_recibidos: finalVaciosRecibidos,
    };

    setSalesList((items) => {
      const updated = items.map((item) =>
        (item.$id === saleId || item.id === saleId) ? { ...item, ...localChanges } : item
      );
      try {
        localStorage.setItem("vanigas:sales", JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setEditingSale(null);

    try {
      await updateVenta(saleId, dbChanges);
      if (originalType !== editType) {
        await updateInventoryStock(originalType, "lleno", originalQty);
        await updateInventoryStock(editType, "lleno", -numQty);
        if (originalVaciosRecibidos > 0) await updateInventoryStock(originalType, "vacío", -originalVaciosRecibidos);
        if (finalVaciosRecibidos > 0) await updateInventoryStock(editType, "vacío", finalVaciosRecibidos);
      } else if (qtyDelta !== 0) {
        await updateInventoryStock(editType, "lleno", qtyDelta);
        const vaciosDelta = finalVaciosRecibidos - originalVaciosRecibidos;
        if (vaciosDelta !== 0) await updateInventoryStock(editType, "vacío", vaciosDelta);
      } else {
        const vaciosDelta = finalVaciosRecibidos - originalVaciosRecibidos;
        if (vaciosDelta !== 0) await updateInventoryStock(editType, "vacío", vaciosDelta);
      }
      await loadAppwriteContent();
    } catch (err) {
      console.error("Error al editar venta:", err);
    } finally {
      setSavingEditVenta(false);
    }
  }

  const title = useMemo(() => view === "Resumen" ? "Resumen del negocio" : view, [view]);

  const currentDateStr = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);
  const isTodaySelected = selectedDate === getTodayDateKey();

  useEffect(() => {
    window.localStorage.setItem("vanigas:view", view);
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem("vanigas:selectedDate", selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    window.localStorage.setItem("vanigas:capitalObjetivo", String(capitalObjetivo || 0));
  }, [capitalObjetivo]);

  useEffect(() => {
    try {
      const cachedSales = localStorage.getItem("vanigas:sales");
      const cachedInv = localStorage.getItem("vanigas:inventory");
      const cachedClients = localStorage.getItem("vanigas:clients");
      const cachedGastos = localStorage.getItem("vanigas:gastos");
      const cachedMovs = localStorage.getItem("vanigas:movimientos");
      queueMicrotask(() => {
        if (cachedSales) setSalesList(JSON.parse(cachedSales));
        if (cachedInv) setInventory(JSON.parse(cachedInv));
        if (cachedClients) setClientsList(JSON.parse(cachedClients));
        if (cachedGastos) setGastosList(JSON.parse(cachedGastos));
        if (cachedMovs) setMovimientosList(JSON.parse(cachedMovs));
      });
    } catch {}

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

      try {
        localStorage.setItem("vanigas:sales", JSON.stringify(salesData));
        localStorage.setItem("vanigas:inventory", JSON.stringify(invData));
        localStorage.setItem("vanigas:clients", JSON.stringify(cliData));
        localStorage.setItem("vanigas:gastos", JSON.stringify(gasData));
        localStorage.setItem("vanigas:movimientos", JSON.stringify(movData));
      } catch {}
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

  function calcularVaciosRecibidos(cantidad: number, estado: string, balonesDeuda: number) {
    if (estado === "confirmada" || estado === "debe_pago") return cantidad;
    if (estado === "debe_balon" || estado === "debe_ambos") return Math.max(0, cantidad - balonesDeuda);
    return 0;
  }

  async function handleSaveSale(e: FormEvent) {
    e.preventDefault();
    const numQty = saleQty === "" ? 1 : Number(saleQty);
    const numPrice = salePrice === "" ? 52 : Number(salePrice);
    const finalTotal = numQty * numPrice;
    const finalMontoDeuda = (saleEstado === "debe_pago" || saleEstado === "debe_ambos")
      ? Number(saleMontoDeuda === "" ? finalTotal : saleMontoDeuda)
      : 0;
    const finalBalonesDeuda = (saleEstado === "debe_balon" || saleEstado === "debe_ambos")
      ? Number(saleCantDebaBalon === "" ? numQty : saleCantDebaBalon)
      : 0;
    const finalVaciosRecibidos = calcularVaciosRecibidos(numQty, saleEstado, finalBalonesDeuda);

    const tempId = "temp_" + Date.now();
    const now = new Date();
    const optimisticSale: SaleItem = {
      $id: tempId,
      id: tempId.slice(-6).toUpperCase(),
      fecha: now.toISOString(),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      client: saleClient.trim() || "Cliente General",
      cliente_nombre: saleClient.trim() || "Cliente General",
      tipo_cliente: saleClientType,
      tipo_balon: saleType,
      cantidad: numQty,
      precio_unitario: numPrice,
      total: finalTotal,
      forma_pago: salePayment,
      vacios_recibidos: finalVaciosRecibidos,
      estado: saleEstado,
      telefono: saleTelefono.trim(),
      ubicacion_url: saleUbicacionUrl.trim(),
      distrito: saleDistrito,
      observacion: saleObservacion.trim(),
      monto_deuda_soles: finalMontoDeuda,
      cant_deba_balon: finalBalonesDeuda,
    };

    // INSTANT UI CLOSING & UPDATE (0ms DELAY)
    setSalesList((prev) => [optimisticSale, ...prev]);
    setGalonesChofer((prev) => Math.max(0, Number(prev || 0) - numQty));
    setInventory((prev) => prev.map((item) => {
      if (item.tipo_balon === saleType && item.estado === "lleno") {
        return { ...item, cantidad: Math.max(0, item.cantidad - numQty) };
      }
      if (item.tipo_balon === saleType && item.estado === "vacío") {
        return { ...item, cantidad: item.cantidad + finalVaciosRecibidos };
      }
      return item;
    }));
    setModal(false);

    // Reset inputs immediately
    setSaleClient("");
    setSaleEstado("pendiente");
    setSalePayment("Por definir");
    setSaleTelefono("");
    setSaleUbicacionUrl("");
    setSaleObservacion("");
    setSaleMontoDeuda("");
    setSaleCantDebaBalon("");

    setSavingSale(true);
    try {
      await saveGalonesHoy(Math.max(0, Number(galonesChofer || 0) - numQty));
      await createVenta({
        cliente_nombre: optimisticSale.cliente_nombre!,
        tipo_cliente: saleClientType,
        tipo_balon: saleType,
        cantidad: numQty,
        precio_unitario: numPrice,
        total: finalTotal,
        forma_pago: salePayment,
        vacios_recibidos: finalVaciosRecibidos,
        usuario_id: currentUser?.$id || "session_user",
        estado: saleEstado,
        telefono: optimisticSale.telefono,
        ubicacion_url: optimisticSale.ubicacion_url,
        distrito: saleDistrito,
        observacion: optimisticSale.observacion,
        monto_deuda_soles: finalMontoDeuda,
        cant_deba_balon: finalBalonesDeuda,
      });
      await loadAppwriteContent();
    } catch (err: unknown) {
      console.error("Error saving sale:", err);
    } finally {
      setSavingSale(false);
    }
  }

  async function handleSaveRecarga(e: FormEvent) {
    e.preventDefault();
    if (recQtyNormal <= 0) return;
    const vaciosDisponibles = inventory
      .filter((i) => String(i.estado) === "vacío" || String(i.estado) === "vacio")
      .reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
    if (Number(recQtyNormal || 0) > vaciosDisponibles) {
      setRecargaError(`No hay suficientes envases vacios. Disponibles: ${vaciosDisponibles}.`);
      return;
    }
    setRecargaError("");
    setSavingRecarga(true);
    try {
      await createRecarga({
        tipo_balon: "Normal",
        cantidad_enviada: Number(recQtyNormal),
        costo_unitario: Number(recCostoUnitario),
        costo_total: Number(recQtyNormal) * Number(recCostoUnitario),
        proveedor: "Planta",
        usuario_id: currentUser?.$id || "session_user",
      });
      await loadAppwriteContent();
      setRecargaModal(false);
      setRecQtyNormal(0);
      setRecargaError("");
    } catch (err: unknown) {
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
    } catch {
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
    const diff = safeTarget - currentTotal;
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
    const sale = salesList.find(s => s.$id === id);
    if (sale) {
      const restoreQty = sale.cantidad || sale.qty || 1;
      const balonType = sale.tipo_balon || sale.type || "Normal";
      await updateInventoryStock(balonType, "lleno", restoreQty);
    }
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
    const recarga = recargasList.find((item) => item.$id === id);
    if (recarga) {
      const enviada = Number(recarga.cantidad_enviada || 0);
      const recibida = Number(recarga.cantidad_recibida || recarga.cantidad_enviada || 0);
      if (recarga.estado === "recibida") {
        if (recibida > 0) await updateInventoryStock(recarga.tipo_balon, "lleno", -recibida, true);
        if (enviada > 0) await updateInventoryStock(recarga.tipo_balon, "vacío", enviada, true);
      } else if (enviada > 0) {
        await updateInventoryStock(recarga.tipo_balon, "vacío", enviada, true);
      }
    }
    await deleteRecarga(id);
    await loadAppwriteContent();
  }

  function handleRequestDelete(type: "venta" | "cliente" | "gasto" | "recarga", id: string, label: string) {
    setDeleteTarget({ type, id, label });
  }

  function isNumericInput(target: HTMLInputElement) {
    return target?.tagName === "INPUT" && (target.type === "number" || target.inputMode === "numeric" || /^\d*$/.test(target.value));
  }

  function handleClearZeroOnFocus(event: React.FocusEvent<HTMLElement>) {
    const target = event.target as HTMLInputElement;
    if (isNumericInput(target) && target.value === "0") {
      setTimeout(() => target.select(), 0);
    }
  }

  function handleClearZeroOnKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLInputElement;
    if (!isNumericInput(target) || event.ctrlKey || event.altKey || event.metaKey) return;
    if (/^\d$/.test(event.key) && target.value === "0") {
      target.value = "";
    }
  }

  function handleCleanLeadingZeroOnInput(event: React.FormEvent<HTMLElement>) {
    const target = event.target as HTMLInputElement;
    if (!isNumericInput(target)) return;
    if (/^0\d+/.test(target.value)) {
      target.value = target.value.replace(/^0+/, "") || "0";
    }
  }

  if (checkingSession) return <main className="session-loading"><div className="session-spinner" /><b>VANIGAS</b><span>Verificando acceso...</span></main>;
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

  const costoBaseBalon = Number(precioProveedorBalon || 0);
  const costoTotalBalones = totalBalonesHoy * costoBaseBalon;
  const gananciaBruta = Math.max(0, totalVentasHoy - costoTotalBalones);
  const gananciaEstimada = Math.max(0, gananciaBruta - totalGastosHoy);

  const ventasEfectivo = selectedSales.filter(s => s.forma_pago === "Efectivo").reduce((acc, curr) => acc + Math.max(0, (curr.total || 0) - (curr.monto_deuda_soles || 0)), 0);
  const ventasDigitales = selectedSales.filter(s => s.forma_pago !== "Efectivo").reduce((acc, curr) => acc + Math.max(0, (curr.total || 0) - (curr.monto_deuda_soles || 0)), 0);

  const normalLleno = inventory.find(i => i.tipo_balon === "Normal" && i.estado === "lleno")?.cantidad || 0;
  const normalVacio = inventory.find(i => i.tipo_balon === "Normal" && i.estado === "vac\u00edo")?.cantidad || 0;
  const premiumLleno = inventory.find(i => i.tipo_balon === "Premium" && i.estado === "lleno")?.cantidad || 0;
  const premiumVacio = inventory.find(i => i.tipo_balon === "Premium" && i.estado === "vac\u00edo")?.cantidad || 0;

  const galonesLlenos = normalLleno + premiumLleno;
  const galonesVacios = normalVacio + premiumVacio;
  const galonesEnCarro = Number(galonesChofer || 0);
  const inventarioBruto = galonesLlenos + galonesVacios + galonesEnCarro;
  const capitalActualBalones = inventarioBruto * costoBaseBalon;
  const capitalFaltante = Math.max(0, capitalObjetivo - capitalActualBalones);
  const balonesFaltantesCapital = costoBaseBalon > 0 ? Math.ceil(capitalFaltante / costoBaseBalon) : 0;
  return <main className="app-shell" onFocusCapture={handleClearZeroOnFocus} onKeyDownCapture={handleClearZeroOnKeyDown} onInputCapture={handleCleanLeadingZeroOnInput}>
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo_vanigas.png" alt="Logotipo de VANIGAS" className="brand-logo" />
        <div className="brand-copy">
          <b>VANIGAS</b>
          <span>Control comercial</span>
        </div>
      </div>
      <nav aria-label="Navegacion principal">{visibleMenu.map((item) => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => setView(item.label)}>{item.label}</button>)}</nav>
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
        <section className="welcome-row"><div><h2>Buenos dias, {userName}</h2></div><button className="primary" onClick={() => setModal(true)}>Registrar venta</button></section>

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
          <StatCard label="Ganancia bruta" value={`S/ ${gananciaBruta.toFixed(2)}`} detail="Ventas - costo de balones" accent="blue" />
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
                  {(() => {
                    const formatSoles = (amount: number) => `S/ ${amount.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
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

                    const rawMax = Math.max(...values, 1);
                    const step = rawMax <= 500 ? 100 : rawMax <= 1500 ? 500 : rawMax <= 5000 ? 1000 : 5000;
                    const axisMax = Math.max(step, Math.ceil(rawMax / step) * step);
                    const axisLabels = [axisMax, Math.round(axisMax * 0.66), Math.round(axisMax * 0.33), 0];

                    return (
                      <>
                        <div className="axis">
                          {axisLabels.map((label, index) => <span key={index}>{formatSoles(label)}</span>)}
                        </div>
                        <div className="bars">
                          {values.map((val, idx) => {
                            const percentage = (val / axisMax) * 100;
                            const isLast = idx === values.length - 1;
                            const tone = val <= 0 ? "empty" : percentage >= 70 ? "high" : percentage >= 35 ? "mid" : "low";
                            return (
                              <div className={`bar-col ${range === "Mes" ? "bar-col-compact" : ""}`} key={idx} style={{ flex: 1, minWidth: range === "Anio" ? '32px' : range === "Mes" ? '26px' : '58px' }}>
                                <div className={`bar ${tone} ${isLast && val > 0 ? "best" : ""}`} style={{ height: `${Math.max(6, percentage)}%` }}>
                                  {val > 0 && <em>{formatSoles(val)}</em>}
                                </div>
                                <span>{labels[idx]}</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
                {(() => {
                  const yearlySales = salesList.filter((sale) => new Date(sale.fecha || Date.now()).getFullYear() === chartYear).reduce((acc, sale) => acc + (sale.total || 0), 0);
                  const yearlyExpenses = gastosList.filter((gasto) => new Date(gasto.fecha || Date.now()).getFullYear() === chartYear).reduce((acc, gasto) => acc + (gasto.monto || 0), 0);
                  const yearlyRechargeCost = recargasList
                    .filter((recarga) => new Date(recarga.fecha_envio || Date.now()).getFullYear() === chartYear)
                    .reduce((acc, recarga) => acc + Number(recarga.costo_total || ((recarga.cantidad_enviada || 0) * (recarga.costo_unitario || 0))), 0);
                  const yearlyProfit = Math.max(0, yearlySales - yearlyRechargeCost - yearlyExpenses);
                  const monthShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--color-rule)', paddingTop: '16px', marginTop: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                        <div className="year-finance-card">
                          <span>Total vendido del {"a\u00f1o"}</span>
                          <strong>S/ {yearlySales.toFixed(2)}</strong>
                          <small>Dinero total por ventas.</small>
                        </div>
                        <div className="year-finance-card">
                          <span>Costo real de recargas</span>
                          <strong>S/ {yearlyRechargeCost.toFixed(2)}</strong>
                          <small>Recargas registradas.</small>
                        </div>
                        <div className="year-finance-card">
                          <span>Gastos registrados</span>
                          <strong>S/ {yearlyExpenses.toFixed(2)}</strong>
                          <small>Gastos en la caja.</small>
                        </div>
                        <div className="year-finance-card year-finance-card-main">
                          <span>Ganancia estimada del {"a\u00f1o"} {chartYear}</span>
                          <strong>S/ {yearlyProfit.toFixed(2)}</strong>
                          <small>Ventas menos recargas reales y gastos.</small>
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
                                  S/ {mTotal.toLocaleString("es-PE", { maximumFractionDigits: 0 })}
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
                    const monthBalones = salesList.filter((sale) => { const d = new Date(sale.fecha || Date.now()); return d.getFullYear() === chartYear && d.getMonth() === monthIndex; }).reduce((acc, sale) => acc + (sale.cantidad || sale.qty || 0), 0);
                    const monthCOGS = monthBalones * Number(precioProveedorBalon || 0);
                    const monthProfit = Math.max(0, monthSales - monthCOGS - monthExpenses);
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

        <section className="panel sales-panel"><div className="panel-head"><div><h3>Ultimas ventas</h3></div><button onClick={() => setView("Ventas")}>Ver todas</button></div><SalesTable sales={selectedSales} onRequestDelete={handleRequestDelete} onEditVenta={handleOpenEditVenta} /></section>
      </div> : <ModuleView view={view} selectedDate={selectedDate} onAdd={() => setModal(true)} onAddGasto={() => setGastoModal(true)} onCierreCaja={() => setCierreModal(true)} onAddCliente={() => setClienteModal(true)} onAddRecarga={() => setRecargaModal(true)} onRecepcionar={handleRecepcionar} sales={selectedSales} allSales={salesList} inventory={inventory} clients={clientsList} gastos={selectedGastos} movimientos={selectedMovimientos} recargas={recargasList} onAdjust={handleAdjustStock} onSetAggregateStock={handleSetAggregateStock} onRequestDelete={handleRequestDelete} onEditVenta={handleOpenEditVenta} galonesChofer={galonesChofer} setGalonesChofer={setGalonesChofer} savingGalones={savingGalones} setSavingGalones={setSavingGalones} saveGalonesHoy={saveGalonesHoy} precioProveedorBalon={precioProveedorBalon} setPrecioProveedorBalon={setPrecioProveedorBalon} capitalObjetivo={capitalObjetivo} setCapitalObjetivo={setCapitalObjetivo} />}
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(false)}><section className="modal sales-modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal(false)}>x</button><span className="eyebrow">NUEVA OPERACION</span><h2>Registrar venta</h2><form onSubmit={handleSaveSale}>
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
        }} className="paste-whatsapp-button">Pegar datos desde WhatsApp</button>
      </div>
      <div className="form-grid sales-form-grid"><label>Nombre del cliente{clientsList.length > 0 ? <select value={saleClient} onChange={(e)=>{
        const selected = clientsList.find(c => c.nombre === e.target.value);
        setSaleClient(e.target.value);
        if (selected && selected.telefono) setSaleTelefono(selected.telefono.replace(/\D/g, "").slice(0, 9));
      }}><option value="">-- Seleccionar o escribir cliente --</option>{clientsList.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.tipo_cliente})</option>)}</select> : null}<input type="text" placeholder="Escribir nombre de cliente" value={saleClient} onChange={(e)=>setSaleClient(e.target.value)} required /></label><label>Telefono<input type="text" placeholder="Ej. 987654321" value={saleTelefono} onChange={(e)=>setSaleTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))} maxLength={9} inputMode="numeric" /></label><label>Distrito<select value={saleDistrito} onChange={(e)=>setSaleDistrito(e.target.value)}><option value="Mariano Melgar">Mariano Melgar</option><option value="Paucarpata">Paucarpata</option><option value="Miraflores">Miraflores</option><option value="Jose Luis Bustamante y Rivero">Jose Luis Bustamante y Rivero</option><option value="Cercado de Arequipa">Cercado de Arequipa</option></select></label><label>Enlace de ubicacion GPS<input type="text" placeholder="Ej. https://maps.google.com/..." value={saleUbicacionUrl} onChange={(e)=>setSaleUbicacionUrl(e.target.value)} /></label><label>Tipo de cliente<select value={saleClientType} onChange={(e)=>setSaleClientType(e.target.value)}><option value="Restaurante">Restaurante</option><option value="Negocio">Negocio</option><option value="Domicilio">Domicilio</option></select></label><label>Tipo de balon<select value={saleType} onChange={(e)=>{ setSaleType(e.target.value); setSalePrice(e.target.value === "Premium" ? 55 : 52); }}><option value="Normal">Normal</option><option value="Premium">Premium</option></select></label><label>Cantidad<input type="text" inputMode="numeric" value={saleQty} onChange={(e)=>{ const val = e.target.value.replace(/\D/g, ""); setSaleQty(val === "" ? "" : Number(val)); }} required /></label><label>Precio unitario (S/)<input type="text" inputMode="decimal" value={salePrice} onChange={(e)=>{ const val = e.target.value.replace(/[^0-9.]/g, ""); setSalePrice(val === "" ? "" : Number(val)); }} required /></label><label>Forma de pago<select value={salePayment} onChange={(e)=>setSalePayment(e.target.value)}><option value="Por definir">Por definir</option><option value="Efectivo">Efectivo</option><option value="Yape">Yape / Plin</option><option value="Credito">Credito</option></select></label><label>Estado de entrega<select value={saleEstado} onChange={(e)=>setSaleEstado(e.target.value)}><option value="pendiente">Pendiente</option><option value="confirmada">Completo</option><option value="debe_pago">Debe pagar</option><option value="debe_balon">Debe balon</option><option value="debe_ambos">Debe ambos</option></select></label>{(saleEstado === "debe_pago" || saleEstado === "debe_ambos") ? <label>Monto que debe dinero (S/)<input type="text" inputMode="decimal" placeholder={`Por defecto: S/ ${((saleQty === "" ? 1 : Number(saleQty)) * (salePrice === "" ? 52 : Number(salePrice))).toFixed(2)}`} value={saleMontoDeuda} onChange={(e)=>setSaleMontoDeuda(toDecimalInput(e.target.value))} /></label> : null}{(saleEstado === "debe_balon" || saleEstado === "debe_ambos") ? <label>Balones que debe (Cantidad envases)<input type="text" inputMode="numeric" placeholder={`Por defecto: ${saleQty === "" ? 1 : saleQty} balon(es)`} value={saleCantDebaBalon} onChange={(e)=>setSaleCantDebaBalon(toNumericInput(e.target.value))} /></label> : null}<label style={{ gridColumn: '1 / -1' }}>Observaciones<input type="text" placeholder="Ej. Notas especiales del pedido u observaciones de cobro" value={saleObservacion} onChange={(e)=>setSaleObservacion(e.target.value)} /></label></div><div className="sale-total" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Total venta</span>
          <strong>S/ {((saleQty === "" ? 1 : Number(saleQty)) * (salePrice === "" ? 52 : Number(salePrice))).toFixed(2)}</strong>
        </div>
        {(saleEstado === "debe_pago" || saleEstado === "debe_ambos") ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', fontSize: '13px' }}>
            <span style={{ color: '#991b1b', fontWeight: 700 }}>Debe dinero: S/ {Number(saleMontoDeuda === "" ? ((saleQty === "" ? 1 : Number(saleQty)) * (salePrice === "" ? 52 : Number(salePrice))) : saleMontoDeuda).toFixed(2)}</span>
            <span style={{ color: '#166534', fontWeight: 800 }}>Cobrado: S/ {Math.max(0, ((saleQty === "" ? 1 : Number(saleQty)) * (salePrice === "" ? 52 : Number(salePrice))) - Number(saleMontoDeuda === "" ? ((saleQty === "" ? 1 : Number(saleQty)) * (salePrice === "" ? 52 : Number(salePrice))) : saleMontoDeuda)).toFixed(2)}</span>
          </div>
        ) : null}
        {(saleEstado === "debe_balon" || saleEstado === "debe_ambos") ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: (saleEstado === "debe_ambos" ? '4px' : '8px'), borderTop: (saleEstado === "debe_ambos" ? 'none' : '1px dashed #cbd5e1'), fontSize: '13px' }}>
            <span style={{ color: '#991b1b', fontWeight: 700 }}>Debe balones: {saleCantDebaBalon === "" ? (saleQty === "" ? 1 : saleQty) : saleCantDebaBalon} envase(s)</span>
          </div>
        ) : null}
      </div><div className="modal-actions"><button type="button" onClick={()=>setModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingSale}>{savingSale ? "Guardando..." : "Guardar venta"}</button></div></form></section></div>}

    {clienteModal && <div className="modal-backdrop" onMouseDown={() => setClienteModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setClienteModal(false)}>x</button><span className="eyebrow">NUEVO CLIENTE</span><h2>Registrar cliente</h2><form onSubmit={handleSaveCliente}><div className="form-grid"><label>Nombre del cliente / Empresa<input type="text" placeholder="Ej. Cevicheria El Sabor" value={cliNombre} onChange={(e)=>setCliNombre(e.target.value)} required /></label><label>Telefono<input type="text" placeholder="Ej. 987654321" value={cliTelefono} onChange={(e)=>setCliTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))} maxLength={9} inputMode="numeric" /></label><label>Direccion<input type="text" placeholder="Ej. Av. Principal 123" value={cliDireccion} onChange={(e)=>setCliDireccion(e.target.value)} /></label><label>Tipo de cliente<select value={cliTipo} onChange={(e)=>setCliTipo(e.target.value)}><option value="Restaurante">Restaurante</option><option value="Negocio">Negocio</option><option value="Domicilio">Domicilio</option></select></label><label>Precio habitual (S/)<input type="text" inputMode="decimal" value={cliPrecioHabitual} onChange={(e)=>setCliPrecioHabitual(Number(toDecimalInput(e.target.value) || 0))} required /></label></div><div className="modal-actions"><button type="button" onClick={()=>setClienteModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingCliente}>{savingCliente ? "Guardando cliente..." : "Guardar cliente"}</button></div></form></section></div>}

    {recargaModal && <div className="modal-backdrop" onMouseDown={() => setRecargaModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setRecargaModal(false)} >x</button><span className="eyebrow">ENVIO A PLANTA</span><h2>Registrar envio a recarga</h2><form onSubmit={handleSaveRecarga}>{recargaError ? <div className="form-error-message">{recargaError}</div> : null}<div className="form-grid"><label>Cantidad de envases vacios<input type="text" inputMode="numeric" value={recQtyNormal === 0 ? "" : recQtyNormal} onChange={(e)=>{
      const val = e.target.value.replace(/\D/g, "");
      setRecQtyNormal(val === "" ? 0 : Number(val));
    }} placeholder="0" /></label><label>Costo por balon recargado (S/)<input type="text" inputMode="decimal" value={recCostoUnitario} onChange={(e)=>setRecCostoUnitario(Number(toDecimalInput(e.target.value) || 0))} required /></label><label>Total estimado de recarga<span style={{display:'block',padding:'12px 14px',border:'1px solid #cbd5e1',borderRadius:'8px',fontWeight:800,color:'#0f172a'}}>S/ {(Number(recQtyNormal || 0) * Number(recCostoUnitario || 0)).toFixed(2)}</span></label></div><div className="modal-actions"><button type="button" onClick={()=>setRecargaModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingRecarga}>{savingRecarga ? "Enviando..." : "Registrar envio a recarga"}</button></div></form></section></div>}

    {gastoModal && <div className="modal-backdrop" onMouseDown={() => setGastoModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setGastoModal(false)}>x</button><span className="eyebrow">REGISTRO DE GASTO</span><h2>Registrar gasto diario</h2><form onSubmit={handleSaveGasto}><div className="form-grid"><label>Concepto del gasto<input type="text" placeholder="Ej. Combustible moto repartidora" value={gastoConcepto} onChange={(e)=>setGastoConcepto(e.target.value)} required /></label><label>Categoria<select value={gastoCategoria} onChange={(e)=>setGastoCategoria(e.target.value)}><option value="Combustible">Combustible</option><option value="Reparto">Reparto</option><option value="Mantenimiento">Mantenimiento</option><option value="Personal">Personal</option><option value="Otros">Otros</option></select></label><label>Monto (S/)<input type="text" inputMode="decimal" value={gastoMonto} onChange={(e)=>setGastoMonto(Number(toDecimalInput(e.target.value) || 0))} required /></label><label>Forma de pago<select value={gastoPago} onChange={(e)=>setGastoPago(e.target.value)}><option value="Efectivo">Efectivo</option><option value="Yape">Yape / Plin</option><option value="Transferencia">Transferencia</option></select></label></div><div className="modal-actions"><button type="button" onClick={()=>setGastoModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingGasto}>{savingGasto ? "Guardando gasto..." : "Guardar gasto"}</button></div></form></section></div>}

    {cierreModal && <div className="modal-backdrop" onMouseDown={() => setCierreModal(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setCierreModal(false)}>x</button><span className="eyebrow">ARQUEO DIARIO</span><h2>Cierre de caja del dia</h2><form onSubmit={(e) => handleSaveCierre(e, (ventasEfectivo - totalGastosHoy), ventasEfectivo, ventasDigitales, totalGastosHoy)}><div className="form-grid"><label>Ventas en efectivo<span>S/ {ventasEfectivo.toFixed(2)}</span></label><label>Ventas digitales (Yape/Plin)<span>S/ {ventasDigitales.toFixed(2)}</span></label><label>Gastos del dia<span>S/ {totalGastosHoy.toFixed(2)}</span></label><label>Saldo esperado en efectivo<strong>S/ {(ventasEfectivo - totalGastosHoy).toFixed(2)}</strong></label><label>Saldo real contado en caja (S/)<input type="text" inputMode="decimal" value={cierreSaldoReal} onChange={(e)=>setCierreSaldoReal(Number(toDecimalInput(e.target.value) || 0))} required /></label><label>Observacion<input type="text" placeholder="Observaciones del cierre" value={cierreObs} onChange={(e)=>setCierreObs(e.target.value)} /></label></div><div className="modal-actions"><button type="button" onClick={()=>setCierreModal(false)}>Cancelar</button><button type="submit" className="primary" disabled={savingCierre}>{savingCierre ? "Cerrando caja..." : "Confirmar Cierre de Caja"}</button></div></form></section></div>}

    {deleteTarget && <div className="modal-backdrop" onMouseDown={() => setDeleteTarget(null)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setDeleteTarget(null)}>x</button><span className="eyebrow" style={{color:'#c74e49'}}>CONFIRMAR ELIMINACION</span><h2>Eliminar registro?</h2><p style={{margin:'12px 0 24px',color:'#64748b',fontSize:'14px'}}>Esta seguro de que desea eliminar <b>{deleteTarget.label}</b>? Esta accion se aplicara en tiempo real en Appwrite.</p><div className="modal-actions"><button type="button" onClick={()=>setDeleteTarget(null)}>Cancelar</button><button type="button" className="primary" style={{background:'#c74e49'}} disabled={deletingItem} onClick={async ()=>{ setDeletingItem(true); try { if (deleteTarget.type === "venta") await handleDeleteVenta(deleteTarget.id); else if (deleteTarget.type === "cliente") await handleDeleteCliente(deleteTarget.id); else if (deleteTarget.type === "gasto") await handleDeleteGasto(deleteTarget.id); else if (deleteTarget.type === "recarga") await handleDeleteRecarga(deleteTarget.id); } finally { setDeletingItem(false); setDeleteTarget(null); } }}>{deletingItem ? "Eliminando..." : "Si, eliminar"}</button></div></section></div>}

    {editingSale && (
      <div className="modal-backdrop" onMouseDown={() => setEditingSale(null)}>
        <section className="modal sales-modal" onMouseDown={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setEditingSale(null)}>x</button>
          <span className="eyebrow">EDITAR OPERACION</span>
          <h2>Editar venta #{editingSale.id || editingSale.$id?.slice(-6).toUpperCase()}</h2>
          <form onSubmit={handleSaveEditVenta}>
            <div className="form-grid sales-form-grid">
              <label>Nombre del cliente
                <input
                  type="text"
                  placeholder="Escribir nombre de cliente"
                  value={editClient}
                  onChange={(e) => setEditClient(e.target.value)}
                  required
                />
              </label>

              <label>Telefono
                <input
                  type="text"
                  placeholder="Ej. 987654321"
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  maxLength={9}
                  inputMode="numeric"
                />
              </label>

              <label>Distrito
                <select value={editDistrito} onChange={(e) => setEditDistrito(e.target.value)}>
                  <option value="Mariano Melgar">Mariano Melgar</option>
                  <option value="Paucarpata">Paucarpata</option>
                  <option value="Miraflores">Miraflores</option>
                  <option value="Jose Luis Bustamante y Rivero">Jose Luis Bustamante y Rivero</option>
                  <option value="Cercado de Arequipa">Cercado de Arequipa</option>
                </select>
              </label>

              <label>Enlace de ubicacion GPS
                <input
                  type="text"
                  placeholder="Ej. https://maps.google.com/..."
                  value={editUbicacionUrl}
                  onChange={(e) => setEditUbicacionUrl(e.target.value)}
                />
              </label>

              <label>Tipo de cliente
                <select value={editClientType} onChange={(e) => setEditClientType(e.target.value)}>
                  <option value="Restaurante">Restaurante</option>
                  <option value="Negocio">Negocio</option>
                  <option value="Domicilio">Domicilio</option>
                </select>
              </label>

              <label>Tipo de balon
                <select value={editType} onChange={(e) => { setEditType(e.target.value); setEditPrice(e.target.value === "Premium" ? 55 : 52); }}>
                  <option value="Normal">Normal</option>
                  <option value="Premium">Premium</option>
                </select>
              </label>

              <label>Cantidad
                <input
                  type="text"
                  inputMode="numeric"
                  value={editQty}
                  onChange={(e) => { const val = e.target.value.replace(/\D/g, ""); setEditQty(val === "" ? "" : Number(val)); }}
                  required
                />
              </label>

              <label>Precio unitario (S/)
                <input
                  type="text"
                  inputMode="decimal"
                  value={editPrice}
                  onChange={(e) => { const val = e.target.value.replace(/[^0-9.]/g, ""); setEditPrice(val === "" ? "" : Number(val)); }}
                  required
                />
              </label>

              <label>Forma de Pago
                <select value={editFormaPago} onChange={(e) => setEditFormaPago(e.target.value)}>
                  <option value="Por definir">Por definir</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Yape">Yape / Plin</option>
                  <option value="Credito">Credito</option>
                </select>
              </label>

              <label>Estado de entrega
                <select value={editEstado} onChange={(e) => setEditEstado(e.target.value)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="confirmada">Completo</option>
                  <option value="debe_pago">Debe pagar</option>
                  <option value="debe_balon">Debe balon</option>
                  <option value="debe_ambos">Debe ambos</option>
                </select>
              </label>

              {(editEstado === "debe_pago" || editEstado === "debe_ambos") ? (
                <label>Monto que debe dinero (S/)
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={`Por defecto: S/ ${((editQty === "" ? 1 : Number(editQty)) * (editPrice === "" ? 52 : Number(editPrice))).toFixed(2)}`}
                    value={editMontoDeuda}
                    onChange={(e) => setEditMontoDeuda(toDecimalInput(e.target.value))}
                  />
                </label>
              ) : null}

              {(editEstado === "debe_balon" || editEstado === "debe_ambos") ? (
                <label>Balones que debe (Cantidad envases)
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={`Por defecto: ${editQty === "" ? 1 : editQty} balon(es)`}
                    value={editCantDebaBalon}
                    onChange={(e) => setEditCantDebaBalon(toNumericInput(e.target.value))}
                  />
                </label>
              ) : null}

              <label style={{ gridColumn: '1 / -1' }}>Observaciones
                <input
                  type="text"
                  placeholder="Ej. Notas especiales del pedido u observaciones de cobro"
                  value={editObservacion}
                  onChange={(e) => setEditObservacion(e.target.value)}
                />
              </label>
            </div>

            <div className="sale-total" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Total venta</span>
                <strong>S/ {((editQty === "" ? 1 : Number(editQty)) * (editPrice === "" ? 52 : Number(editPrice))).toFixed(2)}</strong>
              </div>
              {(editEstado === "debe_pago" || editEstado === "debe_ambos") ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', fontSize: '13px' }}>
                  <span style={{ color: '#991b1b', fontWeight: 700 }}>Debe dinero: S/ {Number(editMontoDeuda === "" ? ((editQty === "" ? 1 : Number(editQty)) * (editPrice === "" ? 52 : Number(editPrice))) : editMontoDeuda).toFixed(2)}</span>
                  <span style={{ color: '#166534', fontWeight: 800 }}>Cobrado: S/ {Math.max(0, ((editQty === "" ? 1 : Number(editQty)) * (editPrice === "" ? 52 : Number(editPrice))) - Number(editMontoDeuda === "" ? ((editQty === "" ? 1 : Number(editQty)) * (editPrice === "" ? 52 : Number(editPrice))) : editMontoDeuda)).toFixed(2)}</span>
                </div>
              ) : null}
              {(editEstado === "debe_balon" || editEstado === "debe_ambos") ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: (editEstado === "debe_ambos" ? '4px' : '8px'), borderTop: (editEstado === "debe_ambos" ? 'none' : '1px dashed #cbd5e1'), fontSize: '13px' }}>
                  <span style={{ color: '#991b1b', fontWeight: 700 }}>Debe balones: {editCantDebaBalon === "" ? (editQty === "" ? 1 : editQty) : editCantDebaBalon} envase(s)</span>
                </div>
              ) : null}
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button type="button" onClick={() => setEditingSale(null)}>Cancelar</button>
              <button type="submit" className="primary" disabled={savingEditVenta}>
                {savingEditVenta ? "Actualizando..." : "Actualizar venta"}
              </button>
            </div>
          </form>
        </section>
      </div>
    )}
  </main>;
}

interface ModuleViewProps {
  view: View;
  selectedDate: string;
  onAdd: () => void;
  onAddGasto: () => void;
  onCierreCaja: () => void;
  onAddCliente: () => void;
  onAddRecarga: () => void;
  onRecepcionar: (id: string, tipo: string, qty: number) => void;
  sales: SaleItem[];
  allSales: SaleItem[];
  inventory: InventoryItem[];
  clients: ClientItem[];
  gastos: GastoItem[];
  movimientos: MovementItem[];
  recargas: RecargaItem[];
  onAdjust: (tipo: string, estado: string, delta: number) => void;
  onSetAggregateStock: (estado: "lleno" | "vacío", target: number) => Promise<void>;
  onRequestDelete?: (type: "venta" | "cliente" | "gasto" | "recarga", id: string, label: string) => void;
  onEditVenta?: (sale: SaleItem) => void;
  galonesChofer: string | number;
  setGalonesChofer: React.Dispatch<React.SetStateAction<string | number>>;
  savingGalones: boolean;
  setSavingGalones: React.Dispatch<React.SetStateAction<boolean>>;
  saveGalonesHoy: (galones: number) => Promise<void>;
  precioProveedorBalon: number;
  setPrecioProveedorBalon: React.Dispatch<React.SetStateAction<number>>;
  capitalObjetivo: number;
  setCapitalObjetivo: React.Dispatch<React.SetStateAction<number>>;
}

function ModuleView({ view, selectedDate, onAdd, onAddGasto, onCierreCaja, onAddCliente, onAddRecarga, onRecepcionar, sales, allSales, inventory, clients, gastos, movimientos, recargas, onSetAggregateStock, onRequestDelete, onEditVenta, galonesChofer, setGalonesChofer, saveGalonesHoy, precioProveedorBalon, setPrecioProveedorBalon, capitalObjetivo, setCapitalObjetivo }: ModuleViewProps) {
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
  const totalCobrado = sales.reduce((a, b) => a + getSaleDebtInfo(b).charged, 0);
  const totalEfectivo = sales.filter(s => s.forma_pago === "Efectivo").reduce((a, b) => a + getSaleDebtInfo(b).charged, 0);
  const totalDigital = sales.filter(s => s.forma_pago !== "Efectivo").reduce((a, b) => a + getSaleDebtInfo(b).charged, 0);
  const totalYape = sales.filter(s => s.forma_pago === "Yape").reduce((a, b) => a + getSaleDebtInfo(b).charged, 0);
  const totalTransferencia = sales.filter(s => s.forma_pago === "Transferencia").reduce((a, b) => a + getSaleDebtInfo(b).charged, 0);
  const totalCredito = sales.filter(s => s.forma_pago === "Credito" || s.forma_pago === "Crédito").reduce((a, b) => a + getSaleDebtInfo(b).charged, 0);
  const totalPorDefinir = sales.filter(s => s.forma_pago === "Por definir").reduce((a, b) => a + getSaleDebtInfo(b).charged, 0);

  const modSalesDeudorasPago = sales.filter(s => getSaleDebtInfo(s).moneyDebt > 0);
  const modVentasDeudorasSoles = modSalesDeudorasPago.reduce((acc, curr) => acc + getSaleDebtInfo(curr).moneyDebt, 0);
  const modSalesDeudorasBalon = sales.filter(s => getSaleDebtInfo(s).cylinderDebt > 0);
  const modVentasDeudorasBalones = modSalesDeudorasBalon.reduce((acc, curr) => acc + getSaleDebtInfo(curr).cylinderDebt, 0);
  const modSalesDeudorasTotales = sales.filter(s => getSaleDebtInfo(s).hasDebt);
  const modTotalDeudorasCount = modSalesDeudorasTotales.length;
  const moduleCostoBaseBalon = Number(precioProveedorBalon || 0);
  const moduleGalonesLlenos = inventory.filter(i => i.estado === "lleno").reduce((a, b) => a + b.cantidad, 0);
  const moduleGalonesVacios = inventory.filter(i => i.estado === "vac\u00edo").reduce((a, b) => a + b.cantidad, 0);
  const [draftGalonesLlenos, setDraftGalonesLlenos] = useState(moduleGalonesLlenos);
  const [draftGalonesVacios, setDraftGalonesVacios] = useState(moduleGalonesVacios);
  const [driveBackupState, setDriveBackupState] = useState<"idle" | "connecting" | "saving" | "success" | "error">("idle");
  const [driveBackupMessage, setDriveBackupMessage] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setDraftGalonesLlenos(moduleGalonesLlenos);
      setDraftGalonesVacios(moduleGalonesVacios);
    });
  }, [moduleGalonesLlenos, moduleGalonesVacios]);

  const llenoDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const vacioDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const choferDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleLlenosInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    const num = val === "" ? 0 : Number(val);
    setDraftGalonesLlenos(num);
    if (llenoDebounceRef.current) clearTimeout(llenoDebounceRef.current);
    llenoDebounceRef.current = setTimeout(() => {
      onSetAggregateStock("lleno", num);
    }, 400);
  };

  const handleVaciosInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    const num = val === "" ? 0 : Number(val);
    setDraftGalonesVacios(num);
    if (vacioDebounceRef.current) clearTimeout(vacioDebounceRef.current);
    vacioDebounceRef.current = setTimeout(() => {
      onSetAggregateStock("vacío", num);
    }, 400);
  };

  const handleChoferInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    setGalonesChofer(val);
    const num = val === "" ? 0 : Number(val);
    if (choferDebounceRef.current) clearTimeout(choferDebounceRef.current);
    choferDebounceRef.current = setTimeout(() => {
      saveGalonesHoy(num);
    }, 400);
  };

  const [rawPrecioProveedor, setRawPrecioProveedor] = useState<string>(() => String(precioProveedorBalon || "44.3"));

  useEffect(() => {
    if (Number(rawPrecioProveedor || 0) !== precioProveedorBalon) {
      queueMicrotask(() => setRawPrecioProveedor(String(precioProveedorBalon || "")));
    }
  }, [precioProveedorBalon, rawPrecioProveedor]);

  const handlePrecioProveedorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9.]/g, "");
    const parts = val.split(".");
    if (parts.length > 2) {
      val = parts[0] + "." + parts.slice(1).join("");
    }
    setRawPrecioProveedor(val);
    const num = val === "" || val === "." ? 0 : Number(val);
    setPrecioProveedorBalon(num);
    try {
      localStorage.setItem("vanigas:precio_proveedor", val);
    } catch {}
  };

  // Capital disponible para recarga State
  const [capitalDisponibleRecarga, setCapitalDisponibleRecarga] = useState<number>(() => {
    if (typeof window === "undefined") return 1000;
    const saved = localStorage.getItem("vanigas:capital_disponible");
    const num = Number(saved);
    return Number.isFinite(num) && num >= 0 ? num : 1000;
  });

  const [rawCapitalDisponible, setRawCapitalDisponible] = useState<string>(() => String(capitalDisponibleRecarga));

  useEffect(() => {
    if (Number(rawCapitalDisponible || 0) !== capitalDisponibleRecarga) {
      queueMicrotask(() => setRawCapitalDisponible(String(capitalDisponibleRecarga || "")));
    }
  }, [capitalDisponibleRecarga, rawCapitalDisponible]);

  const handleCapitalDisponibleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9.]/g, "");
    const parts = val.split(".");
    if (parts.length > 2) {
      val = parts[0] + "." + parts.slice(1).join("");
    }
    setRawCapitalDisponible(val);
    const num = val === "" || val === "." ? 0 : Number(val);
    setCapitalDisponibleRecarga(num);
    try {
      localStorage.setItem("vanigas:capital_disponible", String(num));
    } catch {}
  };

  // Inventory Snapshot History State
  interface InventorySnapshot {
    id: string;
    fecha: string;
    balonesLlenos: number;
    balonesVacios: number;
    balonesCarro: number;
    precioProveedor: number;
    capitalDisponible: number;
    observacion?: string;
    inversionGas: number;
    presupuestoRecarga: number;
    creadoEn: string;
  }

  const [inventorySnapshots, setInventorySnapshots] = useState<InventorySnapshot[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("vanigas:inventory_snapshots");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modal State for New Inventory Snapshot
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotConfirmOpen, setSnapshotConfirmOpen] = useState(false);
  const [snapFecha, setSnapFecha] = useState(() => new Date().toISOString().split("T")[0]);
  const [snapLlenos, setSnapLlenos] = useState<number | "">(moduleGalonesLlenos);
  const [snapVacios, setSnapVacios] = useState<number | "">(moduleGalonesVacios);
  const [snapCarro, setSnapCarro] = useState<number | "">(Number(galonesChofer || 0));
  const [snapPrecio, setSnapPrecio] = useState<number | "">(moduleCostoBaseBalon || 44.30);
  const [snapCapital, setSnapCapital] = useState<number | "">(capitalDisponibleRecarga);
  const [snapObs, setSnapObs] = useState("");
  const [snapError, setSnapError] = useState("");

  const openNewSnapshotModal = () => {
    setSnapFecha(new Date().toISOString().split("T")[0]);
    setSnapLlenos(moduleGalonesLlenos);
    setSnapVacios(moduleGalonesVacios);
    setSnapCarro(Number(galonesChofer || 0));
    setSnapPrecio(moduleCostoBaseBalon || 44.30);
    setSnapCapital(capitalDisponibleRecarga);
    setSnapObs("");
    setSnapError("");
    setSnapshotModalOpen(true);
  };

  const handleValidateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    setSnapError("");
    const llenos = snapLlenos === "" ? 0 : Number(snapLlenos);
    const vacios = snapVacios === "" ? 0 : Number(snapVacios);
    const carro = snapCarro === "" ? 0 : Number(snapCarro);
    const precio = snapPrecio === "" ? 0 : Number(snapPrecio);
    const capital = snapCapital === "" ? 0 : Number(snapCapital);

    if (llenos < 0 || vacios < 0 || carro < 0) {
      setSnapError("Las cantidades de balones no pueden ser negativas.");
      return;
    }
    if (!Number.isInteger(llenos) || !Number.isInteger(vacios) || !Number.isInteger(carro)) {
      setSnapError("Las cantidades de balones deben ser numeros enteros.");
      return;
    }
    if (precio < 0 || capital < 0) {
      setSnapError("El precio y el capital no pueden ser negativos.");
      return;
    }
    setSnapshotConfirmOpen(true);
  };

  const handleSaveSnapshotConfirmed = async () => {
    const llenos = snapLlenos === "" ? 0 : Number(snapLlenos);
    const vacios = snapVacios === "" ? 0 : Number(snapVacios);
    const carro = snapCarro === "" ? 0 : Number(snapCarro);
    const precio = snapPrecio === "" ? 0 : Number(snapPrecio);
    const capital = snapCapital === "" ? 0 : Number(snapCapital);

    const invGas = llenos * precio;
    const presRecarga = vacios * precio;

    const newSnap: InventorySnapshot = {
      id: Date.now().toString(),
      fecha: snapFecha || new Date().toISOString().split("T")[0],
      balonesLlenos: llenos,
      balonesVacios: vacios,
      balonesCarro: carro,
      precioProveedor: precio,
      capitalDisponible: capital,
      observacion: snapObs.trim(),
      inversionGas: invGas,
      presupuestoRecarga: presRecarga,
      creadoEn: new Date().toISOString()
    };

    const updated = [newSnap, ...inventorySnapshots];
    setInventorySnapshots(updated);
    try {
      localStorage.setItem("vanigas:inventory_snapshots", JSON.stringify(updated));
    } catch {}

    // Apply snapshot to current active stock in real time
    await onSetAggregateStock("lleno", llenos);
    await onSetAggregateStock("vacío", vacios);
    setGalonesChofer(carro);
    await saveGalonesHoy(carro);
    setSnapshotConfirmOpen(false);
    setSnapshotModalOpen(false);
  };

  // Quick Movement Modal State
  const [quickMovType, setQuickMovType] = useState<string>("Recarga");
  const [quickMovQty, setQuickMovQty] = useState<number | "">(10);
  const [quickMovEstado, setQuickMovEstado] = useState<string>("lleno");
  const [quickMovOrigen, setQuickMovOrigen] = useState<string>("Planta NEWGAS");
  const [quickMovDestino, setQuickMovDestino] = useState<string>("Almacen principal");
  const [quickMovChofer, setQuickMovChofer] = useState<string>("Humberto");
  const [quickMovResponsable, setQuickMovResponsable] = useState<string>("Administrador");
  const [quickMovObs, setQuickMovObs] = useState<string>("");
  const [movementModalOpen, setMovementModalOpen] = useState(false);

  const openQuickMovementModal = (type: string = "Recarga") => {
    setQuickMovType(type);
    if (type === "Recarga") {
      setQuickMovOrigen("Planta NEWGAS");
      setQuickMovDestino("Almacen principal");
      setQuickMovEstado("lleno");
    } else if (type === "Venta") {
      setQuickMovOrigen("Vehiculo 01");
      setQuickMovDestino("Clientes");
      setQuickMovEstado("lleno");
    } else if (type === "Asignacion a vehiculo") {
      setQuickMovOrigen("Almacen principal");
      setQuickMovDestino("Vehiculo 01");
      setQuickMovEstado("lleno");
    } else if (type === "Retorno de vehiculo") {
      setQuickMovOrigen("Vehiculo 01");
      setQuickMovDestino("Almacen principal");
      setQuickMovEstado("vacio");
    } else if (type === "Perdida" || type === "Dano") {
      setQuickMovOrigen("Almacen principal");
      setQuickMovDestino("Balones observados");
      setQuickMovEstado("vacio");
    } else {
      setQuickMovOrigen("Almacen principal");
      setQuickMovDestino("Ajuste");
      setQuickMovEstado("lleno");
    }
    setMovementModalOpen(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = quickMovQty === "" ? 0 : Number(quickMovQty);
    if (qty <= 0) return;

    if (quickMovType === "Recarga") {
      const newVacios = Math.max(0, moduleBalonesVacios - qty);
      const newLlenos = moduleBalonesLlenos + qty;
      await onSetAggregateStock("vacío", newVacios);
      await onSetAggregateStock("lleno", newLlenos);
    } else if (quickMovType === "Venta") {
      const newLlenos = Math.max(0, moduleBalonesLlenos - qty);
      const newVacios = moduleBalonesVacios + qty;
      await onSetAggregateStock("lleno", newLlenos);
      await onSetAggregateStock("vacío", newVacios);
    } else if (quickMovType === "Asignacion a vehiculo") {
      const newLlenos = Math.max(0, moduleBalonesLlenos - qty);
      const newCarro = moduleBalonesEnCarro + qty;
      await onSetAggregateStock("lleno", newLlenos);
      setGalonesChofer(newCarro);
      await saveGalonesHoy(newCarro);
    } else if (quickMovType === "Retorno de vehiculo") {
      const newCarro = Math.max(0, moduleBalonesEnCarro - qty);
      const newVacios = moduleBalonesVacios + qty;
      setGalonesChofer(newCarro);
      await saveGalonesHoy(newCarro);
      await onSetAggregateStock("vacío", newVacios);
    }

    setMovementModalOpen(false);
  };

  const moduleBalonesLlenos = moduleGalonesLlenos;
  const moduleBalonesVacios = moduleGalonesVacios;
  const moduleBalonesEnCarro = Number(galonesChofer || 0);
  const moduleBalonesPendientes = modVentasDeudorasBalones;
  const moduleTotalBalones = moduleBalonesLlenos + moduleBalonesVacios + moduleBalonesEnCarro;
  const moduleTotalControlado = moduleTotalBalones + moduleBalonesPendientes;

  const inversionActualGas = moduleBalonesLlenos * moduleCostoBaseBalon;
  const presupuestoRecarga = moduleBalonesVacios * moduleCostoBaseBalon;
  const capitalDisponibleNum = Number(capitalDisponibleRecarga || 0);
  const montoFaltante = Math.max(0, presupuestoRecarga - capitalDisponibleNum);
  const capacidadRecargaCount = Math.min(moduleBalonesVacios, Math.floor(capitalDisponibleNum / (moduleCostoBaseBalon || 1)));
  const pendientesBalonesRecarga = Math.max(0, moduleBalonesVacios - capacidadRecargaCount);
  const capitalActualControlado = moduleTotalControlado * moduleCostoBaseBalon;
  const capitalObjetivoNum = Number(capitalObjetivo || 0);
  const capitalFaltanteObjetivo = Math.max(0, capitalObjetivoNum - capitalActualControlado);
  const balonesFaltantesObjetivo = moduleCostoBaseBalon > 0 ? Math.ceil(capitalFaltanteObjetivo / moduleCostoBaseBalon) : 0;
  const vendidosHoyInventario = sales.reduce((a, b) => a + (b.cantidad || b.qty || 0), 0);
  const restanCarroHoy = Math.max(0, moduleBalonesEnCarro - vendidosHoyInventario);
  const ventasHistoricas = allSales.length > 0 ? allSales : sales;
  const ahoraInventario = new Date();
  const getSaleDate = (sale: SaleItem) => {
    const raw = sale.fecha || (sale as SaleItem & AppwriteTimestamp).$createdAt || new Date().toISOString();
    const key = rowDateKey(raw);
    const parsed = new Date(`${key}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? ahoraInventario : parsed;
  };
  const ventasUltimos7 = ventasHistoricas.filter((sale) => {
    const fecha = getSaleDate(sale);
    const diff = (ahoraInventario.getTime() - fecha.getTime()) / 86400000;
    return diff >= 0 && diff < 7;
  });
  const ventasUltimos30 = ventasHistoricas.filter((sale) => {
    const fecha = getSaleDate(sale);
    const diff = (ahoraInventario.getTime() - fecha.getTime()) / 86400000;
    return diff >= 0 && diff < 30;
  });
  const balonesVendidos7 = ventasUltimos7.reduce((a, b) => a + (b.cantidad || b.qty || 0), 0);
  const balonesVendidos30 = ventasUltimos30.reduce((a, b) => a + (b.cantidad || b.qty || 0), 0);
  const promedioDiario7 = balonesVendidos7 / 7;
  const promedioDiario30 = balonesVendidos30 / 30;
  const demandaReferencia = Math.max(promedioDiario7, promedioDiario30);
  const stockRecomendado7Dias = Math.ceil(demandaReferencia * 7);
  const compraSugeridaBalones = Math.max(0, stockRecomendado7Dias - moduleBalonesLlenos);
  const inversionSugerida = compraSugeridaBalones * moduleCostoBaseBalon;

  const handleCapitalObjetivoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.]/g, "");
    const num = val === "" || val === "." ? 0 : Number(val);
    setCapitalObjetivo(Number.isFinite(num) ? num : 0);
  };

  function handleExportExcel() {
    if (view === "Ventas") {
      exportToCSV("Ventas_VANIGAS.csv", sales.map(s => ({
        "Venta ID": s.id || s.$id,
        "Hora": s.time || "Ahora",
        "Cliente": s.client || s.cliente_nombre,
        "Tipo Balon": s.tipo_balon || s.type,
        "Cantidad": s.cantidad || s.qty,
        "Precio Unitario": s.precio_unitario || s.price,
        "Total (S/)": s.total,
        "Forma de Pago": s.forma_pago || s.payment
      })));
    } else if (view === "Inventario") {
      exportToCSV("Inventario_VANIGAS.csv", inventory.map(i => ({
        "Tipo de Balon": i.tipo_balon,
        "Estado": i.estado,
        "Cantidad": i.cantidad,
        "Stock Minimo": i.stock_minimo ?? 5
      })));
    } else if (view === "Clientes") {
      exportToCSV("Clientes_VANIGAS.csv", clients.map(c => ({
        "Nombre": c.nombre,
        "Telefono": c.telefono || "",
        "Direccion": c.direccion || "",
        "Tipo Cliente": c.tipo_cliente,
        "Precio Habitual": c.precio_habitual || 52
      })));
    } else if (view === "Movimientos") {
      exportToCSV("Movimientos_VANIGAS.csv", movimientos.map(m => ({
        "Fecha": m.fecha ? new Date(m.fecha).toLocaleString() : "Hoy",
        "Tipo Movimiento": m.tipo_movimiento,
        "Tipo Balon": m.tipo_balon,
        "Estado Balon": m.estado_balon,
        "Cantidad": m.cantidad,
        "Observacion": m.observacion || ""
      })));
    } else if (view === "Recargas") {
      exportToCSV("Recargas_VANIGAS.csv", recargas.map(r => ({
        "Fecha envio": r.fecha_envio ? new Date(r.fecha_envio).toLocaleString() : "Hoy",
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
        "Balon": s.tipo_balon || s.type,
        "Cantidad": s.cantidad || s.qty,
        "Total": s.total
      })));
    }
  }

  function handleDownloadPDF() {
    const summary = [
      { label: "Ventas Totales", value: `S/ ${totalVentas.toFixed(2)}` },
      { label: "Gastos del Dia", value: `S/ ${totalGastos.toFixed(2)}` },
      { label: "Ganancia Estimada", value: `S/ ${Math.max(0, totalVentas - (sales.reduce((a,b)=>a+(b.cantidad||b.qty||0),0) * Number(precioProveedorBalon || 0)) - totalGastos).toFixed(2)}` },
      { label: "Balones Vendidos", value: `${sales.reduce((a,b)=>a+(b.cantidad||b.qty||0),0)} unidades` },
    ];
    const headers = ["Venta ID", "Hora", "Cliente", "Balon", "Cant.", "Precio", "Total (S/)", "Pago"];
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
    const readJsonResponse = async (response: Response) => {
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();

      if (!contentType.includes("application/json")) {
        throw new Error(text.includes("<!DOCTYPE")
          ? "La API respondio una pagina HTML. Revisa el despliegue de Vercel y vuelve a intentar."
          : text || "La API no respondio en formato JSON.");
      }

      const data = JSON.parse(text || "{}");
      if (!response.ok) {
        throw new Error(data?.error || data?.message || "No se pudo completar la operacion.");
      }

      return data;
    };

    try {
      setDriveBackupState("connecting");
      setDriveBackupMessage("Verificando conexion con Google Drive...");

      const status = await fetch("/api/google/status").then(readJsonResponse);
      if (!status.connected) {
        setDriveBackupMessage("Se abrira Google para autorizar Drive. Luego vuelve y presiona este boton otra vez.");
        window.location.href = "/api/google/auth";
        return;
      }

      setDriveBackupState("saving");
      setDriveBackupMessage("Generando archivo Excel y guardandolo directamente en Google Drive...");

      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `Backup_VANIGAS_${dateStr}.xlsx`;
      
      const res = await fetch("/api/backup-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales, inventory, gastos, recargas, clients, movimientos })
      });

      const data = await readJsonResponse(res);
      if (!data.success) {
        throw new Error(data.error || "Error al conectar con Drive");
      }

      setDriveBackupState("success");
      setDriveBackupMessage(`Copia guardada correctamente en Google Drive: ${data.folderPath ? `${data.folderPath} / ` : ""}${data.filename || filename}`);
    } catch (err: unknown) {
      console.error("Error en respaldo directo a Drive:", err);
      setDriveBackupState("error");
      setDriveBackupMessage(getErrorMessage(err, "No se pudo guardar en Google Drive."));
    }
  }

  return <div className="content module-content">
    <section className="welcome-row">
      <div><h2>{copy[view]?.[0] || view}</h2></div>
      <div style={{display:'flex',gap:'10px'}}>
        {view === "Caja" ? <button className="primary" style={{background:'#c74e49'}} onClick={onAddGasto}>Registrar gasto</button> : null}
        {view === "Caja" ? <button className="primary" onClick={onCierreCaja}>Cerrar caja del dia</button> : view === "Clientes" ? <button className="primary" onClick={onAddCliente}>Registrar cliente</button> : view === "Recargas" ? <button className="primary" onClick={onAddRecarga}>Registrar envio a recarga</button> : view === "Inventario" ? <button className="primary" onClick={openNewSnapshotModal}>Nuevo registro</button> : <button className="primary" onClick={onAdd}>Nuevo registro</button>}
      </div>
    </section>

    {view === "Inventario" ? (
      <div className="inventory-admin">
        <section className="inventory-admin-hero">
          <div>
            <p className="eyebrow">Control administrativo</p>
            <h3>Inventario de galones</h3>
            <p>Registra lo que hay en almacen, lo que esta en reparto y el costo real del proveedor. Los calculos se actualizan al momento.</p>
          </div>
          <div className="inventory-admin-total">
            <span>Total fisico controlado</span>
            <strong>{moduleTotalControlado}</strong>
            <small>Almacen + carro + balones pendientes</small>
          </div>
        </section>

        <section className="inventory-admin-grid">
          <article className="inventory-control-card">
            <div className="inventory-control-media"><img src="/balon_gas.png" alt="Balon lleno" /></div>
            <div className="inventory-control-body">
              <span>Galones llenos en almacen</span>
              <input type="number" min="0" value={draftGalonesLlenos || ""} placeholder="0" onChange={handleLlenosInputChange} />
              <small>Disponibles para venta o carga al carro.</small>
            </div>
          </article>

          <article className="inventory-control-card">
            <div className="inventory-control-media muted"><img src="/balon_gas.png" alt="Balon vacio" /></div>
            <div className="inventory-control-body">
              <span>Galones vacios en almacen</span>
              <input type="number" min="0" value={draftGalonesVacios || ""} placeholder="0" onChange={handleVaciosInputChange} />
              <small>Pendientes para recarga o revision.</small>
            </div>
          </article>

          <article className="inventory-control-card">
            <div className="inventory-control-media vehicle"><img src="/carro.png" alt="Carro de reparto" /></div>
            <div className="inventory-control-body">
              <span>Galones en carro</span>
              <input type="number" min="0" value={galonesChofer || ""} placeholder="0" onChange={handleChoferInputChange} />
              <small>Carga enviada al reparto del dia.</small>
            </div>
          </article>
        </section>

        <section className="inventory-admin-grid finance">
          <article className="inventory-finance-card">
            <label>Costo proveedor por galon</label>
            <div className="money-input"><span>S/</span><input type="text" inputMode="decimal" value={rawPrecioProveedor} onChange={handlePrecioProveedorInputChange} /></div>
            <small>Este precio calcula inversion, recarga y capital necesario.</small>
          </article>

          <article className="inventory-finance-card">
            <label>Capital objetivo</label>
            <div className="money-input"><span>S/</span><input type="text" inputMode="decimal" value={capitalObjetivo || ""} placeholder="0" onChange={handleCapitalObjetivoInputChange} /></div>
            <small>Meta de capital que queremos alcanzar.</small>
          </article>

          <article className="inventory-finance-card">
            <label>Capital disponible para recarga</label>
            <div className="money-input"><span>S/</span><input type="text" inputMode="decimal" value={rawCapitalDisponible} onChange={handleCapitalDisponibleInputChange} /></div>
            <small>Dinero disponible hoy para convertir vacios en llenos.</small>
          </article>
        </section>

        <section className="inventory-kpi-grid">
          <article><span>Capital actual controlado</span><strong>S/ {capitalActualControlado.toFixed(2)}</strong><small>{moduleTotalControlado} galones x S/ {moduleCostoBaseBalon.toFixed(2)}</small></article>
          <article><span>Dinero para recargar vacios</span><strong>S/ {presupuestoRecarga.toFixed(2)}</strong><small>{moduleBalonesVacios} vacios por recargar</small></article>
          <article><span>Capital faltante</span><strong>S/ {capitalFaltanteObjetivo.toFixed(2)}</strong><small>{balonesFaltantesObjetivo} galones para llegar al objetivo</small></article>
          <article><span>Restan en carro hoy</span><strong>{restanCarroHoy}</strong><small>{vendidosHoyInventario} vendidos segun ventas del dia</small></article>
        </section>

        <section className="inventory-admin-columns">
          <article className="inventory-panel-clean">
            <div className="panel-clean-head">
              <h3>Lectura del reparto</h3>
              <span>Hoy</span>
            </div>
            <div className="inventory-data-list">
              <div><span>Galones enviados al carro</span><b>{moduleBalonesEnCarro}</b></div>
              <div><span>Galones vendidos hoy</span><b>{vendidosHoyInventario}</b></div>
              <div><span>Galones que deberian quedar</span><b>{restanCarroHoy}</b></div>
              <div><span>Balones pendientes de devolver</span><b>{moduleBalonesPendientes}</b></div>
            </div>
          </article>

          <article className="inventory-panel-clean">
            <div className="panel-clean-head">
              <h3>Sugerencia de inversion</h3>
              <span>Segun ventas</span>
            </div>
            <div className="recommendation-box">
              <div className="recommendation-main">
                <span>Compra recomendada</span>
                <strong>{compraSugeridaBalones > 0 ? `${compraSugeridaBalones} galones` : "Sin compra urgente"}</strong>
              </div>
              <div className="recommendation-metrics">
                <div><span>Ultimos 7 dias</span><b>{balonesVendidos7} vendidos</b></div>
                <div><span>Ultimos 30 dias</span><b>{balonesVendidos30} vendidos</b></div>
                <div><span>Stock recomendado</span><b>{stockRecomendado7Dias} llenos</b></div>
              </div>
              <p>Promedio diario usado: <b>{demandaReferencia.toFixed(1)} galones</b>. El sistema calcula esta sugerencia con los registros guardados en la seccion de ventas.</p>
              <p>Inversion sugerida: <b>S/ {inversionSugerida.toFixed(2)}</b>.</p>
            </div>
          </article>
        </section>

        <section className="inventory-admin-columns">
          <article className="inventory-panel-clean">
            <div className="panel-clean-head"><h3>Resumen financiero</h3></div>
            <div className="inventory-data-list">
              <div><span>Inversion en llenos disponibles</span><b>S/ {inversionActualGas.toFixed(2)}</b></div>
              <div><span>Recarga cubierta con capital actual</span><b>{capacidadRecargaCount} de {moduleBalonesVacios}</b></div>
              <div><span>Balones vacios pendientes por falta de capital</span><b>{pendientesBalonesRecarga}</b></div>
              <div><span>Monto faltante para recargar todo</span><b>S/ {montoFaltante.toFixed(2)}</b></div>
            </div>
          </article>

          <article className="inventory-panel-clean">
            <div className="panel-clean-head"><h3>Historial reciente</h3></div>
            <div className="inventory-data-list compact">
              {inventorySnapshots.length === 0 ? (
                <p className="empty-note">Aun no hay registros guardados de inventario.</p>
              ) : inventorySnapshots.slice(0, 4).map((snap) => (
                <div key={snap.id}>
                  <span>{snap.fecha}</span>
                  <b>{snap.balonesLlenos} llenos / {snap.balonesVacios} vacios / {snap.balonesCarro} carro</b>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    ) : view !== "Ventas" ? (
      <div className="module-cards" style={{gridTemplateColumns: 'minmax(0, 320px)'}}>
        <div><span>Total registrado</span><strong>{view === "Recargas" ? `${recargas.filter(r => r.estado !== "recibida").reduce((a, b) => a + (b.cantidad_enviada || 0), 0)} balones en planta` : view === "Movimientos" ? `${movimientos.length} movimientos` : view === "Clientes" ? `${clients.length} clientes` : view === "Caja" ? `S/ ${totalEfectivo.toFixed(2)}` : view === "Reportes" ? `${sales.length} ventas procesadas` : `${inventory.reduce((a,b)=>a+b.cantidad,0)} balones`}</strong></div>
      </div>
    ) : null}

    {view !== "Inventario" ? <section className="panel module-table">
      <div className="panel-head">
        <div><h3>{view}</h3></div>
        <div className="module-actions">
          <button onClick={handleExportExcel}>Exportar Excel</button>
        </div>
      </div>

      {view === "Ventas" ? (
        <div className="sales-dashboard">
          <div className="sales-summary-grid">
            <div className="caja-card card-total">
              <span>Total ventas</span>
              <strong className="card-amount">S/ {totalVentas.toFixed(2)}</strong>
              <small className="card-sub">Bruto registrado - {sales.length} ventas</small>
            </div>
            <div className="caja-card card-efectivo">
              <span>Cobrado real</span>
              <strong className="card-amount">S/ {totalCobrado.toFixed(2)}</strong>
              <small className="card-sub">Total ventas menos deuda</small>
            </div>
            <div className="caja-card card-digital">
              <span>Yape / Digital</span>
              <strong className="card-amount">S/ {(totalYape + totalTransferencia).toFixed(2)}</strong>
              <small className="card-sub">Yape/Plin S/ {totalYape.toFixed(2)} + Transf. S/ {totalTransferencia.toFixed(2)}</small>
            </div>
            <div className="caja-card card-credito">
              <span>Credito / Pendiente</span>
              <strong className="card-amount">S/ {(totalCredito + totalPorDefinir).toFixed(2)}</strong>
              <small className="card-sub">Cobrado por credito o por definir</small>
            </div>
            <div className={`caja-card ${modVentasDeudorasSoles > 0 ? "card-debt" : "card-neutro"}`}>
              <span>Por cobrar</span>
              <strong className="card-amount">S/ {modVentasDeudorasSoles.toFixed(2)}</strong>
              {modVentasDeudorasSoles > 0 ? <small className="card-sub">{modSalesDeudorasPago.length} ventas pendientes de pago</small> : <small className="card-sub">Sin deudas pendientes</small>}
            </div>
            <div className={`caja-card ${modVentasDeudorasBalones > 0 ? "card-debt" : "card-neutro"}`}>
              <span>Balones por devolver</span>
              <strong className="card-amount">{modVentasDeudorasBalones} balones</strong>
              {modVentasDeudorasBalones > 0 ? <small className="card-sub">Envases pendientes en clientes</small> : <small className="card-sub">Sin envases pendientes</small>}
            </div>
            <div className={`caja-card ${modTotalDeudorasCount > 0 ? "card-debt" : "card-neutro"}`}>
              <span>Ventas con deuda</span>
              <strong className="card-amount">{modTotalDeudorasCount} {modTotalDeudorasCount === 1 ? "deuda" : "deudas"}</strong>
              {modTotalDeudorasCount > 0 ? <small className="card-sub">Cobros o envases pendientes</small> : <small className="card-sub">Todo al dia</small>}
            </div>
          </div>
          <SalesTable sales={sales} onRequestDelete={onRequestDelete} onEditVenta={onEditVenta} />
        </div>
      ) :
       view === "Clientes" ? <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Telefono</th><th>Direccion</th><th>Tipo</th><th>Precio habitual</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{clients.length === 0 ? <tr><td colSpan={7} style={{textAlign:'center',padding:'24px',color:'#718090'}}>No hay clientes guardados aun. Agregue uno con el boton Registrar cliente.</td></tr> : clients.map((cli, i) => <tr key={cli.$id || i}><td><b>{cli.nombre}</b></td><td>{cli.telefono || "-"}</td><td>{cli.direccion || "Direccion no especificada"}</td><td><span className="pill normal">{cli.tipo_cliente}</span></td><td>S/ {(cli.precio_habitual || 52).toFixed(2)}</td><td><span className="badge">Activo</span></td><td>{cli.$id && onRequestDelete ? <button className="delete-btn" onClick={() => onRequestDelete("cliente", cli.$id!, `el cliente ${cli.nombre}`)}>Eliminar</button> : null}</td></tr>)}</tbody></table></div> :
       view === "Movimientos" ? <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo movimiento</th><th>Balon</th><th>Estado</th><th>Cantidad</th><th>Observacion</th></tr></thead><tbody>{movimientos.length === 0 ? <tr><td colSpan={6} style={{textAlign:'center',padding:'24px',color:'#718090'}}>Sin movimientos registrados aun. Se generaran al realizar ventas o recargas.</td></tr> : movimientos.map((mov, i) => <tr key={mov.$id || i}><td>{mov.fecha ? new Date(mov.fecha).toLocaleString([], { dateStyle:'short', timeStyle:'short' }) : "Hoy"}</td><td><b>{mov.tipo_movimiento}</b></td><td>{mov.tipo_balon}</td><td>{mov.estado_balon}</td><td><b>{mov.cantidad}</b></td><td>{mov.observacion || "Movimiento del sistema"}</td></tr>)}</tbody></table></div> :
       view === "Recargas" ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {(() => {
              const lastRecarga = recargas.length > 0 ? recargas[0] : null;
              const lastDate = lastRecarga && lastRecarga.fecha_envio ? new Date(lastRecarga.fecha_envio) : null;
              
              const salesAcumuladas = sales.filter((s) => {
                if (!lastDate) return true;
                const sDate = new Date(s.fecha || Date.now());
                return sDate >= lastDate;
              }).reduce((acc, curr) => acc + getSaleDebtInfo(curr).charged, 0);

              const totalCajaAcumulada = salesAcumuladas > 0 ? salesAcumuladas : sales.reduce((acc, curr) => acc + getSaleDebtInfo(curr).charged, 0);

              const totalVacios = inventory
                .filter((i) => String(i.estado) === "vacío" || String(i.estado) === "vacio")
                .reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
              const costoEstimadoVacios = totalVacios * (precioProveedorBalon || 44.30);

              const costoRecargaUnitario = precioProveedorBalon || 42.0;
              const capacidadPresupuesto = Math.floor(totalCajaAcumulada / costoRecargaUnitario);
              const recomendacionBalones = Math.min(totalVacios, capacidadPresupuesto);
              const costoTotalRecarga = recomendacionBalones * costoRecargaUnitario;
              const saldoCajaSobrante = Math.max(0, totalCajaAcumulada - costoTotalRecarga);

              const fechaTrabajoMs = new Date(`${selectedDate}T00:00:00`).getTime();
              const diasDesdeUltima = lastDate ? Math.max(1, Math.floor((fechaTrabajoMs - lastDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;

              return (
                <div
                  className="recargas-planning-card"
                  style={{
                    margin: "22px",
                    padding: "22px",
                    background: "#ffffff",
                    border: "1px solid #d7e0e8",
                    borderRadius: "16px",
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)"
                  }}
                >
                  <div
                    className="recargas-planning-head"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "16px",
                      paddingBottom: "16px",
                      marginBottom: "18px",
                      borderBottom: "1px solid #e2e8f0"
                    }}
                  >
                    <div>
                      <span
                        className="recargas-section-label"
                        style={{
                          display: "block",
                          marginBottom: "5px",
                          color: "#64748b",
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase"
                        }}
                      >
                        PLANIFICACION DE RECARGAS
                      </span>
                      <h3 style={{ margin: 0, color: "#0f172a", fontSize: "20px", fontWeight: 850 }}>
                        Sugerencia de recarga a NEWGAS
                      </h3>
                    </div>
                    {lastDate ? (
                      <span
                        className="recargas-period-badge"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: "30px",
                          padding: "5px 12px",
                          border: "1px solid #d7e0e8",
                          borderRadius: "999px",
                          background: "#f8fafc",
                          color: "#475569",
                          fontSize: "12px",
                          fontWeight: 800,
                          whiteSpace: "nowrap"
                        }}
                      >
                        Ultima recarga hace {diasDesdeUltima} {diasDesdeUltima === 1 ? 'dia' : 'dias'} ({lastDate.toLocaleDateString()})
                      </span>
                    ) : (
                      <span
                        className="recargas-period-badge"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: "30px",
                          padding: "5px 12px",
                          border: "1px solid #d7e0e8",
                          borderRadius: "999px",
                          background: "#f8fafc",
                          color: "#475569",
                          fontSize: "12px",
                          fontWeight: 800,
                          whiteSpace: "nowrap"
                        }}
                      >
                        Primer envio de periodo
                      </span>
                    )}
                  </div>

                  <div
                    className="recargas-metrics-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "14px",
                      marginBottom: "18px"
                    }}
                  >
                    <div className="recargas-metric-card" style={{ minHeight: "118px", padding: "18px", border: "1px solid #d7e0e8", borderRadius: "14px", background: "#ffffff", display: "flex", flexDirection: "column", justifyContent: "center", gap: "7px" }}>
                      <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>Caja acumulada</span>
                      <strong style={{ display: "block", color: "#0f172a", fontSize: "25px", lineHeight: 1, fontWeight: 900 }}>S/ {totalCajaAcumulada.toFixed(2)}</strong>
                      <small style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.35 }}>Ventas cobradas desde la ultima recarga</small>
                    </div>

                    <div className="recargas-metric-card" style={{ minHeight: "118px", padding: "18px", border: "1px solid #d7e0e8", borderRadius: "14px", background: "#ffffff", display: "flex", flexDirection: "column", justifyContent: "center", gap: "7px" }}>
                      <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>Vacios disponibles</span>
                      <strong style={{ display: "block", color: "#0f172a", fontSize: "25px", lineHeight: 1, fontWeight: 900 }}>{totalVacios} envases</strong>
                      <small style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.35 }}>Costo estimado S/ {costoEstimadoVacios.toFixed(2)}</small>
                    </div>

                    <div className="recargas-metric-card recargas-metric-card-main" style={{ minHeight: "118px", padding: "18px", border: "1px solid #94a3b8", borderRadius: "14px", background: "#ffffff", display: "flex", flexDirection: "column", justifyContent: "center", gap: "7px" }}>
                      <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>Sugerencia de compra</span>
                      <strong style={{ display: "block", color: "#0f172a", fontSize: "25px", lineHeight: 1, fontWeight: 900 }}>
                        {recomendacionBalones > 0 ? `${recomendacionBalones} balones` : "Sin recarga requerida"}
                      </strong>
                      <small style={{ color: "#475569", fontSize: "12px", lineHeight: 1.35, fontWeight: 700 }}>
                        {recomendacionBalones > 0
                          ? `Costo S/ ${costoTotalRecarga.toFixed(2)}`
                          : "Caja o envases vacios insuficientes"}
                      </small>
                    </div>

                    <div className="recargas-metric-card" style={{ minHeight: "118px", padding: "18px", border: "1px solid #d7e0e8", borderRadius: "14px", background: "#ffffff", display: "flex", flexDirection: "column", justifyContent: "center", gap: "7px" }}>
                      <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>Saldo libre en caja</span>
                      <strong style={{ display: "block", color: "#0f172a", fontSize: "25px", lineHeight: 1, fontWeight: 900 }}>S/ {saldoCajaSobrante.toFixed(2)}</strong>
                      <small style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.35 }}>Sobrante despues de recargar</small>
                    </div>
                  </div>

                  <div className="recargas-action-row" style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      className="recargas-action-button"
                      onClick={() => onAddRecarga()}
                      style={{
                        border: 0,
                        borderRadius: "10px",
                        background: "#0f172a",
                        color: "#ffffff",
                        padding: "12px 18px",
                        fontSize: "13px",
                        fontWeight: 850,
                        boxShadow: "0 8px 18px rgba(15, 23, 42, 0.14)",
                        cursor: "pointer"
                      }}
                    >
                      Registrar envio a Planta NEWGAS
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha envio</th>
                    <th>Proveedor</th>
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
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#718090' }}>
                        Sin recargas registradas aun. Registre envios de balones vacios a Proveedor NEWGAS.
                      </td>
                    </tr>
                  ) : (
                    recargas.map((rec, i) => (
                      <tr key={rec.$id || i}>
                        <td>{rec.fecha_envio ? new Date(rec.fecha_envio).toLocaleDateString() : "Hoy"}</td>
                        <td><b>{rec.proveedor || "Planta NEWGAS"}</b></td>
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
                                onClick={() => onRequestDelete("recarga", rec.$id!, `el envio a recarga de ${rec.cantidad_enviada} balones`)}
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
        ) : view === "Caja" ? (
          <div className="caja-view-container">
            <div className="caja-summary-grid">
              <div className="caja-card"><span>Ventas en efectivo</span><strong>S/ {totalEfectivo.toFixed(2)}</strong></div>
              <div className="caja-card"><span>Ventas digitales (Yape/Plin)</span><strong>S/ {totalDigital.toFixed(2)}</strong></div>
              <div className="caja-card"><span>Gastos registrados</span><strong style={{color:'#c74e49'}}>S/ {totalGastos.toFixed(2)}</strong></div>
              <div className="caja-card highlight"><span>Saldo en Caja Esperado</span><strong>S/ {(totalEfectivo - totalGastos).toFixed(2)}</strong></div>
            </div>
            <div className="table-wrap" style={{marginTop:'20px'}}>
              <table>
                <thead><tr><th>Concepto</th><th>Categoria</th><th>Monto</th><th>Forma de pago</th><th>Acciones</th></tr></thead>
                <tbody>
                  {gastos.length === 0 ? (
                    <tr><td colSpan={5} style={{textAlign:'center',padding:'20px',color:'#81909a'}}>No hay gastos registrados el dia de hoy.</td></tr>
                  ) : (
                    gastos.map((g, i) => (
                      <tr key={g.$id || i}>
                        <td><b>{g.concepto}</b></td>
                        <td>{g.categoria}</td>
                        <td>S/ {(g.monto || 0).toFixed(2)}</td>
                        <td>{g.forma_pago || "Efectivo"}</td>
                        <td>{g.$id && onRequestDelete ? <button className="delete-btn" onClick={() => onRequestDelete("gasto", g.$id!, `el gasto ${g.concepto} por S/ ${g.monto}`)}>Eliminar</button> : null}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : view === "Reportes" ? (
          <div className="reportes-container">
            <div className="caja-summary-grid">
              <div className="caja-card"><span>Ingreso Bruto Total</span><strong>S/ {totalVentas.toFixed(2)}</strong></div>
              <div className="caja-card"><span>Ganancia Estimada</span><strong style={{color:'#1f9d73'}}>{"S/ "}{Math.max(0, totalVentas - (sales.reduce((a,b)=>a+(b.cantidad||b.qty||0),0) * moduleCostoBaseBalon) - totalGastos).toFixed(2)}</strong></div>
              <div className="caja-card"><span>Balones Vendidos</span><strong>{sales.reduce((a,b)=>a+(b.cantidad||b.qty||0),0)} unidades</strong></div>
            </div>
            {driveBackupState !== "idle" ? (
              <div className={`drive-backup-status ${driveBackupState}`}>
                <div>
                  <strong>{driveBackupState === "success" ? "Copia guardada" : driveBackupState === "error" ? "No se pudo guardar" : driveBackupState === "saving" ? "Guardando en Drive" : "Conectando Google Drive"}</strong>
                  <p>{driveBackupMessage}</p>
                </div>
                {driveBackupState === "success" ? <span>OK</span> : driveBackupState === "error" ? <span>!</span> : <span className="drive-spinner" />}
              </div>
            ) : null}
            <div className="module-actions-row drive-actions">
              <button className="primary drive-save-button" onClick={handleDriveBackup} disabled={driveBackupState === "connecting" || driveBackupState === "saving"}>
                {driveBackupState === "saving" ? "Guardando..." : driveBackupState === "connecting" ? "Conectando..." : "Guardar copia en Google Drive (.xlsx)"}
              </button>
              <button className="primary" onClick={handleDownloadPDF}>Descargar Reporte PDF</button>
              <button className="primary" style={{background:'#2670b8'}} onClick={handleExportExcel}>Exportar a Excel</button>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h3>Modulo {view} sincronizado</h3>
            <p>Informacion lista en Appwrite.</p>
          </div>
        )}
    </section> : null}

    {snapshotModalOpen && (
      <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <section className="panel modal-card" style={{ maxWidth: '520px', width: '100%', background: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="panel-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Registrar estado de inventario</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: '2px 0 0 0' }}>Crea un registro de balones, precio y capital de recarga</p>
            </div>
            <button className="icon-btn" onClick={() => setSnapshotModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>x</button>
          </div>
          <form onSubmit={handleValidateSnapshot} className="modal-form" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {snapError && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', background: '#fce8e6', border: '1px solid #ea4335', color: '#c5221f', fontSize: '13px' }}>
                {snapError}
              </div>
            )}
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Fecha de registro</label>
              <input type="date" value={snapFecha} onChange={(e) => setSnapFecha(e.target.value)} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Balones llenos</label>
                <input type="number" min="0" step="1" value={snapLlenos} onChange={(e) => setSnapLlenos(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Balones vacios</label>
                <input type="number" min="0" step="1" value={snapVacios} onChange={(e) => setSnapVacios(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Balones en carro</label>
                <input type="number" min="0" step="1" value={snapCarro} onChange={(e) => setSnapCarro(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Precio proveedor (S/)</label>
                <input type="number" min="0" step="0.10" value={snapPrecio} onChange={(e) => setSnapPrecio(e.target.value === "" ? "" : Number(e.target.value))} placeholder="44.30" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Capital disponible para recarga (S/)</label>
              <input type="number" min="0" step="0.50" value={snapCapital} onChange={(e) => setSnapCapital(e.target.value === "" ? "" : Number(e.target.value))} placeholder="1000.00" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
            </div>
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Observacion opcional</label>
              <input type="text" value={snapObs} onChange={(e) => setSnapObs(e.target.value)} placeholder="Ej. Registro matutino" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
            </div>
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={() => setSnapshotModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancelar</button>
              <button type="submit" className="primary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Siguiente</button>
            </div>
          </form>
        </section>
      </div>
    )}

    {snapshotConfirmOpen && (
      <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <section className="panel modal-card" style={{ maxWidth: '460px', width: '100%', background: '#fff', borderRadius: '12px', textAlign: 'center', padding: '24px' }}>
          <h3 style={{ marginTop: 0, fontSize: '18px' }}>Confirmar guardado de inventario?</h3>
          <p style={{ color: 'var(--color-muted)', fontSize: '14px', marginBottom: '20px', lineHeight: 1.5 }}>
            Se registraran <b>{snapLlenos || 0} balones llenos</b>, <b>{snapVacios || 0} vacios</b> y <b>{snapCarro || 0} en carro</b> a un precio proveedor de <b>S/ {Number(snapPrecio || 0).toFixed(2)}</b>.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button onClick={() => setSnapshotConfirmOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancelar</button>
            <button className="primary" onClick={handleSaveSnapshotConfirmed} style={{ padding: '8px 16px', borderRadius: '6px' }}>Si, guardar registro</button>
          </div>
        </section>
      </div>
    )}

    {movementModalOpen && (
      <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <section className="panel modal-card" style={{ maxWidth: '520px', width: '100%', background: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="panel-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Registrar movimiento de balones</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: '2px 0 0 0' }}>Actualiza el inventario fisico automaticamente</p>
            </div>
            <button className="icon-btn" onClick={() => setMovementModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>x</button>
          </div>
          <form onSubmit={handleSaveMovement} className="modal-form" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Tipo de movimiento</label>
              <select value={quickMovType} onChange={(e) => openQuickMovementModal(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                <option value="Recarga">Recarga</option>
                <option value="Venta">Venta</option>
                <option value="Asignacion a vehiculo">Asignacion a vehiculo</option>
                <option value="Retorno de vehiculo">Retorno de vehiculo</option>
                <option value="Entrada de balones">Entrada de balones</option>
                <option value="Salida de balones">Salida de balones</option>
                <option value="Perdida">Perdida</option>
                <option value="Dano">Dano</option>
                <option value="Ajuste">Ajuste de inventario</option>
              </select>
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Cantidad de balones</label>
                <input type="number" min="1" step="1" value={quickMovQty} onChange={(e) => setQuickMovQty(e.target.value === "" ? "" : Number(e.target.value))} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Estado del balon</label>
                <select value={quickMovEstado} onChange={(e) => setQuickMovEstado(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                  <option value="lleno">Lleno</option>
                  <option value="vacio">Vacio</option>
                </select>
              </div>
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Origen</label>
                <input type="text" value={quickMovOrigen} onChange={(e) => setQuickMovOrigen(e.target.value)} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Destino</label>
                <input type="text" value={quickMovDestino} onChange={(e) => setQuickMovDestino(e.target.value)} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Vehiculo / Chofer</label>
                <input type="text" value={quickMovChofer} onChange={(e) => setQuickMovChofer(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Responsable</label>
                <input type="text" value={quickMovResponsable} onChange={(e) => setQuickMovResponsable(e.target.value)} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Observaciones</label>
              <input type="text" value={quickMovObs} onChange={(e) => setQuickMovObs(e.target.value)} placeholder="Ej. Movimiento registrado en sistema" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
            </div>
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={() => setMovementModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancelar</button>
              <button type="submit" className="primary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Guardar movimiento</button>
            </div>
          </form>
        </section>
      </div>
    )}
  </div>;
}

