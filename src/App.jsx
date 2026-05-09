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

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "groceries", label: "Groceries", color: "#6AE89B", icon: "🛒" },
  { id: "transport", label: "Transport", color: "#6A9BE8", icon: "🚗" },
  { id: "shopping", label: "Shopping", color: "#B86AE8", icon: "🛍️" },
  { id: "dining", label: "Dining Out", color: "#E8936A", icon: "🍽️" },
  { id: "venmo", label: "Venmo", color: "#3D95CE", icon: "💸" },
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

const lastBizDay = (year, month) => { const d = new Date(year, month + 1, 0); while (!isWeekday(d)) d.setDate(d.getDate() - 1); return new Date(d); };
const midMonthPayDay = (year, month) => { const d = new Date(year, month, 15); while (!isWeekday(d)) d.setDate(d.getDate() - 1); return new Date(d); };

const getPayDates = () => {
  const today = new Date();
  const dates = [];
  for (let offset = -2; offset <= 3; offset++) {
    const m = (today.getMonth() + offset + 120) % 12;
    const y = today.getFullYear() + Math.floor((today.getMonth() + offset) / 12);
    dates.push(midMonthPayDay(y, m));
    dates.push(lastBizDay(y, m));
  }
  return dates.sort((a, b) => a - b).filter((d, i, arr) => i === 0 || d.toDateString() !== arr[i - 1].toDateString());
};

const getCurrentPayPeriod = (payDates) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let startIdx = 0;
  for (let i = payDates.length - 1; i >= 0; i--) {
    const pd = new Date(payDates[i]); pd.setHours(0, 0, 0, 0);
    if (pd <= today) { startIdx = i; break; }
  }
  const start = new Date(payDates[startIdx]); start.setHours(0, 0, 0, 0);
  const nextPay = payDates[startIdx + 1];
  let end;
  if (nextPay) { end = new Date(nextPay); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - 1); }
  else { end = new Date(start); end.setDate(start.getDate() + 13); }
  return { start, end, nextPayDate: nextPay || null };
};

const getCurrentMonthPeriod = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start, end, nextPayDate: null };
};

const getDaysInPeriod = (start, end) => {
  const days = []; const cur = new Date(start);
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
};

// Get all period keys that overlap with a date range (for loading expenses)
const getPeriodKeysForRange = (start, end, payDates) => {
  const keys = new Set();
  // Monthly key
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    keys.add(`${y}-${m}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  // Pay period keys that overlap
  for (let i = 0; i < payDates.length - 1; i++) {
    const ps = new Date(payDates[i]); ps.setHours(0,0,0,0);
    const pe = new Date(payDates[i + 1]); pe.setHours(0,0,0,0); pe.setDate(pe.getDate() - 1);
    if (ps <= end && pe >= start) keys.add(ps.toISOString().slice(0, 10));
  }
  return [...keys];
};

const periodKey = (start, mode) => mode === "monthly"
  ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`
  : start.toISOString().slice(0, 10);

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const todayDate = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const payDates = useMemo(() => getPayDates(), []);

  // View mode: "monthly" | "payperiod"
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("budgetViewMode") || "monthly");
  useEffect(() => { localStorage.setItem("budgetViewMode", viewMode); }, [viewMode]);

  const { start: periodStart, end: periodEnd, nextPayDate } = useMemo(() => (
    viewMode === "monthly" ? getCurrentMonthPeriod() : getCurrentPayPeriod(payDates)
  ), [viewMode, payDates]);

  const days = useMemo(() => getDaysInPeriod(periodStart, periodEnd), [periodStart, periodEnd]);
  const periodLength = days.length;
  const curPeriodKey = useMemo(() => periodKey(periodStart, viewMode), [periodStart, viewMode]);

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("budgetTheme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => { localStorage.setItem("budgetTheme", darkMode ? "dark" : "light"); }, [darkMode]);
  const T = darkMode ? DARK : LIGHT;

  const [budget, setBudget] = useState(1000);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("1000");
  const [allExpenses, setAllExpenses] = useState([]); // all loaded expenses
  const [selectedDay, setSelectedDay] = useState(() => {
    const idx = days.findIndex((d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() === todayDate.getTime(); });
    return idx >= 0 ? idx : 0;
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", label: "", category: "groceries" });
  const [activeTab, setActiveTab] = useState("calendar");
  const [catTargets, setCatTargets] = useState({});
  const [excludedCats, setExcludedCats] = useState({}); // { [catId]: bool }
  const [editingTarget, setEditingTarget] = useState(null);
  const [targetInput, setTargetInput] = useState("");
  const [expandedCats, setExpandedCats] = useState({});
  const toggleCat = (id) => setExpandedCats((prev) => ({ ...prev, [id]: !prev[id] }));
  const [editingExpense, setEditingExpense] = useState(null); // { id, amount, label, category }
  const startEdit = (e) => setEditingExpense({ id: e.id, amount: String(e.amount), label: e.label, category: e.category });
  const cancelEdit = () => setEditingExpense(null);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [syncError, setSyncError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Quick Add
  const toDateInput = (d) => d.toISOString().slice(0, 10);
  const fromDateInput = (s) => new Date(s + "T00:00:00");
  const emptyRow = () => ({ amount: "", label: "", category: "groceries", date: toDateInput(todayDate) });
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, emptyRow));
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Load expenses for the current period range
  useEffect(() => {
    (async () => {
      setSyncStatus("loading");
      setInitialized(false);
      try {
        const keys = getPeriodKeysForRange(periodStart, periodEnd, payDates);
        const [exps, settings] = await Promise.all([
          loadExpensesForPeriods(keys),
          loadSettings(),
        ]);
        // Filter to only expenses whose date falls within the period
        const filtered = (exps || []).filter((e) => {
          const d = new Date(e.date); d.setHours(0,0,0,0);
          return d >= periodStart && d <= periodEnd;
        });
        setAllExpenses(filtered);
        const sm = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
        // Load budget for current period key + mode
        const bKey = `budget_${viewMode}_${curPeriodKey}`;
        if (sm[bKey]) { const b = parseFloat(sm[bKey]); setBudget(b); setBudgetInput(String(b)); }
        else { setBudget(1000); setBudgetInput("1000"); }
        // Load category targets
        const targets = {};
        CATEGORIES.forEach((c) => {
          const val = sm[`target_${viewMode}_${curPeriodKey}_${c.id}`];
          if (val) targets[c.id] = parseFloat(val);
        });
        setCatTargets(targets);
        // Load excluded cats (global, not per-period)
        const excl = {};
        CATEGORIES.forEach((c) => { if (sm[`exclude_${c.id}`] === "true") excl[c.id] = true; });
        setExcludedCats(excl);
        setSyncStatus("idle");
        setInitialized(true);
      } catch (e) {
        setSyncStatus("error"); setSyncError(e.message); setInitialized(true);
      }
    })();
  }, [viewMode, curPeriodKey]);

  // Reset selectedDay when period changes
  useEffect(() => {
    const idx = days.findIndex((d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() === todayDate.getTime(); });
    setSelectedDay(idx >= 0 ? idx : 0);
  }, [viewMode]);

  // Expenses filtered to current view window
  const expenses = allExpenses;
  const expensesByDay = days.map((d) => expenses.filter((e) => e.date === d.toDateString()));

  // Totals — excluded categories don't count toward header totals
  const total = expenses.filter((e) => !excludedCats[e.category]).reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalIncExcluded = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
  const recurringTarget = catTargets["recurring"] || 0;
  const effectiveBudget = Math.max(budget - recurringTarget, 0);
  const remaining = effectiveBudget - total;
  const pct = Math.min((total / Math.max(effectiveBudget, 1)) * 100, 100);
  const dailyBudget = effectiveBudget / periodLength;
  const expectedPct = progressFraction * 100;
  const paceRatio = expectedPct > 0 ? pct / expectedPct : 0;
  const statusColor = paceRatio <= 1.0 ? "#6AE89B" : paceRatio <= 1.25 ? "#E8D06A" : "#E86A6A";
  const daysElapsed = Math.max(1, days.filter((d) => { const x = new Date(d); x.setHours(0,0,0,0); return x <= todayDate; }).length);
  const progressFraction = daysElapsed / periodLength;
  const totalTargeted = Object.values(catTargets).reduce((s, v) => s + (v || 0), 0);
  const hasExcluded = Object.values(excludedCats).some(Boolean);

  const getCatData = (catId) => {
    const spent = expenses.filter((e) => e.category === catId).reduce((s, e) => s + parseFloat(e.amount), 0);
    const target = catTargets[catId] || 0;
    const catRemaining = target > 0 ? target - spent : null;
    const catPct = target > 0 ? Math.min((spent / target) * 100, 100) : null;
    let status = null;
    if (target > 0) {
      const ratio = spent / Math.max(target * progressFraction, 0.01);
      if (ratio <= 0.85) status = "ahead";
      else if (ratio <= 1.1) status = "on track";
      else status = "over pace";
    }
    return { spent, target, remaining: catRemaining, pct: catPct, status };
  };

  const statusBadge = (status) => {
    if (!status) return null;
    const map = { ahead: { bg: "#6AE89B22", border: "#6AE89B55", color: "#6AE89B", label: "AHEAD" }, "on track": { bg: "#6A9BE822", border: "#6A9BE855", color: "#6A9BE8", label: "ON TRACK" }, "over pace": { bg: "#E86A6A22", border: "#E86A6A55", color: "#E86A6A", label: "OVER PACE" } };
    const s = map[status];
    return <div style={{ fontSize: 9, letterSpacing: "0.12em", padding: "2px 7px", borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, color: s.color, whiteSpace: "nowrap" }}>{s.label}</div>;
  };

  const addExpense = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0 || !form.label.trim()) return;
    const exp = { id: String(Date.now()), date: days[selectedDay].toDateString(), amount: amt, label: form.label.trim(), category: form.category, period: curPeriodKey };
    setAllExpenses((prev) => [...prev, exp]);
    setForm({ amount: "", label: "", category: "groceries" });
    setShowForm(false);
    setSyncStatus("saving");
    try { await upsertExpense(exp); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const removeExpense = async (id) => {
    setAllExpenses((prev) => prev.filter((e) => e.id !== String(id)));
    setSyncStatus("saving");
    try { await deleteExpense(String(id)); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const saveEdit = async () => {
    if (!editingExpense) return;
    const amt = parseFloat(editingExpense.amount);
    if (!amt || amt <= 0 || !editingExpense.label.trim()) return;
    const updated = { ...allExpenses.find((e) => e.id === editingExpense.id), amount: amt, label: editingExpense.label.trim(), category: editingExpense.category };
    setAllExpenses((prev) => prev.map((e) => e.id === editingExpense.id ? updated : e));
    setEditingExpense(null);
    setSyncStatus("saving");
    try { await upsertExpense(updated); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const confirmBudget = async () => {
    const v = parseFloat(budgetInput);
    if (v > 0) {
      setBudget(v);
      setSyncStatus("saving");
      try { await upsertSetting(`budget_${viewMode}_${curPeriodKey}`, v); setSyncStatus("idle"); }
      catch (e) { setSyncStatus("error"); setSyncError(e.message); }
    }
    setEditBudget(false);
  };

  const confirmTarget = async (catId) => {
    const v = parseFloat(targetInput);
    const val = v > 0 ? v : 0;
    setCatTargets((prev) => ({ ...prev, [catId]: val }));
    setEditingTarget(null); setTargetInput("");
    setSyncStatus("saving");
    try { await upsertSetting(`target_${viewMode}_${curPeriodKey}_${catId}`, val); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const toggleExclude = async (catId) => {
    const newVal = !excludedCats[catId];
    setExcludedCats((prev) => ({ ...prev, [catId]: newVal }));
    setSyncStatus("saving");
    try { await upsertSetting(`exclude_${catId}`, newVal); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const updateRow = (i, field, value) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const saveAll = async () => {
    const valid = rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim());
    if (valid.length === 0) return;
    setIsSavingAll(true);
    setSyncStatus("saving");
    try {
      const toSave = valid.map((r) => ({
        id: String(Date.now() + Math.random()),
        date: (r.date ? fromDateInput(r.date) : todayDate).toDateString(),
        amount: parseFloat(r.amount),
        label: r.label.trim(),
        category: r.category || "other",
        period: curPeriodKey,
      }));
      await Promise.all(toSave.map(upsertExpense));
      setAllExpenses((prev) => [...prev, ...toSave]);
      setRows(Array.from({ length: 5 }, emptyRow));
      setSyncStatus("idle");
      setActiveTab("calendar");
    } catch (e) { setSyncStatus("error"); setSyncError(`Quick Add: ${e.message}`); }
    setIsSavingAll(false);
  };

  const sync = syncStatus === "loading" ? { color: "#E8D06A", label: "⟳ LOADING" }
    : syncStatus === "saving" ? { color: "#6A9BE8", label: "⟳ SAVING" }
    : syncStatus === "error" ? { color: "#E86A6A", label: "⚠ ERROR" }
    : { color: "#6AE89B", label: "● SYNCED" };

  const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const calendarCells = [...Array(periodStart.getDay()).fill(null), ...days];
  const inputStyle = (extra = {}) => ({ background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontFamily: "inherit", outline: "none", ...extra });

  const periodLabel = viewMode === "monthly"
    ? periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : `${fmtShort(periodStart)} → ${fmtShort(periodEnd)}`;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'DM Mono', 'Courier New', monospace", color: T.text, transition: "background 0.2s, color 0.2s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .day-card { transition: all 0.15s ease; cursor: pointer; }
        .day-card:hover { transform: translateY(-2px); }
        .btn { transition: all 0.12s ease; cursor: pointer; border: none; }
        .btn:hover { opacity: 0.82; }
        input { outline: none; }
        .slide-in { animation: slideIn 0.18s ease; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: ${darkMode ? "invert(1)" : "none"}; opacity: 0.5; }
      `}</style>

      {/* HEADER */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "20px 24px 16px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", color: T.textDim, marginBottom: 2 }}>BUDGET TRACKER</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, letterSpacing: "0.05em", lineHeight: 1 }}>
                {viewMode === "monthly" ? periodStart.toLocaleDateString("en-US", { month: "long" }).toUpperCase() : "PAY PERIOD"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              {/* View mode toggle */}
              <div style={{ display: "flex", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 20, padding: 2, gap: 2 }}>
                {["monthly", "payperiod"].map((mode) => (
                  <button key={mode} className="btn" onClick={() => setViewMode(mode)}
                    style={{ padding: "3px 10px", borderRadius: 16, fontSize: 10, letterSpacing: "0.08em", fontFamily: "inherit", background: viewMode === mode ? T.accent : "none", color: viewMode === mode ? "#fff" : T.textDim }}>
                    {mode === "monthly" ? "MONTHLY" : "PAY PERIOD"}
                  </button>
                ))}
              </div>
              {/* Theme toggle */}
              <button className="btn" onClick={() => setDarkMode(!darkMode)}
                style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, color: T.textMuted, fontFamily: "inherit" }}>
                {darkMode ? "☀️ Light" : "🌙 Dark"}
              </button>
              {/* Budget */}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.15em", color: T.textDim, marginBottom: 2 }}>BUDGET</div>
                {editBudget ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                    <span style={{ color: T.textMuted }}>$</span>
                    <input type="number" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)}
                      onBlur={confirmBudget} onKeyDown={(e) => e.key === "Enter" && confirmBudget()} autoFocus
                      style={inputStyle({ fontSize: 18, width: 90, padding: "2px 6px", textAlign: "right" })} />
                  </div>
                ) : (
                  <div onClick={() => { setEditBudget(true); setBudgetInput(String(budget)); }}
                    style={{ fontSize: 20, fontWeight: 500, cursor: "pointer", borderBottom: `1px dashed ${T.border2}` }}>{fmt(budget)}</div>
                  {recurringTarget > 0 && <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{fmt(effectiveBudget)} discretionary</div>}
                )}
              </div>
            </div>
          </div>

          {/* Period info */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: T.textDim }}>
              {viewMode === "monthly" ? (
                <span style={{ color: T.accent }}>{periodLabel}</span>
              ) : (
                <>
                  <span style={{ color: T.accent }}>{fmtShort(periodStart)}</span>
                  <span style={{ margin: "0 6px", color: T.textFaint }}>→</span>
                  <span style={{ color: T.accent }}>{fmtShort(periodEnd)}</span>
                  <span style={{ marginLeft: 8, color: T.textFaint }}>({periodLength}d)</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {nextPayDate && viewMode === "payperiod" && <div style={{ fontSize: 10, color: T.textFaint }}>next: <span style={{ color: T.textMuted }}>{fmtShort(nextPayDate)}</span></div>}
              <div style={{ fontSize: 9, color: sync.color, letterSpacing: "0.1em" }}>{sync.label}</div>
            </div>
          </div>

          {syncStatus === "error" && <div style={{ fontSize: 10, color: "#E86A6A", background: "#E86A6A11", border: "1px solid #E86A6A33", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>{syncError}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: T.textMuted }}>
            <span>SPENT <span style={{ color: statusColor }}>{fmt(total)}</span>{hasExcluded && <span style={{ color: T.textFaint, fontSize: 10 }}> (excl. fixed)</span>}</span>
            <span>LEFT <span style={{ color: remaining >= 0 ? T.text : "#E86A6A" }}>{fmt(remaining)}</span></span>
          </div>
          <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${statusColor}88, ${statusColor})`, borderRadius: 3, transition: "width 0.4s ease" }} />
            <div style={{ position: "absolute", top: 0, left: `${progressFraction * 100}%`, width: 2, height: "100%", background: T.textMuted, transform: "translateX(-1px)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textFaint, marginTop: 4 }}>
            <span>Day {daysElapsed} of {periodLength}</span>
            <span>{pct.toFixed(1)}% of budget used</span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
          {["calendar", "quick add", "categories", "summary"].map((tab) => (
            <button key={tab} className="btn" onClick={() => setActiveTab(tab)}
              style={{ padding: "12px 14px", fontSize: 11, letterSpacing: "0.1em", color: activeTab === tab ? T.text : T.textDim, borderBottom: activeTab === tab ? `2px solid ${T.accent}` : "2px solid transparent", background: "none", fontFamily: "inherit", marginBottom: -1, whiteSpace: "nowrap" }}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!initialized ? (
        <div style={{ maxWidth: 600, margin: "80px auto", textAlign: "center", color: T.textDim, fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⟳</div>Loading...
        </div>
      ) : (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 24px 60px" }}>

          {/* CALENDAR */}
          {activeTab === "calendar" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
                {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 9, color: T.textFaint, padding: "4px 0" }}>{d}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 24 }}>
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
                      style={{ background: selected ? (darkMode ? "#1F1F2E" : "#EDE8FF") : T.surface, border: `1px solid ${selected ? T.accent + "66" : todayD ? T.border2 : T.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center", opacity: past && dayTotal === 0 ? 0.35 : 1 }}>
                      <div style={{ fontSize: 13, fontWeight: selected ? 500 : 400, color: todayD ? T.accent : T.text }}>{d.getDate()}</div>
                      {dayTotal > 0 && <div style={{ width: 4, height: 4, borderRadius: "50%", background: over ? "#E86A6A" : "#6AE89B", margin: "4px auto 0" }} />}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.15em", marginBottom: 2 }}>{isToday(days[selectedDay]) ? "TODAY" : `DAY ${selectedDay + 1}`}</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{days[selectedDay].toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 2 }}>DAILY BUDGET</div>
                    <div style={{ fontSize: 13, color: T.textMuted }}>{fmt(dailyBudget)}</div>
                  </div>
                </div>

                {expensesByDay[selectedDay].length === 0 ? (
                  <div style={{ textAlign: "center", color: T.textFaint, fontSize: 12, padding: "20px 0" }}>No expenses logged</div>
                ) : (
                  <div style={{ marginBottom: 12 }}>
                    {expensesByDay[selectedDay].map((e) => {
                      const cat = CATEGORIES.find((c) => c.id === e.category);
                      const isEditing = editingExpense?.id === e.id;
                      return (
                        <div key={e.id} className="slide-in" style={{ borderBottom: `1px solid ${T.surface3}` }}>
                          {/* Row */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: `${cat.color}22`, border: `1px solid ${cat.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{cat.icon}</div>
                              <div>
                                <div style={{ fontSize: 13 }}>{e.label}</div>
                                <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                                  {cat.label}{excludedCats[cat.id] && <span style={{ marginLeft: 6, color: T.textFaint }}>· excluded</span>}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, opacity: excludedCats[cat.id] ? 0.5 : 1 }}>{fmt(parseFloat(e.amount))}</div>
                              <button className="btn" onClick={() => isEditing ? cancelEdit() : startEdit(e)}
                                style={{ background: isEditing ? T.surface3 : "none", border: isEditing ? `1px solid ${T.border}` : "none", borderRadius: 6, color: isEditing ? T.accent : T.textDim, fontSize: 11, padding: "2px 7px", fontFamily: "inherit" }}>
                                {isEditing ? "cancel" : "edit"}
                              </button>
                              <button className="btn" onClick={() => removeExpense(e.id)} style={{ background: "none", color: T.textDim, fontSize: 18, padding: "0 2px", lineHeight: 1 }}>×</button>
                            </div>
                          </div>
                          {/* Inline edit panel */}
                          {isEditing && (
                            <div style={{ background: T.surface2, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                                <input type="number" value={editingExpense.amount} onChange={(e) => setEditingExpense((prev) => ({ ...prev, amount: e.target.value }))}
                                  style={{ flex: "0 0 90px", background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 14, padding: "7px 10px", fontFamily: "inherit", outline: "none" }} />
                                <input type="text" value={editingExpense.label} onChange={(e) => setEditingExpense((prev) => ({ ...prev, label: e.target.value }))}
                                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                                  style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 14, padding: "7px 10px", fontFamily: "inherit", outline: "none" }} />
                              </div>
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                                {CATEGORIES.map((c) => (
                                  <button key={c.id} className="btn" onClick={() => setEditingExpense((prev) => ({ ...prev, category: c.id }))}
                                    style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: editingExpense.category === c.id ? `${c.color}33` : T.surface3, border: `1px solid ${editingExpense.category === c.id ? c.color : T.border}`, color: editingExpense.category === c.id ? c.color : T.textMuted }}>
                                    {c.icon} {c.label}
                                  </button>
                                ))}
                              </div>
                              <button className="btn" onClick={saveEdit}
                                style={{ width: "100%", background: T.accent, color: "#fff", borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 500, fontFamily: "inherit", letterSpacing: "0.1em" }}>
                                SAVE CHANGES
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 10, fontSize: 12, color: T.textMuted }}>
                      Day total: <span style={{ marginLeft: 8, color: T.text, fontWeight: 500 }}>{fmt(expensesByDay[selectedDay].reduce((s, e) => s + parseFloat(e.amount), 0))}</span>
                    </div>
                  </div>
                )}

                {showForm ? (
                  <div style={{ marginTop: 12, background: T.surface2, borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        style={inputStyle({ flex: "0 0 100px", fontSize: 14, padding: "8px 10px" })} />
                      <input type="text" placeholder="Description" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && addExpense()}
                        style={inputStyle({ flex: 1, fontSize: 14, padding: "8px 10px" })} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      {CATEGORIES.map((c) => (
                        <button key={c.id} className="btn" onClick={() => setForm({ ...form, category: c.id })}
                          style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: form.category === c.id ? `${c.color}33` : T.surface3, border: `1px solid ${form.category === c.id ? c.color : T.border}`, color: form.category === c.id ? c.color : T.textMuted }}>
                          {c.icon} {c.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={addExpense} style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 500, fontFamily: "inherit", letterSpacing: "0.1em" }}>ADD EXPENSE</button>
                      <button className="btn" onClick={() => setShowForm(false)} style={{ padding: "10px 16px", background: T.surface3, color: T.textMuted, borderRadius: 8, fontSize: 12, fontFamily: "inherit", border: `1px solid ${T.border}` }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn" onClick={() => setShowForm(true)}
                    style={{ width: "100%", background: T.surface2, border: `1px dashed ${T.border}`, borderRadius: 8, padding: "12px", color: T.textDim, fontSize: 12, fontFamily: "inherit", letterSpacing: "0.1em", marginTop: 4 }}>
                    + LOG EXPENSE
                  </button>
                )}
              </div>
            </>
          )}

          {/* QUICK ADD */}
          {activeTab === "quick add" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, color: T.textDim }}>Fill in what you need, skip the rest, then hit Save.</div>
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 36px", padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
                  {["AMOUNT", "DESCRIPTION", "DATE", ""].map((h) => <div key={h} style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textFaint }}>{h}</div>)}
                </div>
                {rows.map((row, i) => {
                  const cat = CATEGORIES.find((c) => c.id === row.category);
                  const filled = parseFloat(row.amount) > 0 || row.label.trim();
                  return (
                    <div key={i} style={{ borderBottom: i < 4 ? `1px solid ${T.border}` : "none" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 36px", padding: "10px 16px", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ color: T.textDim, fontSize: 12 }}>$</span>
                          <input type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateRow(i, "amount", e.target.value)}
                            style={{ width: "100%", background: "transparent", border: "none", color: T.text, fontSize: 14, fontFamily: "inherit", padding: 0 }} />
                        </div>
                        <input type="text" placeholder="Description" value={row.label} onChange={(e) => updateRow(i, "label", e.target.value)}
                          style={{ background: "transparent", border: "none", color: T.text, fontSize: 13, fontFamily: "inherit", padding: "0 8px" }} />
                        <input type="date" value={row.date} onChange={(e) => updateRow(i, "date", e.target.value)}
                          style={{ background: "transparent", border: "none", color: filled ? T.text : T.textDim, fontSize: 11, fontFamily: "inherit", padding: 0, width: "100%" }} />
                        <div style={{ textAlign: "center", fontSize: 15 }}>{filled ? cat.icon : ""}</div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "0 16px 10px" }}>
                        {CATEGORIES.map((c) => (
                          <button key={c.id} className="btn" onClick={() => updateRow(i, "category", c.id)}
                            style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: row.category === c.id ? `${c.color}33` : T.surface2, border: `1px solid ${row.category === c.id ? c.color : T.border}`, color: row.category === c.id ? c.color : T.textDim }}>
                            {c.icon} {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={{ padding: "14px 16px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: T.textMuted }}>
                    {rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).length} entries
                    {rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).length > 0 && (
                      <span style={{ marginLeft: 8, color: T.text }}>· {fmt(rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).reduce((s, r) => s + parseFloat(r.amount), 0))}</span>
                    )}
                  </div>
                  <button className="btn" onClick={saveAll} disabled={isSavingAll}
                    style={{ background: T.accent, color: "#fff", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 500, fontFamily: "inherit", letterSpacing: "0.1em", opacity: isSavingAll ? 0.6 : 1 }}>
                    {isSavingAll ? "SAVING..." : "SAVE ALL"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CATEGORIES */}
          {activeTab === "categories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>Set targets and manage which categories count toward your budget total.</div>
              {totalTargeted > 0 && (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: T.textMuted }}>TARGETS ALLOCATED</div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{fmt(totalTargeted)}</span>
                    <span style={{ fontSize: 11, color: totalTargeted > effectiveBudget ? "#E86A6A" : T.textDim }}>
                      {totalTargeted > effectiveBudget ? `${fmt(totalTargeted - effectiveBudget)} over` : `${fmt(effectiveBudget - totalTargeted)} unallocated`}
                    </span>
                  </div>
                </div>
              )}
              {CATEGORIES.map((cat) => {
                const { spent, target, remaining: catRem, pct: catPct, status } = getCatData(cat.id);
                const isEditing = editingTarget === cat.id;
                const isExcluded = !!excludedCats[cat.id];
                return (
                  <div key={cat.id} style={{ background: T.surface, border: `1px solid ${target > 0 ? cat.color + "33" : T.border}`, borderRadius: 12, padding: 18, opacity: isExcluded ? 0.8 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: target > 0 ? 14 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cat.color}22`, border: `1px solid ${cat.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{cat.icon}</div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{cat.label}</div>
                            {isExcluded && (
                              <div style={{ fontSize: 9, letterSpacing: "0.1em", padding: "2px 6px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, color: T.textDim }}>EXCLUDED</div>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{spent > 0 ? `${fmt(spent)} spent` : "no expenses yet"}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {status && !isExcluded && statusBadge(status)}
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ color: T.textDim, fontSize: 12 }}>$</span>
                            <input type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)}
                              onBlur={() => confirmTarget(cat.id)} onKeyDown={(e) => e.key === "Enter" && confirmTarget(cat.id)} autoFocus placeholder="0"
                              style={inputStyle({ width: 80, fontSize: 14, padding: "4px 8px", textAlign: "right", border: `1px solid ${cat.color}66` })} />
                          </div>
                        ) : (
                          <button className="btn" onClick={() => { setEditingTarget(cat.id); setTargetInput(target > 0 ? String(target) : ""); }}
                            style={{ background: target > 0 ? `${cat.color}22` : T.surface2, border: `1px solid ${target > 0 ? cat.color + "55" : T.border}`, borderRadius: 8, padding: "5px 12px", color: target > 0 ? cat.color : T.textDim, fontSize: 12, fontFamily: "inherit" }}>
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          {[
                            { label: "SPENT", value: fmt(spent), color: cat.color },
                            { label: "REMAINING", value: fmt(catRem), color: catRem >= 0 ? T.text : "#E86A6A" },
                            { label: "% USED", value: `${catPct.toFixed(0)}%`, color: catPct >= 100 ? "#E86A6A" : catPct >= 80 ? "#E8D06A" : "#6AE89B" },
                          ].map((s) => (
                            <div key={s.label} style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px" }}>
                              <div style={{ fontSize: 8, letterSpacing: "0.15em", color: T.textDim, marginBottom: 4 }}>{s.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 500, color: s.color }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Exclude toggle */}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 11, color: T.textDim }}>Exclude from budget totals</div>
                      <button className="btn" onClick={() => toggleExclude(cat.id)}
                        style={{ width: 40, height: 22, borderRadius: 11, background: isExcluded ? T.accent : T.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: isExcluded ? 21 : 3, transition: "left 0.2s" }} />
                      </button>
                    </div>

                    {/* Expandable transactions */}
                    {spent > 0 && (() => {
                      const catExpenses = expenses.filter((e) => e.category === cat.id).sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
                      const isExpanded = expandedCats[cat.id];
                      return (
                        <div style={{ marginTop: 8 }}>
                          <button className="btn" onClick={() => toggleCat(cat.id)}
                            style={{ width: "100%", background: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontFamily: "inherit", borderTop: `1px solid ${T.border}` }}>
                            <span style={{ fontSize: 10, letterSpacing: "0.12em", color: T.textDim }}>{catExpenses.length} TRANSACTION{catExpenses.length !== 1 ? "S" : ""}</span>
                            <span style={{ fontSize: 11, color: T.textDim, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                          </button>
                          {isExpanded && (
                            <div style={{ marginTop: 6 }}>
                              {catExpenses.map((e) => (
                                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.surface3}` }}>
                                  <div>
                                    <div style={{ fontSize: 13 }}>{e.label}</div>
                                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{new Date(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                                  </div>
                                  <div style={{ fontSize: 14, fontWeight: 500, color: cat.color }}>{fmt(parseFloat(e.amount))}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {/* SUMMARY */}
          {activeTab === "summary" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "DISCRETIONARY", value: fmt(total), color: statusColor },
                  { label: "REMAINING", value: fmt(remaining), color: remaining >= 0 ? "#6AE89B" : "#E86A6A" },
                  { label: hasExcluded ? "TOTAL (ALL)" : "DAILY AVG", value: hasExcluded ? fmt(totalIncExcluded) : fmt(total / Math.max(daysElapsed, 1)), color: T.text },
                  { label: "TRANSACTIONS", value: String(expenses.length), color: T.text },
                ].map((s) => (
                  <div key={s.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.15em", color: T.textDim, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.15em", color: T.textDim, marginBottom: 16 }}>BY CATEGORY</div>
                {CATEGORIES.map((cat) => {
                  const { spent, target, pct: catPct, status } = getCatData(cat.id);
                  if (spent === 0 && target === 0) return null;
                  const isExcluded = !!excludedCats[cat.id];
                  const barPct = target > 0 ? catPct : (total > 0 ? (spent / total) * 100 : 0);
                  const catExpenses = expenses.filter((e) => e.category === cat.id).sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
                  const isExpanded = expandedCats[`summary_${cat.id}`];
                  return (
                    <div key={cat.id} style={{ marginBottom: 16, opacity: isExcluded ? 0.6 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12 }}>{cat.icon} {cat.label}</span>
                          {isExcluded && <span style={{ fontSize: 9, color: T.textFaint, letterSpacing: "0.1em" }}>EXCL.</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {status && !isExcluded && statusBadge(status)}
                          <span style={{ fontSize: 12, color: cat.color }}>{fmt(spent)}{target > 0 ? ` / ${fmt(target)}` : ""}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ height: "100%", width: `${barPct}%`, background: target > 0 && catPct >= 100 ? "#E86A6A" : cat.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                      </div>
                      {catExpenses.length > 0 && (
                        <>
                          <button className="btn" onClick={() => toggleCat(`summary_${cat.id}`)}
                            style={{ background: "none", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "4px 0", fontFamily: "inherit" }}>
                            <span style={{ fontSize: 10, letterSpacing: "0.12em", color: T.textDim }}>{catExpenses.length} TRANSACTION{catExpenses.length !== 1 ? "S" : ""}</span>
                            <span style={{ fontSize: 11, color: T.textDim, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                          </button>
                          {isExpanded && (
                            <div style={{ marginTop: 4 }}>
                              {catExpenses.map((e) => (
                                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.surface3}` }}>
                                  <div>
                                    <div style={{ fontSize: 12 }}>{e.label}</div>
                                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{new Date(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: cat.color }}>{fmt(parseFloat(e.amount))}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                }).filter(Boolean)}
                {CATEGORIES.every((c) => getCatData(c.id).spent === 0 && getCatData(c.id).target === 0) && (
                  <div style={{ textAlign: "center", color: T.textFaint, fontSize: 12, padding: "16px 0" }}>No expenses yet</div>
                )}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.15em", color: T.textDim, marginBottom: 16 }}>DAILY BREAKDOWN</div>
                {days.some((d, i) => expensesByDay[i].reduce((s, e) => s + parseFloat(e.amount), 0) > 0) ? (
                  days.map((d, i) => {
                    const dayTotal = expensesByDay[i].reduce((s, e) => s + parseFloat(e.amount), 0);
                    if (dayTotal === 0) return null;
                    const over = dayTotal > dailyBudget;
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.surface3}`, cursor: "pointer" }}
                        onClick={() => { setSelectedDay(i); setActiveTab("calendar"); }}>
                        <div style={{ fontSize: 12, color: isToday(d) ? T.accent : T.text }}>{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontSize: 12, color: over ? "#E86A6A" : "#6AE89B" }}>{fmt(dayTotal)}</div>
                          {over && <div style={{ fontSize: 9, color: "#E86A6A", letterSpacing: "0.1em" }}>OVER</div>}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: "center", color: T.textFaint, fontSize: 12, padding: "16px 0" }}>No expenses logged yet</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
