import { useState, useMemo, useEffect } from "react";

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://tdqoakivkegqrtopgtut.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkcW9ha2l2a2VncXJ0b3BndHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxODYyNjcsImV4cCI6MjA5Mzc2MjI2N30.cutRceKA2ZMNLPpo-LpmMsf-PMbDyIEDicqb5lPhEwk";

const sb = async (path, method = "GET", body = null) => {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };
  if (method === "POST") headers["Prefer"] = "resolution=merge-duplicates";
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err}`); }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
};

const loadExpensesForPeriods = (keys) => sb(`/expenses?period=in.(${keys.map(k => `"${k}"`).join(",")})&order=created_at.asc`);
const upsertExpense = (exp) => sb("/expenses", "POST", exp);
const deleteExpense = (id) => sb(`/expenses?id=eq.${id}`, "DELETE");
const loadSettings = () => sb("/settings?select=key,value");
const upsertSetting = (key, value) => sb("/settings", "POST", { key, value: String(value) });
const loadFunds = () => sb("/funds?order=created_at.asc");
const upsertFund = (fund) => sb("/funds", "POST", fund);
const deleteFund = (id) => sb(`/funds?id=eq.${id}`, "DELETE");
const loadFundTransactions = () => sb("/fund_transactions?order=created_at.asc");
const upsertFundTransaction = (tx) => sb("/fund_transactions", "POST", tx);
const deleteFundTransaction = (id) => sb(`/fund_transactions?id=eq.${id}`, "DELETE");

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "groceries", label: "Groceries", color: "#6AE89B", icon: "🛒" },
  { id: "transport", label: "Transport", color: "#6A9BE8", icon: "🚗" },
  { id: "shopping", label: "Shopping", color: "#B86AE8", icon: "🛍️" },
  { id: "dining", label: "Dining Out", color: "#E8936A", icon: "🍽️" },
  { id: "recurring", label: "Recurring", color: "#F472B6", icon: "🔄" },
  { id: "other", label: "Other", color: "#8E8E8E", icon: "📦" },
];

// ── Themes ────────────────────────────────────────────────────────────────────
const DARK = { bg: "#0F0F13", surface: "#16161E", surface2: "#1A1A24", surface3: "#1F1F28", border: "#2A2A35", border2: "#44445A", text: "#E8E4DC", textMuted: "#666", textDim: "#555", textFaint: "#444", accent: "#E8936A", inputBg: "#0F0F13" };
const LIGHT = { bg: "#F5F4F0", surface: "#FFFFFF", surface2: "#F0EDE8", surface3: "#E8E4DC", border: "#D8D4CC", border2: "#B0A898", text: "#1A1A22", textMuted: "#666", textDim: "#888", textFaint: "#AAA", accent: "#D4722A", inputBg: "#FFFFFF" };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const isToday = (d) => { const t = new Date(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); };
const isWeekday = (d) => d.getDay() !== 0 && d.getDay() !== 6;
const monthKey = (date) => { const d = new Date(date + "T00:00:00"); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const monthLabel = (key) => { const [y,m] = key.split("-"); return new Date(y, m-1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };

const lastBizDay = (year, month) => { const d = new Date(year, month + 1, 0); while (!isWeekday(d)) d.setDate(d.getDate() - 1); return new Date(d); };
const midMonthPayDay = (year, month) => { const d = new Date(year, month, 15); while (!isWeekday(d)) d.setDate(d.getDate() - 1); return new Date(d); };

const getPayDates = () => {
  const today = new Date();
  const dates = [];
  for (let offset = -2; offset <= 3; offset++) {
    const m = (today.getMonth() + offset + 120) % 12;
    const y = today.getFullYear() + Math.floor((today.getMonth() + offset) / 12);
    dates.push(midMonthPayDay(y, m)); dates.push(lastBizDay(y, m));
  }
  return dates.sort((a, b) => a - b).filter((d, i, arr) => i === 0 || d.toDateString() !== arr[i-1].toDateString());
};
const getCurrentPayPeriod = (payDates) => {
  const today = new Date(); today.setHours(0,0,0,0);
  let startIdx = 0;
  for (let i = payDates.length - 1; i >= 0; i--) { const pd = new Date(payDates[i]); pd.setHours(0,0,0,0); if (pd <= today) { startIdx = i; break; } }
  const start = new Date(payDates[startIdx]); start.setHours(0,0,0,0);
  const nextPay = payDates[startIdx + 1];
  let end;
  if (nextPay) { end = new Date(nextPay); end.setHours(0,0,0,0); end.setDate(end.getDate()-1); } else { end = new Date(start); end.setDate(start.getDate()+13); }
  return { start, end, nextPayDate: nextPay || null };
};
const getCurrentMonthPeriod = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth()+1, 0);
  return { start, end, nextPayDate: null };
};
const getDaysInPeriod = (start, end) => {
  const days = []; const cur = new Date(start);
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
  return days;
};
const getPeriodKeysForRange = (start, end, payDates) => {
  const keys = new Set();
  const cur = new Date(start);
  while (cur <= end) { const y = cur.getFullYear(); const m = String(cur.getMonth()+1).padStart(2,"0"); keys.add(`${y}-${m}`); cur.setMonth(cur.getMonth()+1); }
  for (let i = 0; i < payDates.length - 1; i++) {
    const ps = new Date(payDates[i]); ps.setHours(0,0,0,0);
    const pe = new Date(payDates[i+1]); pe.setHours(0,0,0,0); pe.setDate(pe.getDate()-1);
    if (ps <= end && pe >= start) keys.add(ps.toISOString().slice(0,10));
  }
  return [...keys];
};
const periodKey = (start, mode) => mode === "monthly"
  ? `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}`
  : start.toISOString().slice(0,10);

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const todayDate = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const payDates = useMemo(() => getPayDates(), []);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("budgetViewMode") || "monthly");
  useEffect(() => { localStorage.setItem("budgetViewMode", viewMode); }, [viewMode]);
  const { start: periodStart, end: periodEnd, nextPayDate } = useMemo(() => viewMode === "monthly" ? getCurrentMonthPeriod() : getCurrentPayPeriod(payDates), [viewMode, payDates]);
  const days = useMemo(() => getDaysInPeriod(periodStart, periodEnd), [periodStart, periodEnd]);
  const periodLength = days.length;
  const curPeriodKey = useMemo(() => periodKey(periodStart, viewMode), [periodStart, viewMode]);

  const [darkMode, setDarkMode] = useState(() => { const s = localStorage.getItem("budgetTheme"); return s ? s === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches; });
  useEffect(() => { localStorage.setItem("budgetTheme", darkMode ? "dark" : "light"); }, [darkMode]);
  const T = darkMode ? DARK : LIGHT;

  const [budget, setBudget] = useState(1000);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("1000");
  const [allExpenses, setAllExpenses] = useState([]);
  const [selectedDay, setSelectedDay] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", label: "", category: "groceries", isCredit: false });
  const [activeTab, setActiveTab] = useState("calendar");
  const [catTargets, setCatTargets] = useState({});
  const [excludedCats, setExcludedCats] = useState({});
  const [editingTarget, setEditingTarget] = useState(null);
  const [targetInput, setTargetInput] = useState("");
  const [expandedCats, setExpandedCats] = useState({});
  const toggleCat = (id) => setExpandedCats((prev) => ({ ...prev, [id]: !prev[id] }));
  const [editingExpense, setEditingExpense] = useState(null);
  const startEdit = (e) => setEditingExpense({ id: e.id, amount: String(Math.abs(parseFloat(e.amount))), label: e.label, category: e.category, isCredit: parseFloat(e.amount) < 0 });
  const cancelEdit = () => setEditingExpense(null);

  // Funds
  const [funds, setFunds] = useState([]);
  const [fundTransactions, setFundTransactions] = useState([]);
  const [expandedFunds, setExpandedFunds] = useState({});
  const toggleFund = (id) => setExpandedFunds((prev) => ({ ...prev, [id]: !prev[id] }));
  const [showNewFund, setShowNewFund] = useState(false);
  const [newFund, setNewFund] = useState({ name: "", icon: "🎯", target: "", end_date: "" });
  const [activeFundId, setActiveFundId] = useState(null);
  const [fundTxForm, setFundTxForm] = useState({ amount: "", label: "", date: "", isCredit: false });
  const [editingFund, setEditingFund] = useState(null);

  const [syncStatus, setSyncStatus] = useState("loading");
  const [syncError, setSyncError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Quick Add
  const toDateInput = (d) => d.toISOString().slice(0,10);
  const fromDateInput = (s) => new Date(s + "T00:00:00");
  const emptyRow = () => ({ amount: "", label: "", category: "groceries", date: toDateInput(todayDate), isCredit: false });
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, emptyRow));
  const [isSavingAll, setIsSavingAll] = useState(false);

  useEffect(() => {
    (async () => {
      setSyncStatus("loading"); setInitialized(false);
      try {
        const keys = getPeriodKeysForRange(periodStart, periodEnd, payDates);
        const [exps, settings, fundsData, fundTxData] = await Promise.all([
          loadExpensesForPeriods(keys), loadSettings(), loadFunds(), loadFundTransactions(),
        ]);
        const filtered = (exps || []).filter((e) => { const d = new Date(e.date); d.setHours(0,0,0,0); return d >= periodStart && d <= periodEnd; });
        setAllExpenses(filtered);
        setFunds(fundsData || []);
        setFundTransactions(fundTxData || []);
        const sm = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
        const bKey = `budget_${viewMode}_${curPeriodKey}`;
        if (sm[bKey]) { const b = parseFloat(sm[bKey]); setBudget(b); setBudgetInput(String(b)); } else { setBudget(1000); setBudgetInput("1000"); }
        const targets = {};
        CATEGORIES.forEach((c) => { if (sm[`target_${viewMode}_${curPeriodKey}_${c.id}`]) targets[c.id] = parseFloat(sm[`target_${viewMode}_${curPeriodKey}_${c.id}`]); });
        setCatTargets(targets);
        const excl = {};
        CATEGORIES.forEach((c) => { if (sm[`exclude_${c.id}`] === "true") excl[c.id] = true; });
        setExcludedCats(excl);
        setSyncStatus("idle"); setInitialized(true);
      } catch (e) { setSyncStatus("error"); setSyncError(e.message); setInitialized(true); }
    })();
  }, [viewMode, curPeriodKey]);

  useEffect(() => {
    const idx = days.findIndex((d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() === todayDate.getTime(); });
    setSelectedDay(idx >= 0 ? idx : 0);
  }, [viewMode, days.length]);

  const expenses = allExpenses;
  const expensesByDay = days.map((d) => expenses.filter((e) => e.date === d.toDateString()));

  // Derived — order matters
  const total = expenses.filter((e) => !excludedCats[e.category]).reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalIncExcluded = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
  const recurringTarget = catTargets["recurring"] || 0;
  const effectiveBudget = Math.max(budget - recurringTarget, 0);
  const remaining = effectiveBudget - total;
  const pct = Math.min((total / Math.max(effectiveBudget, 1)) * 100, 100);
  const daysElapsed = Math.max(1, days.filter((d) => { const x = new Date(d); x.setHours(0,0,0,0); return x <= todayDate; }).length);
  const progressFraction = daysElapsed / periodLength;
  const daysRemaining = Math.max(1, periodLength - daysElapsed + 1);
  const dailyBudget = remaining > 0 ? remaining / daysRemaining : 0;
  const expectedPct = progressFraction * 100;
  const paceRatio = expectedPct > 0 ? pct / expectedPct : 0;
  const statusColor = paceRatio <= 1.0 ? "#6AE89B" : paceRatio <= 1.25 ? "#E8D06A" : "#E86A6A";
  const totalTargeted = Object.values(catTargets).reduce((s, v) => s + (v || 0), 0);
  const hasExcluded = Object.values(excludedCats).some(Boolean);

  const getCatData = (catId) => {
    const catExps = expenses.filter((e) => e.category === catId);
    const spent = catExps.reduce((s, e) => s + parseFloat(e.amount), 0);
    const credits = catExps.filter((e) => parseFloat(e.amount) < 0).reduce((s, e) => s + parseFloat(e.amount), 0);
    const net = spent;
    const target = catTargets[catId] || 0;
    const catRemaining = target > 0 ? target - net : null;
    const catPct = target > 0 ? Math.min((Math.max(net, 0) / target) * 100, 100) : null;
    let status = null;
    if (target > 0) {
      const ratio = Math.max(net, 0) / Math.max(target * progressFraction, 0.01);
      if (ratio <= 0.85) status = "ahead"; else if (ratio <= 1.1) status = "on track"; else status = "over pace";
    }
    return { spent, credits, net, target, remaining: catRemaining, pct: catPct, status };
  };

  const statusBadge = (status) => {
    if (!status) return null;
    const map = { ahead: { bg: "#6AE89B22", border: "#6AE89B55", color: "#6AE89B", label: "AHEAD" }, "on track": { bg: "#6A9BE822", border: "#6A9BE855", color: "#6A9BE8", label: "ON TRACK" }, "over pace": { bg: "#E86A6A22", border: "#E86A6A55", color: "#E86A6A", label: "OVER PACE" } };
    const s = map[status];
    return <div style={{ fontSize: 9, letterSpacing: "0.1em", padding: "2px 6px", borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, color: s.color, whiteSpace: "nowrap" }}>{s.label}</div>;
  };

  const addExpense = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0 || !form.label.trim()) return;
    const finalAmt = form.isCredit ? -amt : amt;
    const exp = { id: String(Date.now()), date: days[selectedDay].toDateString(), amount: finalAmt, label: form.label.trim(), category: form.category, period: curPeriodKey };
    setAllExpenses((prev) => [...prev, exp]);
    setForm({ amount: "", label: "", category: "groceries", isCredit: false });
    setShowForm(false);
    setSyncStatus("saving");
    try { await upsertExpense(exp); setSyncStatus("idle"); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const removeExpense = async (id) => {
    setAllExpenses((prev) => prev.filter((e) => e.id !== String(id)));
    setSyncStatus("saving");
    try { await deleteExpense(String(id)); setSyncStatus("idle"); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const saveEdit = async () => {
    if (!editingExpense) return;
    const amt = parseFloat(editingExpense.amount);
    if (!amt || amt <= 0 || !editingExpense.label.trim()) return;
    const finalAmt = editingExpense.isCredit ? -amt : amt;
    const updated = { ...allExpenses.find((e) => e.id === editingExpense.id), amount: finalAmt, label: editingExpense.label.trim(), category: editingExpense.category };
    setAllExpenses((prev) => prev.map((e) => e.id === editingExpense.id ? updated : e));
    setEditingExpense(null);
    setSyncStatus("saving");
    try { await upsertExpense(updated); setSyncStatus("idle"); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const confirmBudget = async () => {
    const v = parseFloat(budgetInput);
    if (v > 0) { setBudget(v); setSyncStatus("saving"); try { await upsertSetting(`budget_${viewMode}_${curPeriodKey}`, v); setSyncStatus("idle"); } catch (e) { setSyncStatus("error"); setSyncError(e.message); } }
    setEditBudget(false);
  };

  const confirmTarget = async (catId) => {
    const v = parseFloat(targetInput);
    const val = v > 0 ? v : 0;
    setCatTargets((prev) => ({ ...prev, [catId]: val }));
    setEditingTarget(null); setTargetInput("");
    setSyncStatus("saving");
    try { await upsertSetting(`target_${viewMode}_${curPeriodKey}_${catId}`, val); setSyncStatus("idle"); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const toggleExclude = async (catId) => {
    const newVal = !excludedCats[catId];
    setExcludedCats((prev) => ({ ...prev, [catId]: newVal }));
    setSyncStatus("saving");
    try { await upsertSetting(`exclude_${catId}`, newVal); setSyncStatus("idle"); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const updateRow = (i, field, value) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const saveAll = async () => {
    const valid = rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim());
    if (valid.length === 0) return;
    setIsSavingAll(true); setSyncStatus("saving");
    try {
      const toSave = valid.map((r) => ({ id: String(Date.now() + Math.random()), date: (r.date ? fromDateInput(r.date) : todayDate).toDateString(), amount: r.isCredit ? -parseFloat(r.amount) : parseFloat(r.amount), label: r.label.trim(), category: r.category || "other", period: curPeriodKey }));
      await Promise.all(toSave.map(upsertExpense));
      setAllExpenses((prev) => [...prev, ...toSave]);
      setRows(Array.from({ length: 5 }, emptyRow));
      setSyncStatus("idle"); setActiveTab("calendar");
    } catch (e) { setSyncStatus("error"); setSyncError(`Quick Add: ${e.message}`); }
    setIsSavingAll(false);
  };

  // Fund actions
  const createFund = async () => {
    if (!newFund.name.trim()) return;
    const fund = { id: String(Date.now()), name: newFund.name.trim(), icon: newFund.icon || "🎯", target: newFund.target ? parseFloat(newFund.target) : null, end_date: newFund.end_date || null };
    setFunds((prev) => [...prev, fund]);
    setNewFund({ name: "", icon: "🎯", target: "", end_date: "" });
    setShowNewFund(false);
    try { await upsertFund(fund); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const removeFund = async (id) => {
    setFunds((prev) => prev.filter((f) => f.id !== id));
    setFundTransactions((prev) => prev.filter((t) => t.fund_id !== id));
    try { await deleteFund(id); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const addFundTransaction = async (fundId) => {
    const amt = parseFloat(fundTxForm.amount);
    if (!amt || amt <= 0 || !fundTxForm.label.trim()) return;
    const finalAmt = fundTxForm.isCredit ? -amt : amt;
    const tx = { id: String(Date.now()), fund_id: fundId, amount: finalAmt, label: fundTxForm.label.trim(), date: fundTxForm.date || toDateInput(todayDate) };
    setFundTransactions((prev) => [...prev, tx]);
    setFundTxForm({ amount: "", label: "", date: "", isCredit: false });
    setActiveFundId(null);
    try { await upsertFundTransaction(tx); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const removeFundTransaction = async (id) => {
    setFundTransactions((prev) => prev.filter((t) => t.id !== id));
    try { await deleteFundTransaction(id); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const saveEditFund = async () => {
    if (!editingFund) return;
    const updated = { ...funds.find((f) => f.id === editingFund.id), ...editingFund, target: editingFund.target ? parseFloat(editingFund.target) : null };
    setFunds((prev) => prev.map((f) => f.id === editingFund.id ? updated : f));
    setEditingFund(null);
    try { await upsertFund(updated); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const sync = syncStatus === "loading" ? { color: "#E8D06A", label: "⟳" } : syncStatus === "saving" ? { color: "#6A9BE8", label: "⟳" } : syncStatus === "error" ? { color: "#E86A6A", label: "⚠" } : { color: "#6AE89B", label: "●" };
  const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const calendarCells = [...Array(periodStart.getDay()).fill(null), ...days];
  const iStyle = (extra = {}) => ({ background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: "inherit", outline: "none", fontSize: 16, padding: "10px 12px", width: "100%", ...extra });

  // Credit toggle button
  const CreditToggle = ({ value, onChange }) => (
    <button type="button" className="btn" onClick={() => onChange(!value)}
      style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: value ? "#6AE89B22" : T.surface3, border: `1px solid ${value ? "#6AE89B" : T.border}`, color: value ? "#6AE89B" : T.textMuted, whiteSpace: "nowrap", flexShrink: 0 }}>
      {value ? "+ Credit" : "Expense"}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'DM Mono', 'Courier New', monospace", color: T.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .day-card { transition: all 0.15s ease; cursor: pointer; }
        .day-card:hover { opacity: 0.85; }
        .btn { transition: all 0.12s ease; cursor: pointer; border: none; }
        .btn:active { opacity: 0.7; }
        input, select { outline: none; -webkit-appearance: none; }
        input[type="number"] { -moz-appearance: textfield; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: ${darkMode ? "invert(1)" : "none"}; opacity: 0.5; cursor: pointer; }
        .slide-in { animation: slideIn 0.18s ease; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { height: 4px; width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
      `}</style>

      {/* HEADER */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "16px 16px 12px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {/* Top row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", color: T.textDim }}>BUDGET TRACKER</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: "0.05em", lineHeight: 1 }}>
                {viewMode === "monthly" ? periodStart.toLocaleDateString("en-US", { month: "long" }).toUpperCase() : "PAY PERIOD"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/* View toggle */}
              <div style={{ display: "flex", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 20, padding: 2 }}>
                {["monthly","payperiod"].map((mode) => (
                  <button key={mode} className="btn" onClick={() => setViewMode(mode)}
                    style={{ padding: "3px 8px", borderRadius: 16, fontSize: 9, letterSpacing: "0.06em", fontFamily: "inherit", background: viewMode === mode ? T.accent : "none", color: viewMode === mode ? "#fff" : T.textDim }}>
                    {mode === "monthly" ? "MO" : "PP"}
                  </button>
                ))}
              </div>
              <button className="btn" onClick={() => setDarkMode(!darkMode)}
                style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 20, padding: "4px 8px", fontSize: 13, color: T.textMuted }}>
                {darkMode ? "☀️" : "🌙"}
              </button>
              <div style={{ fontSize: 11, color: sync.color }}>{sync.label}</div>
            </div>
          </div>

          {/* Budget + period info */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 2 }}>
                {viewMode === "monthly" ? periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : `${fmtShort(periodStart)} → ${fmtShort(periodEnd)} (${periodLength}d)`}
              </div>
              {nextPayDate && viewMode === "payperiod" && <div style={{ fontSize: 9, color: T.textFaint }}>next pay: {fmtShort(nextPayDate)}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 2 }}>BUDGET</div>
              {editBudget ? (
                <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                  <span style={{ color: T.textMuted, fontSize: 13 }}>$</span>
                  <input type="number" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)}
                    onBlur={confirmBudget} onKeyDown={(e) => e.key === "Enter" && confirmBudget()} autoFocus
                    style={{ background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 16, fontFamily: "inherit", width: 80, padding: "2px 6px", textAlign: "right", outline: "none" }} />
                </div>
              ) : (
                <>
                  <div onClick={() => { setEditBudget(true); setBudgetInput(String(budget)); }} style={{ fontSize: 18, fontWeight: 500, cursor: "pointer", borderBottom: `1px dashed ${T.border2}` }}>{fmt(budget)}</div>
                  {recurringTarget > 0 && <div style={{ fontSize: 9, color: T.textFaint }}>{fmt(effectiveBudget)} discretionary</div>}
                </>
              )}
            </div>
          </div>

          {syncStatus === "error" && <div style={{ fontSize: 10, color: "#E86A6A", background: "#E86A6A11", border: "1px solid #E86A6A33", borderRadius: 6, padding: "5px 8px", marginBottom: 8 }}>{syncError}</div>}

          {/* Progress */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
            <span style={{ color: T.textMuted }}>SPENT <span style={{ color: statusColor }}>{fmt(total)}</span>{hasExcluded && <span style={{ color: T.textFaint, fontSize: 9 }}> excl.</span>}</span>
            <span style={{ color: T.textMuted }}>LEFT <span style={{ color: remaining >= 0 ? T.text : "#E86A6A" }}>{fmt(remaining)}</span></span>
          </div>
          <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${statusColor}88, ${statusColor})`, borderRadius: 3, transition: "width 0.4s ease" }} />
            <div style={{ position: "absolute", top: 0, left: `${progressFraction * 100}%`, width: 2, height: "100%", background: T.textMuted, transform: "translateX(-1px)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.textFaint, marginTop: 3 }}>
            <span>Day {daysElapsed} of {periodLength} · {fmt(dailyBudget)}/day left</span>
            <span>{pct.toFixed(1)}%</span>
          </div>
        </div>

        {/* STICKY TABS */}
        <div style={{ maxWidth: 480, margin: "0 auto", borderTop: `1px solid ${T.border}`, marginTop: 12 }}>
          <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
            {["calendar","quick add","categories","funds","summary"].map((tab) => (
              <button key={tab} className="btn" onClick={() => setActiveTab(tab)}
                style={{ padding: "10px 12px", fontSize: 10, letterSpacing: "0.08em", color: activeTab === tab ? T.text : T.textDim, borderBottom: activeTab === tab ? `2px solid ${T.accent}` : "2px solid transparent", background: "none", fontFamily: "inherit", marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0 }}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>



      {!initialized ? (
        <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", color: T.textDim, fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⟳</div>Loading...
        </div>
      ) : (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 80px" }}>

          {/* ── CALENDAR ── */}
          {activeTab === "calendar" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
                {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 9, color: T.textFaint, padding: "3px 0" }}>{d}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 16 }}>
                {calendarCells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} />;
                  const dayIdx = days.findIndex((x) => x.toDateString() === d.toDateString());
                  const dayTotal = expensesByDay[dayIdx]?.reduce((s, e) => s + parseFloat(e.amount), 0) || 0;
                  const over = dayTotal > dailyBudget;
                  const selected = dayIdx === selectedDay;
                  const todayD = isToday(d);
                  const dObj = new Date(d); dObj.setHours(0,0,0,0);
                  const past = dObj < todayDate && !todayD;
                  return (
                    <div key={i} className="day-card" onClick={() => setSelectedDay(dayIdx)}
                      style={{ background: selected ? (darkMode ? "#1F1F2E" : "#EDE8FF") : T.surface, border: `1px solid ${selected ? T.accent+"66" : todayD ? T.border2 : T.border}`, borderRadius: 8, padding: "7px 3px", textAlign: "center", opacity: past && dayTotal === 0 ? 0.3 : 1 }}>
                      <div style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: todayD ? T.accent : T.text }}>{d.getDate()}</div>
                      {dayTotal !== 0 && <div style={{ width: 4, height: 4, borderRadius: "50%", background: dayTotal < 0 ? "#6AE89B" : over ? "#E86A6A" : "#6A9BE8", margin: "3px auto 0" }} />}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 9, color: T.textDim, letterSpacing: "0.12em", marginBottom: 2 }}>{isToday(days[selectedDay]) ? "TODAY" : `DAY ${selectedDay+1}`}</div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{days[selectedDay].toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: T.textDim, marginBottom: 1 }}>REMAINING/DAY</div>
                    <div style={{ fontSize: 13, color: T.textMuted }}>{fmt(dailyBudget)}</div>
                  </div>
                </div>

                {expensesByDay[selectedDay].length === 0 ? (
                  <div style={{ textAlign: "center", color: T.textFaint, fontSize: 12, padding: "16px 0" }}>No transactions logged</div>
                ) : (
                  <div style={{ marginBottom: 12 }}>
                    {expensesByDay[selectedDay].map((e) => {
                      const cat = CATEGORIES.find((c) => c.id === e.category);
                      const isEditing = editingExpense?.id === e.id;
                      const isCredit = parseFloat(e.amount) < 0;
                      return (
                        <div key={e.id} className="slide-in" style={{ borderBottom: `1px solid ${T.surface3}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cat.color}22`, border: `1px solid ${cat.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{cat.icon}</div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                                <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{cat.label}{isCredit && <span style={{ marginLeft: 6, color: "#6AE89B" }}>· credit</span>}{excludedCats[cat.id] && <span style={{ marginLeft: 6, color: T.textFaint }}>· excl.</span>}</div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: isCredit ? "#6AE89B" : T.text }}>{isCredit ? `+${fmt(Math.abs(parseFloat(e.amount)))}` : fmt(parseFloat(e.amount))}</div>
                              <button className="btn" onClick={() => isEditing ? cancelEdit() : startEdit(e)} style={{ background: isEditing ? T.surface3 : "none", border: isEditing ? `1px solid ${T.border}` : "none", borderRadius: 6, color: isEditing ? T.accent : T.textDim, fontSize: 11, padding: "3px 7px", fontFamily: "inherit" }}>{isEditing ? "cancel" : "edit"}</button>
                              <button className="btn" onClick={() => removeExpense(e.id)} style={{ background: "none", color: T.textDim, fontSize: 20, padding: "0 2px", lineHeight: 1 }}>×</button>
                            </div>
                          </div>
                          {isEditing && (
                            <div style={{ background: T.surface2, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                                <input type="number" inputMode="decimal" value={editingExpense.amount} onChange={(e) => setEditingExpense((p) => ({ ...p, amount: e.target.value }))}
                                  style={iStyle({ flex: "0 0 110px" })} placeholder="Amount" />
                                <input type="text" value={editingExpense.label} onChange={(e) => setEditingExpense((p) => ({ ...p, label: e.target.value }))}
                                  onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={iStyle({ flex: 1 })} placeholder="Description" />
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                                {CATEGORIES.map((c) => (
                                  <button key={c.id} className="btn" onClick={() => setEditingExpense((p) => ({ ...p, category: c.id }))}
                                    style={{ padding: "6px 10px", borderRadius: 20, fontSize: 12, fontFamily: "inherit", background: editingExpense.category === c.id ? `${c.color}33` : T.surface3, border: `1px solid ${editingExpense.category === c.id ? c.color : T.border}`, color: editingExpense.category === c.id ? c.color : T.textMuted }}>
                                    {c.icon} {c.label}
                                  </button>
                                ))}
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <CreditToggle value={editingExpense.isCredit} onChange={(v) => setEditingExpense((p) => ({ ...p, isCredit: v }))} />
                                <button className="btn" onClick={saveEdit} style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>SAVE</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 12, color: T.textMuted }}>
                      <span>Day net</span>
                      <span style={{ color: T.text, fontWeight: 500 }}>{fmt(expensesByDay[selectedDay].reduce((s, e) => s + parseFloat(e.amount), 0))}</span>
                    </div>
                  </div>
                )}

                {showForm ? (
                  <div style={{ marginTop: 8, background: T.surface2, borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <input type="number" inputMode="decimal" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        style={iStyle({ flex: "0 0 110px" })} />
                      <input type="text" placeholder="Description" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && addExpense()} style={iStyle({ flex: 1 })} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                      {CATEGORIES.map((c) => (
                        <button key={c.id} className="btn" onClick={() => setForm({ ...form, category: c.id })}
                          style={{ padding: "6px 10px", borderRadius: 20, fontSize: 12, fontFamily: "inherit", background: form.category === c.id ? `${c.color}33` : T.surface3, border: `1px solid ${form.category === c.id ? c.color : T.border}`, color: form.category === c.id ? c.color : T.textMuted }}>
                          {c.icon} {c.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <CreditToggle value={form.isCredit} onChange={(v) => setForm({ ...form, isCredit: v })} />
                      <button className="btn" onClick={addExpense} style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>ADD</button>
                      <button className="btn" onClick={() => setShowForm(false)} style={{ padding: "11px 14px", background: T.surface3, color: T.textMuted, borderRadius: 8, fontSize: 13, fontFamily: "inherit", border: `1px solid ${T.border}` }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn" onClick={() => setShowForm(true)}
                    style={{ width: "100%", background: T.surface2, border: `1px dashed ${T.border}`, borderRadius: 8, padding: "13px", color: T.textDim, fontSize: 13, fontFamily: "inherit", marginTop: 4 }}>
                    + LOG TRANSACTION
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── QUICK ADD ── */}
          {activeTab === "quick add" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12, color: T.textDim }}>Fill in rows, skip blanks, tap Save.</div>
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                {rows.map((row, i) => {
                  const cat = CATEGORIES.find((c) => c.id === row.category);
                  const filled = parseFloat(row.amount) > 0 || row.label.trim();
                  return (
                    <div key={i} style={{ borderBottom: i < 4 ? `1px solid ${T.border}` : "none", padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <div style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0 }}>{filled ? cat.icon : <span style={{ color: T.textFaint }}>{i+1}</span>}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "0 0 110px" }}>
                          <span style={{ color: T.textDim, fontSize: 14 }}>$</span>
                          <input type="number" inputMode="decimal" placeholder="0.00" value={row.amount} onChange={(e) => updateRow(i, "amount", e.target.value)}
                            style={{ width: "100%", background: "transparent", border: "none", color: T.text, fontSize: 16, fontFamily: "inherit", padding: 0, outline: "none" }} />
                        </div>
                        <input type="text" placeholder="Description" value={row.label} onChange={(e) => updateRow(i, "label", e.target.value)}
                          style={{ flex: 1, background: "transparent", border: "none", color: T.text, fontSize: 15, fontFamily: "inherit", padding: 0, outline: "none" }} />
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <input type="date" value={row.date} onChange={(e) => updateRow(i, "date", e.target.value)}
                          style={{ flex: 1, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 14, padding: "8px 10px", fontFamily: "inherit", outline: "none" }} />
                        <CreditToggle value={row.isCredit} onChange={(v) => updateRow(i, "isCredit", v)} />
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {CATEGORIES.map((c) => (
                          <button key={c.id} className="btn" onClick={() => updateRow(i, "category", c.id)}
                            style={{ padding: "5px 9px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: row.category === c.id ? `${c.color}33` : T.surface2, border: `1px solid ${row.category === c.id ? c.color : T.border}`, color: row.category === c.id ? c.color : T.textDim }}>
                            {c.icon} {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: T.textMuted }}>
                    {rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).length} entries
                    {rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).length > 0 && (
                      <span style={{ marginLeft: 6, color: T.text }}>· {fmt(rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).reduce((s, r) => s + parseFloat(r.amount), 0))}</span>
                    )}
                  </div>
                  <button className="btn" onClick={saveAll} disabled={isSavingAll}
                    style={{ background: T.accent, color: "#fff", borderRadius: 8, padding: "11px 20px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", opacity: isSavingAll ? 0.6 : 1 }}>
                    {isSavingAll ? "SAVING..." : "SAVE ALL"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── CATEGORIES ── */}
          {activeTab === "categories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {totalTargeted > 0 && (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: T.textMuted }}>TARGETS ALLOCATED</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{fmt(totalTargeted)}</span>
                    <span style={{ fontSize: 11, color: totalTargeted > effectiveBudget ? "#E86A6A" : T.textDim }}>
                      {totalTargeted > effectiveBudget ? `${fmt(totalTargeted - effectiveBudget)} over` : `${fmt(effectiveBudget - totalTargeted)} unalloc.`}
                    </span>
                  </div>
                </div>
              )}
              {CATEGORIES.map((cat) => {
                const { spent, credits, net, target, remaining: catRem, pct: catPct, status } = getCatData(cat.id);
                const isEditing = editingTarget === cat.id;
                const isExcluded = !!excludedCats[cat.id];
                const catExpenses = expenses.filter((e) => e.category === cat.id).sort((a, b) => Math.abs(parseFloat(b.amount)) - Math.abs(parseFloat(a.amount)));
                const isExpanded = expandedCats[cat.id];
                return (
                  <div key={cat.id} style={{ background: T.surface, border: `1px solid ${target > 0 ? cat.color+"33" : T.border}`, borderRadius: 12, padding: 16, opacity: isExcluded ? 0.8 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: target > 0 ? 12 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cat.color}22`, border: `1px solid ${cat.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{cat.icon}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{cat.label}</div>
                            {isExcluded && <div style={{ fontSize: 9, letterSpacing: "0.08em", padding: "1px 5px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, color: T.textDim }}>EXCL</div>}
                          </div>
                          <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                            {net !== 0 ? <span style={{ color: net > 0 ? T.textMuted : "#6AE89B" }}>{fmt(net)}{credits < 0 ? ` (${fmt(Math.abs(credits))} back)` : ""}</span> : "no transactions"}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {status && !isExcluded && statusBadge(status)}
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <span style={{ color: T.textDim, fontSize: 12 }}>$</span>
                            <input type="number" inputMode="decimal" value={targetInput} onChange={(e) => setTargetInput(e.target.value)}
                              onBlur={() => confirmTarget(cat.id)} onKeyDown={(e) => e.key === "Enter" && confirmTarget(cat.id)} autoFocus placeholder="0"
                              style={{ width: 72, background: T.inputBg, border: `1px solid ${cat.color}66`, borderRadius: 6, color: T.text, fontSize: 15, padding: "4px 8px", fontFamily: "inherit", outline: "none", textAlign: "right" }} />
                          </div>
                        ) : (
                          <button className="btn" onClick={() => { setEditingTarget(cat.id); setTargetInput(target > 0 ? String(target) : ""); }}
                            style={{ background: target > 0 ? `${cat.color}22` : T.surface2, border: `1px solid ${target > 0 ? cat.color+"55" : T.border}`, borderRadius: 8, padding: "5px 10px", color: target > 0 ? cat.color : T.textDim, fontSize: 12, fontFamily: "inherit" }}>
                            {target > 0 ? fmt(target) : "Set target"}
                          </button>
                        )}
                      </div>
                    </div>
                    {target > 0 && (
                      <>
                        <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                          <div style={{ height: "100%", width: `${catPct}%`, background: catPct >= 100 ? "#E86A6A" : cat.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 4 }}>
                          {[
                            { label: "NET", value: fmt(net), color: net <= 0 ? "#6AE89B" : cat.color },
                            { label: "REMAINING", value: fmt(catRem), color: catRem >= 0 ? T.text : "#E86A6A" },
                            { label: "% USED", value: `${catPct.toFixed(0)}%`, color: catPct >= 100 ? "#E86A6A" : catPct >= 80 ? "#E8D06A" : "#6AE89B" },
                          ].map((s) => (
                            <div key={s.label} style={{ background: T.surface2, borderRadius: 8, padding: "8px 10px" }}>
                              <div style={{ fontSize: 8, letterSpacing: "0.12em", color: T.textDim, marginBottom: 3 }}>{s.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: s.color }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {/* Exclude toggle */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${T.border}`, marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: T.textDim }}>Exclude from totals</div>
                      <button className="btn" onClick={() => toggleExclude(cat.id)}
                        style={{ width: 40, height: 22, borderRadius: 11, background: isExcluded ? T.accent : T.border, position: "relative", flexShrink: 0 }}>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: isExcluded ? 21 : 3, transition: "left 0.2s" }} />
                      </button>
                    </div>
                    {/* Transactions */}
                    {catExpenses.length > 0 && (
                      <>
                        <button className="btn" onClick={() => toggleCat(cat.id)}
                          style={{ width: "100%", background: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontFamily: "inherit", borderTop: `1px solid ${T.border}` }}>
                          <span style={{ fontSize: 10, letterSpacing: "0.1em", color: T.textDim }}>{catExpenses.length} TRANSACTION{catExpenses.length !== 1 ? "S" : ""}</span>
                          <span style={{ fontSize: 11, color: T.textDim, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                        </button>
                        {isExpanded && catExpenses.map((e) => {
                          const isCredit = parseFloat(e.amount) < 0;
                          return (
                            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.surface3}` }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                                <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{new Date(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{isCredit && <span style={{ marginLeft: 6, color: "#6AE89B" }}>credit</span>}</div>
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 500, color: isCredit ? "#6AE89B" : cat.color, flexShrink: 0, marginLeft: 8 }}>{isCredit ? `+${fmt(Math.abs(parseFloat(e.amount)))}` : fmt(parseFloat(e.amount))}</div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── FUNDS ── */}
          {activeTab === "funds" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12, color: T.textDim }}>Track spending toward special goals. Doesn't affect your monthly budget.</div>

              {/* All-funds summary */}
              {funds.length > 0 && (() => {
                const allTx = fundTransactions;
                const totalSpent = allTx.reduce((s, t) => s + parseFloat(t.amount), 0);
                const ytdSpent = allTx.filter((t) => t.date.startsWith(String(new Date().getFullYear()))).reduce((s, t) => s + parseFloat(t.amount), 0);
                const totalTarget = funds.filter((f) => f.target != null).reduce((s, f) => s + parseFloat(f.target), 0);
                return (
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { label: "TOTAL SPENT", value: fmt(totalSpent) },
                      { label: "YTD SPENT", value: fmt(ytdSpent) },
                      { label: "TOTAL TARGET", value: totalTarget > 0 ? fmt(totalTarget) : "—" },
                    ].map((s) => (
                      <div key={s.label}>
                        <div style={{ fontSize: 8, letterSpacing: "0.12em", color: T.textDim, marginBottom: 3 }}>{s.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {funds.map((fund) => {
                const txs = fundTransactions.filter((t) => t.fund_id === fund.id).sort((a, b) => new Date(b.date) - new Date(a.date));
                const spent = txs.reduce((s, t) => s + parseFloat(t.amount), 0);
                const target = fund.target != null ? parseFloat(fund.target) : null;
                const pctUsed = target ? Math.min((spent / Math.max(target, 1)) * 100, 100) : null;
                const fundRemaining = target != null ? target - spent : null;
                const isExpanded = expandedFunds[fund.id];
                const isAddingTx = activeFundId === fund.id;
                const isEditingThis = editingFund?.id === fund.id;
                const daysLeft = fund.end_date ? Math.max(0, Math.ceil((new Date(fund.end_date) - new Date()) / 86400000)) : null;
                const barColor = pctUsed == null ? "#6AE89B" : pctUsed >= 100 ? "#E86A6A" : pctUsed >= 80 ? "#E8D06A" : "#6AE89B";

                // Monthly breakdown
                const monthlyMap = {};
                txs.forEach((t) => {
                  const mk = monthKey(t.date);
                  if (!monthlyMap[mk]) monthlyMap[mk] = 0;
                  monthlyMap[mk] += parseFloat(t.amount);
                });
                const monthlyEntries = Object.entries(monthlyMap).sort((a, b) => b[0].localeCompare(a[0]));
                const curMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
                const thisMonthSpent = monthlyMap[curMonthKey] || 0;

                return (
                  <div key={fund.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                    {isEditingThis ? (
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: "0.1em", color: T.textDim, marginBottom: 10 }}>EDIT FUND</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          <input type="text" value={editingFund.icon} onChange={(e) => setEditingFund((p) => ({ ...p, icon: e.target.value }))}
                            style={iStyle({ width: 52, textAlign: "center", fontSize: 20, flex: "none" })} />
                          <input type="text" placeholder="Fund name" value={editingFund.name} onChange={(e) => setEditingFund((p) => ({ ...p, name: e.target.value }))}
                            style={iStyle({ flex: 1 })} />
                        </div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                          <input type="number" inputMode="decimal" placeholder="Target (optional)" value={editingFund.target || ""} onChange={(e) => setEditingFund((p) => ({ ...p, target: e.target.value }))}
                            style={iStyle({ flex: 1 })} />
                          <input type="date" value={editingFund.end_date || ""} onChange={(e) => setEditingFund((p) => ({ ...p, end_date: e.target.value }))}
                            style={iStyle({ flex: 1 })} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn" onClick={saveEditFund} style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>SAVE</button>
                          <button className="btn" onClick={() => setEditingFund(null)} style={{ padding: "11px 14px", background: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{fund.icon}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fund.name}</div>
                              <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                                {daysLeft !== null ? (daysLeft === 0 ? "Due today" : `${daysLeft}d left`) : "No end date"}
                                {thisMonthSpent > 0 && <span style={{ marginLeft: 6 }}>· This month: <span style={{ color: T.text }}>{fmt(thisMonthSpent)}</span></span>}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button className="btn" onClick={() => setEditingFund({ ...fund })} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: T.textDim, fontSize: 11, padding: "4px 8px", fontFamily: "inherit" }}>edit</button>
                            <button className="btn" onClick={() => removeFund(fund.id)} style={{ background: "none", color: T.textDim, fontSize: 20, padding: "0 2px", lineHeight: 1 }}>×</button>
                          </div>
                        </div>

                        {target != null ? (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMuted, marginBottom: 5 }}>
                              <span style={{ color: barColor }}>{fmt(spent)}</span>
                              <span>of {fmt(target)}</span>
                            </div>
                            <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                              <div style={{ height: "100%", width: `${pctUsed}%`, background: barColor, borderRadius: 3, transition: "width 0.4s ease" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                              {[
                                { label: "SPENT", value: fmt(spent), color: barColor },
                                { label: "REMAINING", value: fmt(fundRemaining), color: fundRemaining >= 0 ? T.text : "#E86A6A" },
                                { label: "% USED", value: `${pctUsed.toFixed(0)}%`, color: pctUsed >= 100 ? "#E86A6A" : pctUsed >= 80 ? "#E8D06A" : "#6AE89B" },
                              ].map((s) => (
                                <div key={s.label} style={{ background: T.surface2, borderRadius: 8, padding: "8px 10px" }}>
                                  <div style={{ fontSize: 8, letterSpacing: "0.12em", color: T.textDim, marginBottom: 3 }}>{s.label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: s.color }}>{s.value}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 10 }}>Total spent: <span style={{ color: T.text, fontWeight: 500 }}>{fmt(spent)}</span></div>
                        )}

                        {/* Add transaction */}
                        {isAddingTx ? (
                          <div style={{ background: T.surface2, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                              <input type="number" inputMode="decimal" placeholder="Amount" value={fundTxForm.amount} onChange={(e) => setFundTxForm((p) => ({ ...p, amount: e.target.value }))}
                                style={iStyle({ flex: "0 0 110px" })} />
                              <input type="text" placeholder="Description" value={fundTxForm.label} onChange={(e) => setFundTxForm((p) => ({ ...p, label: e.target.value }))}
                                onKeyDown={(e) => e.key === "Enter" && addFundTransaction(fund.id)} style={iStyle({ flex: 1 })} />
                            </div>
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                              <input type="date" value={fundTxForm.date} onChange={(e) => setFundTxForm((p) => ({ ...p, date: e.target.value }))}
                                style={iStyle({ flex: 1 })} />
                              <CreditToggle value={fundTxForm.isCredit} onChange={(v) => setFundTxForm((p) => ({ ...p, isCredit: v }))} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn" onClick={() => addFundTransaction(fund.id)} style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>ADD</button>
                              <button className="btn" onClick={() => setActiveFundId(null)} style={{ padding: "11px 14px", background: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn" onClick={() => { setActiveFundId(fund.id); setFundTxForm({ amount: "", label: "", date: toDateInput(todayDate), isCredit: false }); }}
                            style={{ width: "100%", background: T.surface2, border: `1px dashed ${T.border}`, borderRadius: 8, padding: "10px", color: T.textDim, fontSize: 13, fontFamily: "inherit", marginBottom: txs.length > 0 ? 10 : 0 }}>
                            + LOG EXPENSE
                          </button>
                        )}

                        {/* Monthly breakdown */}
                        {monthlyEntries.length > 0 && (
                          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 4 }}>
                            <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 8 }}>MONTHLY BREAKDOWN</div>
                            {monthlyEntries.map(([mk, amt]) => (
                              <div key={mk} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${T.surface3}` }}>
                                <div style={{ fontSize: 12, color: mk === curMonthKey ? T.accent : T.text }}>{monthLabel(mk)}</div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: amt < 0 ? "#6AE89B" : T.textMuted }}>{fmt(amt)}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* All transactions */}
                        {txs.length > 0 && (
                          <>
                            <button className="btn" onClick={() => toggleFund(fund.id)}
                              style={{ width: "100%", background: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontFamily: "inherit", borderTop: `1px solid ${T.border}`, marginTop: 8 }}>
                              <span style={{ fontSize: 10, letterSpacing: "0.1em", color: T.textDim }}>{txs.length} TRANSACTION{txs.length !== 1 ? "S" : ""}</span>
                              <span style={{ fontSize: 11, color: T.textDim, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                            </button>
                            {isExpanded && txs.map((t) => {
                              const isCredit = parseFloat(t.amount) < 0;
                              return (
                                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.surface3}` }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</div>
                                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{new Date(t.date+"T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{isCredit && <span style={{ marginLeft: 6, color: "#6AE89B" }}>credit</span>}</div>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: isCredit ? "#6AE89B" : T.textMuted }}>{isCredit ? `+${fmt(Math.abs(parseFloat(t.amount)))}` : fmt(parseFloat(t.amount))}</div>
                                    <button className="btn" onClick={() => removeFundTransaction(t.id)} style={{ background: "none", color: T.textDim, fontSize: 18, padding: "0 2px", lineHeight: 1 }}>×</button>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {showNewFund ? (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", color: T.textDim, marginBottom: 12 }}>NEW FUND</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <input type="text" placeholder="🎯" value={newFund.icon} onChange={(e) => setNewFund((p) => ({ ...p, icon: e.target.value }))}
                      style={iStyle({ width: 52, textAlign: "center", fontSize: 20, flex: "none" })} />
                    <input type="text" placeholder="Fund name (e.g. Christmas)" value={newFund.name} onChange={(e) => setNewFund((p) => ({ ...p, name: e.target.value }))}
                      style={iStyle({ flex: 1 })} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input type="number" inputMode="decimal" placeholder="Target (optional)" value={newFund.target} onChange={(e) => setNewFund((p) => ({ ...p, target: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && createFund()} style={iStyle({ flex: 1 })} />
                    <div style={{ flex: 1 }}>
                      <input type="date" value={newFund.end_date} onChange={(e) => setNewFund((p) => ({ ...p, end_date: e.target.value }))}
                        style={iStyle({})} />
                      <div style={{ fontSize: 9, color: T.textFaint, marginTop: 3 }}>End date (optional)</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={createFund} style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>CREATE FUND</button>
                    <button className="btn" onClick={() => setShowNewFund(false)} style={{ padding: "12px 14px", background: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}>✕</button>
                  </div>
                </div>
              ) : (
                <button className="btn" onClick={() => setShowNewFund(true)}
                  style={{ width: "100%", background: T.surface, border: `1px dashed ${T.border}`, borderRadius: 12, padding: "14px", color: T.textDim, fontSize: 13, fontFamily: "inherit" }}>
                  + NEW FUND
                </button>
              )}
            </div>
          )}

          {/* ── SUMMARY ── */}
          {activeTab === "summary" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "DISCRETIONARY", value: fmt(total), color: statusColor },
                  { label: "REMAINING", value: fmt(remaining), color: remaining >= 0 ? "#6AE89B" : "#E86A6A" },
                  { label: hasExcluded ? "TOTAL (ALL)" : "DAILY AVG", value: hasExcluded ? fmt(totalIncExcluded) : fmt(total / Math.max(daysElapsed, 1)), color: T.text },
                  { label: "TRANSACTIONS", value: String(expenses.length), color: T.text },
                ].map((s) => (
                  <div key={s.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 8, letterSpacing: "0.12em", color: T.textDim, marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 500, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 14 }}>BY CATEGORY</div>
                {CATEGORIES.map((cat) => {
                  const { net, target, pct: catPct, status } = getCatData(cat.id);
                  if (net === 0 && target === 0) return null;
                  const isExcluded = !!excludedCats[cat.id];
                  const barPct = target > 0 ? catPct : (total > 0 ? (Math.max(net,0) / total) * 100 : 0);
                  const catExpenses = expenses.filter((e) => e.category === cat.id).sort((a, b) => Math.abs(parseFloat(b.amount)) - Math.abs(parseFloat(a.amount)));
                  const isExpanded = expandedCats[`summary_${cat.id}`];
                  return (
                    <div key={cat.id} style={{ marginBottom: 14, opacity: isExcluded ? 0.6 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13 }}>{cat.icon} {cat.label}</span>
                          {isExcluded && <span style={{ fontSize: 9, color: T.textFaint }}>EXCL</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {status && !isExcluded && statusBadge(status)}
                          <span style={{ fontSize: 12, color: net <= 0 ? "#6AE89B" : cat.color }}>{net <= 0 ? `+${fmt(Math.abs(net))}` : fmt(net)}{target > 0 ? ` / ${fmt(target)}` : ""}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ height: "100%", width: `${barPct}%`, background: target > 0 && catPct >= 100 ? "#E86A6A" : cat.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                      </div>
                      {catExpenses.length > 0 && (
                        <>
                          <button className="btn" onClick={() => toggleCat(`summary_${cat.id}`)}
                            style={{ background: "none", display: "flex", justifyContent: "space-between", width: "100%", padding: "4px 0", fontFamily: "inherit" }}>
                            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: T.textDim }}>{catExpenses.length} TRANSACTION{catExpenses.length !== 1 ? "S" : ""}</span>
                            <span style={{ fontSize: 11, color: T.textDim, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                          </button>
                          {isExpanded && catExpenses.map((e) => {
                            const isCredit = parseFloat(e.amount) < 0;
                            return (
                              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.surface3}` }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{new Date(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{isCredit && <span style={{ marginLeft: 6, color: "#6AE89B" }}>credit</span>}</div>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: isCredit ? "#6AE89B" : cat.color, flexShrink: 0, marginLeft: 8 }}>{isCredit ? `+${fmt(Math.abs(parseFloat(e.amount)))}` : fmt(parseFloat(e.amount))}</div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                }).filter(Boolean)}
                {CATEGORIES.every((c) => getCatData(c.id).net === 0 && getCatData(c.id).target === 0) && (
                  <div style={{ textAlign: "center", color: T.textFaint, fontSize: 12, padding: "14px 0" }}>No expenses yet</div>
                )}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 14 }}>DAILY BREAKDOWN</div>
                {days.some((d, i) => expensesByDay[i].reduce((s, e) => s + parseFloat(e.amount), 0) !== 0) ? (
                  days.map((d, i) => {
                    const dayTotal = expensesByDay[i].reduce((s, e) => s + parseFloat(e.amount), 0);
                    if (dayTotal === 0) return null;
                    const over = dayTotal > dailyBudget;
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.surface3}`, cursor: "pointer" }}
                        onClick={() => { setSelectedDay(i); setActiveTab("calendar"); }}>
                        <div style={{ fontSize: 12, color: isToday(d) ? T.accent : T.text }}>{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 12, color: dayTotal < 0 ? "#6AE89B" : over ? "#E86A6A" : "#6AE89B" }}>{dayTotal < 0 ? `+${fmt(Math.abs(dayTotal))}` : fmt(dayTotal)}</div>
                          {over && dayTotal > 0 && <div style={{ fontSize: 9, color: "#E86A6A" }}>OVER</div>}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: "center", color: T.textFaint, fontSize: 12, padding: "14px 0" }}>No expenses logged yet</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
