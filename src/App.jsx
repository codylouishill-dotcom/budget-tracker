import { useState, useMemo, useEffect } from "react";

// ── Supabase config ───────────────────────────────────────────────────────────
const SUPABASE_URL = "https://tdqoakivkegqrtopgtut.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkcW9ha2l2a2VncXJ0b3BndHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxODYyNjcsImV4cCI6MjA5Mzc2MjI2N30.cutRceKA2ZMNLPpo-LpmMsf-PMbDyIEDicqb5lPhEwk";

const sb = async (path, method = "GET", body = null) => {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
  if (method === "POST") headers["Prefer"] = "resolution=merge-duplicates";
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${res.status} ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
};

const loadExpenses = (period) =>
  sb(`/expenses?period=eq.${encodeURIComponent(period)}&order=created_at.asc`);
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
  { id: "other", label: "Other", color: "#8E8E8E", icon: "📦" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const isToday = (d) => { const t = new Date(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); };
const isWeekday = (d) => d.getDay() !== 0 && d.getDay() !== 6;

const lastBizDay = (year, month) => {
  const d = new Date(year, month + 1, 0);
  while (!isWeekday(d)) d.setDate(d.getDate() - 1);
  return new Date(d);
};
const midMonthPayDay = (year, month) => {
  const d = new Date(year, month, 15);
  while (!isWeekday(d)) d.setDate(d.getDate() - 1);
  return new Date(d);
};
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
const getCurrentPeriod = (payDates) => {
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
const getDaysInPeriod = (start, end) => {
  const days = []; const cur = new Date(start);
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
};
const periodKey = (start) => start.toISOString().slice(0, 10);

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const payDates = useMemo(() => getPayDates(), []);
  const { start: periodStart, end: periodEnd, nextPayDate } = useMemo(() => getCurrentPeriod(payDates), [payDates]);
  const days = useMemo(() => getDaysInPeriod(periodStart, periodEnd), [periodStart, periodEnd]);
  const periodLength = days.length;
  const curPeriodKey = periodKey(periodStart);
  const todayDate = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [budget, setBudget] = useState(1000);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("1000");
  const [expenses, setExpenses] = useState([]);
  const [selectedDay, setSelectedDay] = useState(() => {
    const idx = days.findIndex((d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() === new Date().setHours(0,0,0,0); });
    return idx >= 0 ? idx : 0;
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", label: "", category: "groceries" });
  const [activeTab, setActiveTab] = useState("calendar");
  const [catTargets, setCatTargets] = useState({});
  const [editingTarget, setEditingTarget] = useState(null);
  const [targetInput, setTargetInput] = useState("");
  const [syncStatus, setSyncStatus] = useState("loading");
  const [syncError, setSyncError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Quick Add
  
  const toDateInput = (d) => d.toISOString().slice(0, 10);
  const fromDateInput = (s) => new Date(s + "T00:00:00");
  const emptyRow = () => ({ amount: "", label: "", category: "groceries", date: toDateInput(todayDate) });
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, emptyRow));
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [qFormReady] = useState(true);

  useEffect(() => {
    (async () => {
      setSyncStatus("loading");
      try {
        const [exps, settings] = await Promise.all([loadExpenses(curPeriodKey), loadSettings()]);
        setExpenses(exps || []);
        const sm = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
        if (sm[`budget_${curPeriodKey}`]) { const b = parseFloat(sm[`budget_${curPeriodKey}`]); setBudget(b); setBudgetInput(String(b)); }
        const targets = {};
        CATEGORIES.forEach((c) => { if (sm[`target_${curPeriodKey}_${c.id}`]) targets[c.id] = parseFloat(sm[`target_${curPeriodKey}_${c.id}`]); });
        setCatTargets(targets);
        setSyncStatus("idle");
        setInitialized(true);
      } catch (e) {
        setSyncStatus("error"); setSyncError(e.message); setInitialized(true);
      }
    })();
  }, []);

  const expensesByDay = days.map((d) => expenses.filter((e) => e.date === d.toDateString()));
  const total = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
  const remaining = budget - total;
  const pct = Math.min((total / budget) * 100, 100);
  const dailyBudget = budget / periodLength;
  const statusColor = pct < 60 ? "#6AE89B" : pct < 85 ? "#E8D06A" : "#E86A6A";
  const daysElapsed = Math.max(1, days.filter((d) => { const x = new Date(d); x.setHours(0,0,0,0); return x <= todayDate; }).length);
  const progressFraction = daysElapsed / periodLength;
  const totalTargeted = Object.values(catTargets).reduce((s, v) => s + (v || 0), 0);

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
    setExpenses((prev) => [...prev, exp]);
    setForm({ amount: "", label: "", category: "groceries" });
    setShowForm(false);
    setSyncStatus("saving");
    try { await upsertExpense(exp); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const removeExpense = async (id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== String(id)));
    setSyncStatus("saving");
    try { await deleteExpense(String(id)); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const confirmBudget = async () => {
    const v = parseFloat(budgetInput);
    if (v > 0) {
      setBudget(v);
      setSyncStatus("saving");
      try { await upsertSetting(`budget_${curPeriodKey}`, v); setSyncStatus("idle"); }
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
    try { await upsertSetting(`target_${curPeriodKey}_${catId}`, val); setSyncStatus("idle"); }
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
        date: fromDateInput(r.date).toDateString(),
        amount: parseFloat(r.amount),
        label: r.label.trim(),
        category: r.category,
        period: curPeriodKey,
      }));
      await Promise.all(toSave.map(upsertExpense));
      setExpenses((prev) => [...prev, ...toSave]);
      setRows(Array.from({ length: 5 }, emptyRow));
      setSyncStatus("idle");
      setActiveTab("calendar");
    } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
    setIsSavingAll(false);
  };

  const sync = syncStatus === "loading" ? { color: "#E8D06A", label: "⟳ LOADING" }
    : syncStatus === "saving" ? { color: "#6A9BE8", label: "⟳ SAVING" }
    : syncStatus === "error" ? { color: "#E86A6A", label: "⚠ ERROR" }
    : { color: "#6AE89B", label: "● SYNCED" };

  const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const calendarCells = [...Array(periodStart.getDay()).fill(null), ...days];

  return (
    <div style={{ minHeight: "100vh", background: "#0F0F13", fontFamily: "'DM Mono', 'Courier New', monospace", color: "#E8E4DC" }}>
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
      `}</style>

      {/* HEADER */}
      <div style={{ background: "#16161E", borderBottom: "1px solid #2A2A35", padding: "20px 24px 16px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#555", marginBottom: 2 }}>PAY PERIOD BUDGET</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, letterSpacing: "0.05em", lineHeight: 1 }}>TRACKER</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#555", marginBottom: 4 }}>BUDGET</div>
              {editBudget ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                  <span style={{ color: "#666" }}>$</span>
                  <input type="number" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)}
                    onBlur={confirmBudget} onKeyDown={(e) => e.key === "Enter" && confirmBudget()} autoFocus
                    style={{ background: "#1F1F28", border: "1px solid #4A4A5A", borderRadius: 4, color: "#E8E4DC", fontSize: 18, fontFamily: "inherit", width: 90, padding: "2px 6px", textAlign: "right" }} />
                </div>
              ) : (
                <div onClick={() => { setEditBudget(true); setBudgetInput(String(budget)); }}
                  style={{ fontSize: 22, fontWeight: 500, cursor: "pointer", borderBottom: "1px dashed #444" }}>{fmt(budget)}</div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#555" }}>
              <span style={{ color: "#E8936A" }}>{fmtShort(periodStart)}</span>
              <span style={{ margin: "0 6px", color: "#333" }}>→</span>
              <span style={{ color: "#E8936A" }}>{fmtShort(periodEnd)}</span>
              <span style={{ marginLeft: 8, color: "#444" }}>({periodLength}d)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {nextPayDate && <div style={{ fontSize: 10, color: "#444" }}>next: <span style={{ color: "#666" }}>{fmtShort(nextPayDate)}</span></div>}
              <div style={{ fontSize: 9, color: sync.color, letterSpacing: "0.1em" }}>{sync.label}</div>
            </div>
          </div>
          {syncStatus === "error" && (
            <div style={{ fontSize: 10, color: "#E86A6A", background: "#E86A6A11", border: "1px solid #E86A6A33", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>{syncError}</div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: "#666" }}>
            <span>SPENT <span style={{ color: statusColor }}>{fmt(total)}</span></span>
            <span>LEFT <span style={{ color: remaining >= 0 ? "#E8E4DC" : "#E86A6A" }}>{fmt(remaining)}</span></span>
          </div>
          <div style={{ height: 6, background: "#2A2A35", borderRadius: 3, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${statusColor}88, ${statusColor})`, borderRadius: 3, transition: "width 0.4s ease" }} />
            <div style={{ position: "absolute", top: 0, left: `${progressFraction * 100}%`, width: 2, height: "100%", background: "#555", transform: "translateX(-1px)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444", marginTop: 4 }}>
            <span>Day {daysElapsed} of {periodLength}</span>
            <span>{pct.toFixed(1)}% of budget used</span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #2A2A35" }}>
          {["calendar", "quick add", "categories", "summary"].map((tab) => (
            <button key={tab} className="btn" onClick={() => setActiveTab(tab)}
              style={{ padding: "12px 16px", fontSize: 11, letterSpacing: "0.12em", color: activeTab === tab ? "#E8E4DC" : "#555", borderBottom: activeTab === tab ? "2px solid #E8936A" : "2px solid transparent", background: "none", fontFamily: "inherit", marginBottom: -1 }}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!initialized ? (
        <div style={{ maxWidth: 600, margin: "80px auto", textAlign: "center", color: "#555", fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⟳</div>
          Loading from Supabase...
        </div>
      ) : (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 24px 60px" }}>

          {/* CALENDAR */}
          {activeTab === "calendar" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
                {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 9, color: "#444", padding: "4px 0" }}>{d}</div>)}
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
                      style={{ background: selected ? "#1F1F2E" : "#16161E", border: `1px solid ${selected ? "#E8936A66" : todayD ? "#44445A" : "#2A2A35"}`, borderRadius: 8, padding: "8px 4px", textAlign: "center", opacity: past && dayTotal === 0 ? 0.35 : 1 }}>
                      <div style={{ fontSize: 13, fontWeight: selected ? 500 : 400, color: todayD ? "#E8936A" : "#E8E4DC" }}>{d.getDate()}</div>
                      {dayTotal > 0 && <div style={{ width: 4, height: 4, borderRadius: "50%", background: over ? "#E86A6A" : "#6AE89B", margin: "4px auto 0" }} />}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: "#16161E", border: "1px solid #2A2A35", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.15em", marginBottom: 2 }}>{isToday(days[selectedDay]) ? "TODAY" : `DAY ${selectedDay + 1}`}</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{days[selectedDay].toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>DAILY BUDGET</div>
                    <div style={{ fontSize: 13, color: "#666" }}>{fmt(dailyBudget)}</div>
                  </div>
                </div>

                {expensesByDay[selectedDay].length === 0 ? (
                  <div style={{ textAlign: "center", color: "#444", fontSize: 12, padding: "20px 0" }}>No expenses logged</div>
                ) : (
                  <div style={{ marginBottom: 12 }}>
                    {expensesByDay[selectedDay].map((e) => {
                      const cat = CATEGORIES.find((c) => c.id === e.category);
                      return (
                        <div key={e.id} className="slide-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1F1F28" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: `${cat.color}22`, border: `1px solid ${cat.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{cat.icon}</div>
                            <div>
                              <div style={{ fontSize: 13 }}>{e.label}</div>
                              <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{cat.label}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt(parseFloat(e.amount))}</div>
                            <button className="btn" onClick={() => removeExpense(e.id)} style={{ background: "none", color: "#555", fontSize: 18, padding: "0 2px", lineHeight: 1 }}>×</button>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 10, fontSize: 12, color: "#666" }}>
                      Day total: <span style={{ marginLeft: 8, color: "#E8E4DC", fontWeight: 500 }}>{fmt(expensesByDay[selectedDay].reduce((s, e) => s + parseFloat(e.amount), 0))}</span>
                    </div>
                  </div>
                )}

                {showForm ? (
                  <div style={{ marginTop: 12, background: "#1A1A24", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        style={{ flex: "0 0 100px", background: "#0F0F13", border: "1px solid #2A2A35", borderRadius: 6, color: "#E8E4DC", fontSize: 14, padding: "8px 10px", fontFamily: "inherit" }} />
                      <input type="text" placeholder="Description" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && addExpense()}
                        style={{ flex: 1, background: "#0F0F13", border: "1px solid #2A2A35", borderRadius: 6, color: "#E8E4DC", fontSize: 14, padding: "8px 10px", fontFamily: "inherit" }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      {CATEGORIES.map((c) => (
                        <button key={c.id} className="btn" onClick={() => setForm({ ...form, category: c.id })}
                          style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: form.category === c.id ? `${c.color}33` : "#1F1F28", border: `1px solid ${form.category === c.id ? c.color : "#2A2A35"}`, color: form.category === c.id ? c.color : "#666" }}>
                          {c.icon} {c.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={addExpense}
                        style={{ flex: 1, background: "#E8936A", color: "#0F0F13", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 500, fontFamily: "inherit", letterSpacing: "0.1em" }}>
                        ADD EXPENSE
                      </button>
                      <button className="btn" onClick={() => setShowForm(false)}
                        style={{ padding: "10px 16px", background: "#1F1F28", color: "#666", borderRadius: 8, fontSize: 12, fontFamily: "inherit" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn" onClick={() => setShowForm(true)}
                    style={{ width: "100%", background: "#1A1A24", border: "1px dashed #2A2A35", borderRadius: 8, padding: "12px", color: "#555", fontSize: 12, fontFamily: "inherit", letterSpacing: "0.1em", marginTop: 4 }}>
                    + LOG EXPENSE
                  </button>
                )}
              </div>
            </>
          )}

          {/* QUICK ADD */}
          {activeTab === "quick add" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, color: "#555" }}>Fill in what you need, skip the rest, then hit Save.</div>

              <div style={{ background: "#16161E", border: "1px solid #2A2A35", borderRadius: 12, overflow: "hidden" }}>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 36px", gap: 0, padding: "10px 16px", borderBottom: "1px solid #2A2A35" }}>
                  {["AMOUNT", "DESCRIPTION", "DATE", ""].map((h) => (
                    <div key={h} style={{ fontSize: 9, letterSpacing: "0.12em", color: "#444" }}>{h}</div>
                  ))}
                </div>

                {/* Rows */}
                {rows.map((row, i) => {
                  const cat = CATEGORIES.find((c) => c.id === row.category);
                  const filled = parseFloat(row.amount) > 0 || row.label.trim();
                  return (
                    <div key={i} style={{ borderBottom: i < 4 ? "1px solid #1F1F28" : "none" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 36px", gap: 0, padding: "10px 16px", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ color: "#555", fontSize: 12 }}>$</span>
                          <input type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateRow(i, "amount", e.target.value)}
                            style={{ width: "100%", background: "transparent", border: "none", color: "#E8E4DC", fontSize: 14, fontFamily: "inherit", padding: 0 }} />
                        </div>
                        <input type="text" placeholder="Description" value={row.label} onChange={(e) => updateRow(i, "label", e.target.value)}
                          style={{ background: "transparent", border: "none", color: "#E8E4DC", fontSize: 13, fontFamily: "inherit", padding: "0 8px" }} />
                        <input type="date" value={row.date} onChange={(e) => updateRow(i, "date", e.target.value)}
                          style={{ background: "transparent", border: "none", color: filled ? "#E8E4DC" : "#555", fontSize: 11, fontFamily: "inherit", padding: 0, width: "100%" }} />
                        <div style={{ textAlign: "center", fontSize: 15 }}>{filled ? cat.icon : ""}</div>
                      </div>
                      {/* Category picker - shown when row has content */}
                      {filled && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "0 16px 10px" }}>
                          {CATEGORIES.map((c) => (
                            <button key={c.id} className="btn" onClick={() => updateRow(i, "category", c.id)}
                              style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: row.category === c.id ? c.color + "33" : "#1A1A24", border: "1px solid " + (row.category === c.id ? c.color : "#2A2A35"), color: row.category === c.id ? c.color : "#555" }}>
                              {c.icon} {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Footer */}
                <div style={{ padding: "14px 16px", borderTop: "1px solid #2A2A35", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).length} entries
                    {rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).length > 0 && (
                      <span style={{ marginLeft: 8, color: "#E8E4DC" }}>
                        · {fmt(rows.filter((r) => parseFloat(r.amount) > 0 && r.label.trim()).reduce((s, r) => s + parseFloat(r.amount), 0))}
                      </span>
                    )}
                  </div>
                  <button className="btn" onClick={saveAll} disabled={isSavingAll}
                    style={{ background: "#E8936A", color: "#0F0F13", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 500, fontFamily: "inherit", letterSpacing: "0.1em", opacity: isSavingAll ? 0.6 : 1 }}>
                    {isSavingAll ? "SAVING..." : "SAVE ALL"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CATEGORIES */}
          {activeTab === "categories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Set a spending target per category for this pay period.</div>
              {totalTargeted > 0 && (
                <div style={{ background: "#16161E", border: "1px solid #2A2A35", borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#666" }}>TARGETS ALLOCATED</div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{fmt(totalTargeted)}</span>
                    <span style={{ fontSize: 11, color: totalTargeted > budget ? "#E86A6A" : "#555" }}>
                      {totalTargeted > budget ? `${fmt(totalTargeted - budget)} over` : `${fmt(budget - totalTargeted)} unallocated`}
                    </span>
                  </div>
                </div>
              )}
              {CATEGORIES.map((cat) => {
                const { spent, target, remaining: catRem, pct: catPct, status } = getCatData(cat.id);
                const isEditing = editingTarget === cat.id;
                return (
                  <div key={cat.id} style={{ background: "#16161E", border: `1px solid ${target > 0 ? cat.color + "33" : "#2A2A35"}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: target > 0 ? 14 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cat.color}22`, border: `1px solid ${cat.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{cat.icon}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{cat.label}</div>
                          <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{spent > 0 ? `${fmt(spent)} spent` : "no expenses yet"}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {status && statusBadge(status)}
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ color: "#555", fontSize: 12 }}>$</span>
                            <input type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)}
                              onBlur={() => confirmTarget(cat.id)} onKeyDown={(e) => e.key === "Enter" && confirmTarget(cat.id)} autoFocus placeholder="0"
                              style={{ width: 80, background: "#1F1F28", border: `1px solid ${cat.color}66`, borderRadius: 6, color: "#E8E4DC", fontSize: 14, padding: "4px 8px", fontFamily: "inherit", textAlign: "right" }} />
                          </div>
                        ) : (
                          <button className="btn" onClick={() => { setEditingTarget(cat.id); setTargetInput(target > 0 ? String(target) : ""); }}
                            style={{ background: target > 0 ? `${cat.color}22` : "#1F1F28", border: `1px solid ${target > 0 ? cat.color + "55" : "#2A2A35"}`, borderRadius: 8, padding: "5px 12px", color: target > 0 ? cat.color : "#555", fontSize: 12, fontFamily: "inherit" }}>
                            {target > 0 ? fmt(target) : "Set target"}
                          </button>
                        )}
                      </div>
                    </div>
                    {target > 0 && (
                      <>
                        <div style={{ height: 5, background: "#2A2A35", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                          <div style={{ height: "100%", width: `${catPct}%`, background: catPct >= 100 ? "#E86A6A" : cat.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          {[
                            { label: "SPENT", value: fmt(spent), color: cat.color },
                            { label: "REMAINING", value: fmt(catRem), color: catRem >= 0 ? "#E8E4DC" : "#E86A6A" },
                            { label: "% USED", value: `${catPct.toFixed(0)}%`, color: catPct >= 100 ? "#E86A6A" : catPct >= 80 ? "#E8D06A" : "#6AE89B" },
                          ].map((s) => (
                            <div key={s.label} style={{ background: "#1A1A24", borderRadius: 8, padding: "10px 12px" }}>
                              <div style={{ fontSize: 8, letterSpacing: "0.15em", color: "#555", marginBottom: 4 }}>{s.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 500, color: s.color }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
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
                  { label: "TOTAL SPENT", value: fmt(total), color: statusColor },
                  { label: "REMAINING", value: fmt(remaining), color: remaining >= 0 ? "#6AE89B" : "#E86A6A" },
                  { label: "DAILY AVG", value: fmt(total / Math.max(daysElapsed, 1)), color: "#E8E4DC" },
                  { label: "TRANSACTIONS", value: String(expenses.length), color: "#E8E4DC" },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#16161E", border: "1px solid #2A2A35", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "#555", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#16161E", border: "1px solid #2A2A35", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#555", marginBottom: 16 }}>BY CATEGORY</div>
                {CATEGORIES.map((cat) => {
                  const { spent, target, pct: catPct, status } = getCatData(cat.id);
                  if (spent === 0 && target === 0) return null;
                  const barPct = target > 0 ? catPct : (total > 0 ? (spent / total) * 100 : 0);
                  return (
                    <div key={cat.id} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 12 }}>{cat.icon} {cat.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {status && statusBadge(status)}
                          <span style={{ fontSize: 12, color: cat.color }}>{fmt(spent)}{target > 0 ? ` / ${fmt(target)}` : ""}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: "#2A2A35", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${barPct}%`, background: target > 0 && catPct >= 100 ? "#E86A6A" : cat.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
                {CATEGORIES.every((c) => getCatData(c.id).spent === 0 && getCatData(c.id).target === 0) && (
                  <div style={{ textAlign: "center", color: "#444", fontSize: 12, padding: "16px 0" }}>No expenses yet</div>
                )}
              </div>
              <div style={{ background: "#16161E", border: "1px solid #2A2A35", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#555", marginBottom: 16 }}>DAILY BREAKDOWN</div>
                {days.some((d, i) => expensesByDay[i].reduce((s, e) => s + parseFloat(e.amount), 0) > 0) ? (
                  days.map((d, i) => {
                    const dayTotal = expensesByDay[i].reduce((s, e) => s + parseFloat(e.amount), 0);
                    if (dayTotal === 0) return null;
                    const over = dayTotal > dailyBudget;
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1F1F28", cursor: "pointer" }}
                        onClick={() => { setSelectedDay(i); setActiveTab("calendar"); }}>
                        <div style={{ fontSize: 12, color: isToday(d) ? "#E8936A" : "#E8E4DC" }}>{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontSize: 12, color: over ? "#E86A6A" : "#6AE89B" }}>{fmt(dayTotal)}</div>
                          {over && <div style={{ fontSize: 9, color: "#E86A6A", letterSpacing: "0.1em" }}>OVER</div>}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: "center", color: "#444", fontSize: 12, padding: "16px 0" }}>No expenses logged yet</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
