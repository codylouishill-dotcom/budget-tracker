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
const loadAllExpenses = () => sb("/expenses?order=created_at.asc");
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

// ── ImportTab Component ──────────────────────────────────────────────────────
function ImportTab({ parseCSV, expenses, historyExpenses, setAllExpenses, upsertExpense, upsertFundTransaction, setFundTransactions, curPeriodKey, funds, periodStart, periodEnd, T, iStyle, fmt, CATEGORIES, setSyncStatus, setSyncError }) {
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState(null); // { format, rows, error }
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [rows, setRows] = useState([]);

  const handleParse = () => {
    if (!csvText.trim()) return;
    const result = parseCSV(csvText);
    setParsed(result);
    if (!result.error) {
      // Combine all known expenses for duplicate detection
      const knownExps = [...(expenses || []), ...(historyExpenses || [])];
      const rowsWithDupes = result.rows.map((r) => {
        const rowDate = new Date(r.date).getTime();
        const rowAmt = Math.abs(r.amount);
        const match = knownExps.find((e) => {
          const eDate = new Date(e.date).getTime();
          const eAmt = Math.abs(parseFloat(e.amount));
          const daysDiff = Math.abs((rowDate - eDate) / 86400000);
          return Math.abs(eAmt - rowAmt) < 0.01 && daysDiff <= 2;
        });
        return { ...r, duplicate: match ? { date: match.date, label: match.label } : null };
      });
      setRows(rowsWithDupes);
    }
    setImported(false);
  };

  const updateRow = (id, field, value) => setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  const hasFunds = funds && funds.length > 0;

  const handleImport = async () => {
    const toImport = rows.filter((r) => r.include);
    if (toImport.length === 0) return;
    setImporting(true);
    setSyncStatus("saving");
    try {
      // Split into budget expenses and fund-move transactions
      const budgetRows = toImport.filter((r) => r.fundMode !== "move");
      const fundMoveRows = toImport.filter((r) => r.fundMode === "move" && r.fund_id);

      const exps = budgetRows.map((r) => ({
        id: String(Date.now() + Math.random()),
        date: r.date,
        amount: r.amount,
        label: r.desc,
        category: r.category,
        period: curPeriodKey,
        fund_id: r.fundMode === "tag" ? (r.fund_id || null) : null,
      }));
      const fundTxs = fundMoveRows.map((r) => ({
        id: String(Date.now() + Math.random()),
        fund_id: r.fund_id,
        amount: r.amount,
        label: r.desc,
        date: r.date.includes(",") ? new Date(r.date).toISOString().slice(0,10) : r.date,
      }));

      await Promise.all([
        ...exps.map(upsertExpense),
        ...fundTxs.map(upsertFundTransaction),
      ]);
      setAllExpenses((prev) => [...prev, ...exps.filter((e) => {
        const d = new Date(e.date); d.setHours(0,0,0,0);
        return d >= periodStart && d <= periodEnd;
      })]);
      setFundTransactions((prev) => [...prev, ...fundTxs]);
      setSyncStatus("idle");
      setImported(true);
      setCsvText("");
      setParsed(null);
      setRows([]);
    } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
    setImporting(false);
  };

  const includedCount = rows.filter((r) => r.include).length;
  const includedTotal = rows.filter((r) => r.include && r.amount > 0).reduce((s, r) => s + r.amount, 0);

  const FORMAT_LABELS = {
    chase_card: "Chase Credit Card (CSV)",
    chase_web: "Chase Website (copy-paste)",
    citi_web: "Citi Website (copy-paste)",
    chase_checking: "Chase Checking",
    cu: "Credit Union",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: T.textDim }}>Paste CSV text from your bank export. Supports Chase credit card, Chase checking, and Credit Union formats.</div>

      {imported && (
        <div style={{ background: "#6AE89B22", border: "1px solid #6AE89B55", borderRadius: 10, padding: 14, fontSize: 13, color: "#6AE89B", textAlign: "center" }}>
          ✓ Import complete!
        </div>
      )}

      {/* Paste area */}
      {!parsed && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 8 }}>PASTE CSV DATA</div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"Paste your bank CSV here...\n\nTransaction Date,Post Date,Description,Category,Type,Amount,Memo\n12/01/2025,..."}
            style={{ width: "100%", minHeight: 140, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, fontFamily: "inherit", padding: "10px 12px", outline: "none", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={handleParse} disabled={!csvText.trim()}
              style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", opacity: !csvText.trim() ? 0.5 : 1 }}>
              PARSE CSV
            </button>
            <button className="btn" onClick={() => setCsvText("")}
              style={{ padding: "12px 14px", background: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {parsed?.error && (
        <div style={{ background: "#E86A6A11", border: "1px solid #E86A6A44", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: "#E86A6A", marginBottom: 8 }}>⚠ Could not parse CSV</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>{parsed.error}</div>
          <button className="btn" onClick={() => { setParsed(null); }} style={{ marginTop: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: T.textMuted, fontFamily: "inherit" }}>Try again</button>
        </div>
      )}

      {/* Preview */}
      {parsed && !parsed.error && rows.length > 0 && (
        <>
          {/* Format + stats bar */}
          {(() => {
            const dupeCount = rows.filter((r) => r.include && r.duplicate).length;
            return (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 2 }}>DETECTED: <span style={{ color: T.accent }}>{FORMAT_LABELS[parsed.format]}</span></div>
              <div style={{ fontSize: 12 }}>{includedCount} of {rows.length} transactions · {fmt(includedTotal)}</div>
              {dupeCount > 0 && <div style={{ fontSize: 10, color: "#E8D06A", marginTop: 2 }}>⚠ {dupeCount} possible duplicate{dupeCount > 1 ? "s" : ""}</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setRows((p) => p.map((r) => ({ ...r, include: true })))}
                style={{ fontSize: 11, color: T.textDim, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 9px", fontFamily: "inherit" }}>All</button>
              <button className="btn" onClick={() => setRows((p) => p.map((r) => ({ ...r, include: false })))}
                style={{ fontSize: 11, color: T.textDim, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 9px", fontFamily: "inherit" }}>None</button>
              <button className="btn" onClick={() => { setParsed(null); setCsvText(""); setRows([]); }}
                style={{ fontSize: 11, color: T.textDim, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 9px", fontFamily: "inherit" }}>← Back</button>
            </div>
          </div>
            );
          })()}

          {/* Transaction rows */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            {rows.map((row) => {
              const cat = CATEGORIES.find((c) => c.id === row.category);
              const dateStr = new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const isCredit = row.amount < 0;
              const isDupe = !!row.duplicate;
              return (
                <div key={row.id} style={{ borderBottom: `1px solid ${T.border}`, padding: "10px 14px", opacity: row.include ? 1 : 0.4, background: isDupe && row.include ? "#E8D06A08" : "transparent" }}>
                  {/* Main row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="btn" onClick={() => updateRow(row.id, "include", !row.include)}
                      style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${row.include ? T.accent : T.border}`, background: row.include ? T.accent : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {row.include && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                    </button>
                    <div style={{ fontSize: 10, color: T.textFaint, flexShrink: 0, width: 36 }}>{dateStr}</div>
                    <div style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.text }}>{row.desc}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: isCredit ? "#6AE89B" : T.text, flexShrink: 0 }}>{isCredit ? `+${fmt(Math.abs(row.amount))}` : fmt(row.amount)}</div>
                  </div>
                  {/* Duplicate warning */}
                  {isDupe && row.include && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, paddingLeft: 28, paddingBottom: 4 }}>
                      <div style={{ background: "#E8D06A22", border: "1px solid #E8D06A55", borderRadius: 6, padding: "3px 8px", fontSize: 10, color: "#E8D06A", display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                        <span>⚠ Possible duplicate:</span>
                        <span style={{ color: "#E8D06A99" }}>
                          {new Date(row.duplicate.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {row.duplicate.label}
                        </span>
                      </div>
                      <button className="btn" onClick={() => updateRow(row.id, "include", false)}
                        style={{ fontSize: 10, color: "#E8D06A", background: "#E8D06A22", border: "1px solid #E8D06A44", borderRadius: 6, padding: "3px 8px", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        Skip
                      </button>
                    </div>
                  )}

                  {/* Category pills + fund tag */}
                  {row.include && (
                    <div style={{ paddingLeft: 28, marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: hasFunds ? 6 : 0 }}>
                        {CATEGORIES.map((c) => (
                          <button key={c.id} className="btn" onClick={() => updateRow(row.id, "category", c.id)}
                            style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: row.category === c.id ? `${c.color}33` : T.surface2, border: `1px solid ${row.category === c.id ? c.color : T.border}`, color: row.category === c.id ? c.color : T.textDim }}>
                            {c.icon} {c.label}
                          </button>
                        ))}
                      </div>
                      {hasFunds && (
                        <div>
                          {/* Mode selector */}
                          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                            <span style={{ fontSize: 9, color: T.textFaint, letterSpacing: "0.08em", alignSelf: "center" }}>FUND:</span>
                            {[
                              { mode: "none", label: "None" },
                              { mode: "tag", label: "Tag" },
                              { mode: "move", label: "Move" },
                            ].map(({ mode, label }) => (
                              <button key={mode} className="btn" onClick={() => updateRow(row.id, "fundMode", mode)}
                                style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: (row.fundMode || "none") === mode ? T.accent+"33" : T.surface2, border: `1px solid ${(row.fundMode || "none") === mode ? T.accent : T.border}`, color: (row.fundMode || "none") === mode ? T.accent : T.textFaint }}>
                                {label}
                              </button>
                            ))}
                          </div>
                          {/* Fund picker — shown when mode is tag or move */}
                          {row.fundMode && row.fundMode !== "none" && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {funds.map((f) => (
                                <button key={f.id} className="btn" onClick={() => updateRow(row.id, "fund_id", row.fund_id === f.id ? null : f.id)}
                                  style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: row.fund_id === f.id ? `${T.accent}33` : T.surface2, border: `1px solid ${row.fund_id === f.id ? T.accent : T.border}`, color: row.fund_id === f.id ? T.accent : T.textFaint }}>
                                  {f.icon} {f.name}
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Move warning */}
                          {row.fundMode === "move" && (
                            <div style={{ fontSize: 9, color: "#E8D06A", marginTop: 4 }}>⚠ Will be saved to fund only, not to budget</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Import button */}
          <button className="btn" onClick={handleImport} disabled={importing || includedCount === 0}
            style={{ width: "100%", background: T.accent, color: "#fff", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 500, fontFamily: "inherit", letterSpacing: "0.08em", opacity: importing || includedCount === 0 ? 0.6 : 1 }}>
            {importing ? "IMPORTING..." : `IMPORT ${includedCount} TRANSACTIONS`}
          </button>
        </>
      )}

      {parsed && !parsed.error && rows.length === 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, textAlign: "center", color: T.textMuted, fontSize: 12 }}>
          No importable transactions found — payments and transfers are automatically excluded.
          <br /><br />
          <button className="btn" onClick={() => { setParsed(null); setCsvText(""); }} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: T.textMuted, fontFamily: "inherit" }}>Try again</button>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const todayDate = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [windowWidth, setWindowWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 480);
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const isDesktop = windowWidth >= 768;
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
  const [form, setForm] = useState({ amount: "", label: "", category: "groceries", isCredit: false, fund_id: null });
  const [activeTab, setActiveTab] = useState("calendar");
  const [catTargets, setCatTargets] = useState({});
  const [excludedCats, setExcludedCats] = useState({});
  const [fundOffsetEnabled, setFundOffsetEnabled] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [targetInput, setTargetInput] = useState("");
  const [expandedCats, setExpandedCats] = useState({});
  const [largeThreshold, setLargeThreshold] = useState(150);
  const [showLarge, setShowLarge] = useState(false);
  const [editingLarge, setEditingLarge] = useState(null);
  const toggleCat = (id) => setExpandedCats((prev) => ({ ...prev, [id]: !prev[id] }));
  const [editingExpense, setEditingExpense] = useState(null);
  const startEdit = (e) => setEditingExpense({ id: e.id, amount: String(Math.abs(parseFloat(e.amount))), label: e.label, category: e.category, isCredit: parseFloat(e.amount) < 0, fund_id: e.fund_id || null });
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

  // History
  const [historyExpenses, setHistoryExpenses] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState({});
  const toggleMonth = (key) => setExpandedMonths((prev) => ({ ...prev, [key]: !prev[key] }));
  const [expandedHistoryCats, setExpandedHistoryCats] = useState({});
  const toggleHistoryCat = (key) => setExpandedHistoryCats((prev) => ({ ...prev, [key]: !prev[key] }));
  const [editingHistoryExpense, setEditingHistoryExpense] = useState(null);

  const [syncStatus, setSyncStatus] = useState("loading");
  const [syncError, setSyncError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Quick Add
  const toDateInput = (d) => d.toISOString().slice(0,10);
  const fromDateInput = (s) => new Date(s + "T00:00:00");
  const emptyRow = () => ({ amount: "", label: "", category: "groceries", date: toDateInput(todayDate), isCredit: false, fund_id: null });
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
        setFundOffsetEnabled(sm["fund_offset_enabled"] === "true");
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

  // Fund offset: on days over daily average, excess fund-tagged spending is offset from budget total
  const fundOffset = useMemo(() => {
    if (!fundOffsetEnabled) return 0;
    return days.reduce((totalOffset, d, i) => {
      const dayExps = expensesByDay[i];
      const dayTotal = dayExps.filter(e => !excludedCats[e.category]).reduce((s, e) => s + parseFloat(e.amount), 0);
      if (dayTotal <= dailyBudget) return totalOffset;
      const dayFundTagged = dayExps.filter(e => e.fund_id && !excludedCats[e.category]).reduce((s, e) => s + parseFloat(e.amount), 0);
      const excess = dayTotal - dailyBudget;
      return totalOffset + Math.min(excess, dayFundTagged);
    }, 0);
  }, [fundOffsetEnabled, expenses, excludedCats, dailyBudget, days]);

  const adjustedTotal = total - fundOffset;
  const adjustedRemaining = effectiveBudget - adjustedTotal;
  const adjustedPct = Math.min((adjustedTotal / Math.max(effectiveBudget, 1)) * 100, 100);

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
    const exp = { id: String(Date.now()), date: days[selectedDay].toDateString(), amount: finalAmt, label: form.label.trim(), category: form.category, period: curPeriodKey, fund_id: form.fund_id || null };
    setAllExpenses((prev) => [...prev, exp]);
    setForm({ amount: "", label: "", category: "groceries", isCredit: false, fund_id: null });
    setShowForm(false);
    setSyncStatus("saving");
    try { await upsertExpense(exp); setSyncStatus("idle"); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const removeExpense = async (id) => {
    setAllExpenses((prev) => prev.filter((e) => e.id !== String(id)));
    setHistoryExpenses((prev) => prev.filter((e) => e.id !== String(id)));
    setSyncStatus("saving");
    try { await deleteExpense(String(id)); setSyncStatus("idle"); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const saveEdit = async () => {
    if (!editingExpense) return;
    const amt = parseFloat(editingExpense.amount);
    if (!amt || amt <= 0 || !editingExpense.label.trim()) return;
    const finalAmt = editingExpense.isCredit ? -amt : amt;
    const updated = { ...allExpenses.find((e) => e.id === editingExpense.id), amount: finalAmt, label: editingExpense.label.trim(), category: editingExpense.category, fund_id: editingExpense.fund_id || null };
    setAllExpenses((prev) => prev.map((e) => e.id === editingExpense.id ? updated : e));
    setHistoryExpenses((prev) => prev.map((e) => e.id === editingExpense.id ? updated : e));
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

  const saveHistoryEdit = async () => {
    if (!editingHistoryExpense) return;
    const amt = parseFloat(editingHistoryExpense.amount);
    if (!amt || !editingHistoryExpense.label.trim()) return;
    const finalAmt = editingHistoryExpense.isCredit ? -amt : amt;
    const updated = {
      ...historyExpenses.find((e) => e.id === editingHistoryExpense.id),
      amount: finalAmt,
      label: editingHistoryExpense.label.trim(),
      category: editingHistoryExpense.category,
      fund_id: editingHistoryExpense.editFundMode === "none" ? null : (editingHistoryExpense.fund_id || null),
    };
    setHistoryExpenses((prev) => prev.map((e) => e.id === updated.id ? updated : e));
    // Also update allExpenses if in current period
    setAllExpenses((prev) => prev.map((e) => e.id === updated.id ? updated : e));
    setEditingHistoryExpense(null);
    setSyncStatus("saving");
    try { await upsertExpense(updated); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const moveHistoryExpenseToFund = async (expId, fundId) => {
    const exp = historyExpenses.find((e) => e.id === expId);
    if (!exp || !fundId) return;
    setHistoryExpenses((prev) => prev.filter((e) => e.id !== expId));
    setAllExpenses((prev) => prev.filter((e) => e.id !== expId));
    const tx = { id: String(Date.now()), fund_id: fundId, amount: Math.abs(parseFloat(exp.amount)), label: exp.label, date: new Date(exp.date).toISOString().slice(0,10) };
    setFundTransactions((prev) => [...prev, tx]);
    setEditingHistoryExpense(null);
    setSyncStatus("saving");
    try { await deleteExpense(expId); await upsertFundTransaction(tx); setSyncStatus("idle"); }
    catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const moveExpenseToFund = async (expId, fundId) => {
    const exp = allExpenses.find((e) => e.id === expId) || historyExpenses.find((e) => e.id === expId);
    if (!exp || !fundId) return;
    // Remove from budget expenses and history
    setAllExpenses((prev) => prev.filter((e) => e.id !== expId));
    setHistoryExpenses((prev) => prev.filter((e) => e.id !== expId));
    // Add as fund transaction
    const tx = {
      id: String(Date.now()),
      fund_id: fundId,
      amount: Math.abs(parseFloat(exp.amount)),
      label: exp.label,
      date: new Date(exp.date).toISOString().slice(0,10),
    };
    setFundTransactions((prev) => [...prev, tx]);
    setEditingExpense(null);
    setSyncStatus("saving");
    try {
      await deleteExpense(expId);
      await upsertFundTransaction(tx);
      setSyncStatus("idle");
    } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
  };

  const toggleFundOffset = async () => {
    const newVal = !fundOffsetEnabled;
    setFundOffsetEnabled(newVal);
    try { await upsertSetting("fund_offset_enabled", newVal); } catch (e) { setSyncStatus("error"); setSyncError(e.message); }
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
      const toSave = valid.map((r) => ({ id: String(Date.now() + Math.random()), date: (r.date ? fromDateInput(r.date) : todayDate).toDateString(), amount: r.isCredit ? -parseFloat(r.amount) : parseFloat(r.amount), label: r.label.trim(), category: r.category || "other", period: curPeriodKey, fund_id: r.fund_id || null }));
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
        <div style={{ maxWidth: isDesktop ? 960 : 480, margin: "0 auto", padding: isDesktop ? "0 12px" : "0" }}>
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
            <span style={{ color: T.textMuted }}>
              SPENT <span style={{ color: statusColor }}>{fmt(fundOffsetEnabled ? adjustedTotal : total)}</span>
              {hasExcluded && <span style={{ color: T.textFaint, fontSize: 9 }}> excl.</span>}
              {fundOffsetEnabled && fundOffset > 0 && <span style={{ color: T.textFaint, fontSize: 9 }}> ({fmt(fundOffset)} offset)</span>}
            </span>
            <span style={{ color: T.textMuted }}>LEFT <span style={{ color: (fundOffsetEnabled ? adjustedRemaining : remaining) >= 0 ? T.text : "#E86A6A" }}>{fmt(fundOffsetEnabled ? adjustedRemaining : remaining)}</span></span>
          </div>
          <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", width: `${fundOffsetEnabled ? adjustedPct : pct}%`, background: `linear-gradient(90deg, ${statusColor}88, ${statusColor})`, borderRadius: 3, transition: "width 0.4s ease" }} />
            <div style={{ position: "absolute", top: 0, left: `${progressFraction * 100}%`, width: 2, height: "100%", background: T.textMuted, transform: "translateX(-1px)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.textFaint, marginTop: 3 }}>
            <span>Day {daysElapsed} of {periodLength} · {fmt(dailyBudget)}/day left</span>
            <span>{(fundOffsetEnabled ? adjustedPct : pct).toFixed(1)}%</span>
          </div>
        </div>

        {/* STICKY TABS */}
        <div style={{ maxWidth: isDesktop ? 960 : 480, margin: "0 auto", borderTop: `1px solid ${T.border}`, marginTop: 12, padding: isDesktop ? "0 12px" : "0" }}>
          <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
            {["calendar","quick add","import","categories","funds","summary","history"].map((tab) => (
              <button key={tab} className="btn" onClick={() => setActiveTab(tab)}
                style={{ padding: "10px 12px", fontSize: 10, letterSpacing: "0.08em", color: activeTab === tab ? T.text : T.textDim, borderBottom: activeTab === tab ? `2px solid ${T.accent}` : "2px solid transparent", background: "none", fontFamily: "inherit", marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0 }}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>



      {!initialized ? (
        <div style={{ maxWidth: isDesktop ? 960 : 480, margin: "80px auto", textAlign: "center", color: T.textDim, fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⟳</div>Loading...
        </div>
      ) : (
        <div style={{ maxWidth: isDesktop ? 960 : 480, margin: "0 auto", padding: isDesktop ? "20px 32px 80px" : "16px 16px 80px" }}>

          {/* ── CALENDAR ── */}
          {activeTab === "calendar" && (
            <div style={{ display: isDesktop ? "flex" : "block", gap: isDesktop ? 24 : 0, alignItems: "flex-start" }}>
            <div style={{ flex: isDesktop ? "0 0 340px" : undefined }}>
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
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
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
                                <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                                {cat.label}
                                {isCredit && <span style={{ marginLeft: 6, color: "#6AE89B" }}>· credit</span>}
                                {excludedCats[cat.id] && <span style={{ marginLeft: 6, color: T.textFaint }}>· excl.</span>}
                                {e.fund_id && (() => { const f = funds.find((f) => f.id === e.fund_id); return f ? <span style={{ marginLeft: 6, color: T.accent }}>· {f.icon} {f.name}</span> : null; })()}
                              </div>
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
                              {funds.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                  {/* Mode toggle */}
                                  <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                                    <span style={{ fontSize: 9, letterSpacing: "0.1em", color: T.textDim }}>FUND</span>
                                    {[
                                      { mode: "none", label: "None" },
                                      { mode: "tag", label: "Tag" },
                                      { mode: "move", label: "Move" },
                                    ].map(({ mode, label }) => (
                                      <button key={mode} className="btn"
                                        onClick={() => setEditingExpense((p) => ({ ...p, editFundMode: mode, fund_id: mode === "none" ? null : p.fund_id }))}
                                        style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: (editingExpense.editFundMode || (editingExpense.fund_id ? "tag" : "none")) === mode ? T.accent+"33" : T.surface3, border: `1px solid ${(editingExpense.editFundMode || (editingExpense.fund_id ? "tag" : "none")) === mode ? T.accent : T.border}`, color: (editingExpense.editFundMode || (editingExpense.fund_id ? "tag" : "none")) === mode ? T.accent : T.textMuted }}>
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  {/* Fund selector */}
                                  {(editingExpense.editFundMode || (editingExpense.fund_id ? "tag" : "none")) !== "none" && (
                                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                                      {funds.map((f) => (
                                        <button key={f.id} className="btn" onClick={() => setEditingExpense((p) => ({ ...p, fund_id: p.fund_id === f.id ? null : f.id }))}
                                          style={{ padding: "4px 9px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: editingExpense.fund_id === f.id ? T.accent+"33" : T.surface3, border: `1px solid ${editingExpense.fund_id === f.id ? T.accent : T.border}`, color: editingExpense.fund_id === f.id ? T.accent : T.textMuted }}>
                                          {f.icon} {f.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {/* Move action */}
                                  {(editingExpense.editFundMode === "move") && editingExpense.fund_id && (
                                    <button className="btn" onClick={() => moveExpenseToFund(editingExpense.id, editingExpense.fund_id)}
                                      style={{ width: "100%", background: "#E8D06A22", border: "1px solid #E8D06A55", borderRadius: 8, padding: "9px", fontSize: 12, color: "#E8D06A", fontFamily: "inherit", marginBottom: 4 }}>
                                      Move to {funds.find(f => f.id === editingExpense.fund_id)?.name} (removes from budget)
                                    </button>
                                  )}
                                </div>
                              )}
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
                    {funds.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 9, letterSpacing: "0.1em", color: T.textDim, marginBottom: 6 }}>TAG TO FUND (OPTIONAL)</div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button className="btn" onClick={() => setForm({ ...form, fund_id: null })}
                            style={{ padding: "5px 10px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: !form.fund_id ? T.accent+"33" : T.surface3, border: `1px solid ${!form.fund_id ? T.accent : T.border}`, color: !form.fund_id ? T.accent : T.textMuted }}>
                            None
                          </button>
                          {funds.map((f) => (
                            <button key={f.id} className="btn" onClick={() => setForm({ ...form, fund_id: form.fund_id === f.id ? null : f.id })}
                              style={{ padding: "5px 10px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: form.fund_id === f.id ? T.accent+"33" : T.surface3, border: `1px solid ${form.fund_id === f.id ? T.accent : T.border}`, color: form.fund_id === f.id ? T.accent : T.textMuted }}>
                              {f.icon} {f.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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
            </div>
            </div>
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
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                        {CATEGORIES.map((c) => (
                          <button key={c.id} className="btn" onClick={() => updateRow(i, "category", c.id)}
                            style={{ padding: "5px 9px", borderRadius: 20, fontSize: 11, fontFamily: "inherit", background: row.category === c.id ? `${c.color}33` : T.surface2, border: `1px solid ${row.category === c.id ? c.color : T.border}`, color: row.category === c.id ? c.color : T.textDim }}>
                            {c.icon} {c.label}
                          </button>
                        ))}
                      </div>
                      {funds.length > 0 && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 9, color: T.textFaint, letterSpacing: "0.08em" }}>FUND:</span>
                          <button className="btn" onClick={() => updateRow(i, "fund_id", null)}
                            style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: !row.fund_id ? T.accent+"33" : T.surface3, border: `1px solid ${!row.fund_id ? T.accent : T.border}`, color: !row.fund_id ? T.accent : T.textFaint }}>
                            None
                          </button>
                          {funds.map((f) => (
                            <button key={f.id} className="btn" onClick={() => updateRow(i, "fund_id", row.fund_id === f.id ? null : f.id)}
                              style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: row.fund_id === f.id ? T.accent+"33" : T.surface3, border: `1px solid ${row.fund_id === f.id ? T.accent : T.border}`, color: row.fund_id === f.id ? T.accent : T.textFaint }}>
                              {f.icon} {f.name}
                            </button>
                          ))}
                        </div>
                      )}
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
            <div style={{ display: isDesktop ? "grid" : "flex", gridTemplateColumns: isDesktop ? "1fr 1fr" : undefined, flexDirection: isDesktop ? undefined : "column", gap: 12, alignItems: "start" }}>
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
              {(() => {
                const allTx = fundTransactions;
                const curMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
                const fundsTotalSpent = allTx.reduce((s, t) => s + parseFloat(t.amount), 0);
                const fundsOnlyThisMonth = allTx.filter((t) => monthKey(t.date) === curMonthKey).reduce((s, t) => s + parseFloat(t.amount), 0);
                const totalTarget = funds.filter((f) => f.target != null).reduce((s, f) => s + parseFloat(f.target), 0);
                // Budget spending this month (fund-tagged budget expenses already included here, not double-counted)
                const budgetThisMonth = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
                // Combined: budget spending + fund-only transactions (no overlap)
                const combinedThisMonth = budgetThisMonth + fundsOnlyThisMonth;
                // Fund-tagged budget expenses this month (for context)
                const taggedThisMonth = expenses.filter((e) => e.fund_id).reduce((s, e) => s + parseFloat(e.amount), 0);
                return (
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 10 }}>THIS MONTH — ALL SPENDING</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 8, letterSpacing: "0.12em", color: T.textDim, marginBottom: 3 }}>BUDGET SPENDING</div>
                        <div style={{ fontSize: 16, fontWeight: 500 }}>{fmt(budgetThisMonth)}</div>
                        {taggedThisMonth > 0 && <div style={{ fontSize: 9, color: T.textFaint, marginTop: 2 }}>{fmt(taggedThisMonth)} fund-tagged</div>}
                      </div>
                      <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 8, letterSpacing: "0.12em", color: T.textDim, marginBottom: 3 }}>FUNDS-ONLY</div>
                        <div style={{ fontSize: 16, fontWeight: 500 }}>{fmt(fundsOnlyThisMonth)}</div>
                      </div>
                    </div>
                    <div style={{ background: T.surface3, borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", color: T.textDim }}>TOTAL OUT OF POCKET</div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: T.accent }}>{fmt(combinedThisMonth)}</div>
                    </div>
                    {funds.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <div>
                          <div style={{ fontSize: 8, letterSpacing: "0.12em", color: T.textDim, marginBottom: 3 }}>FUNDS TOTAL</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{fmt(fundsTotalSpent)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 8, letterSpacing: "0.12em", color: T.textDim, marginBottom: 3 }}>FUNDS TARGET</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{totalTarget > 0 ? fmt(totalTarget) : "—"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{ display: isDesktop ? "grid" : "contents", gridTemplateColumns: isDesktop ? "1fr 1fr" : undefined, gap: 12, alignItems: "start" }}>
              {[...funds].sort((a, b) => { const spentA = fundTransactions.filter((t) => t.fund_id === a.id).reduce((s, t) => s + parseFloat(t.amount), 0); const spentB = fundTransactions.filter((t) => t.fund_id === b.id).reduce((s, t) => s + parseFloat(t.amount), 0); return spentB - spentA; }).map((fund) => {
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

                        {/* Fund-tagged budget expenses */}
                        {(() => {
                          const taggedExps = allExpenses.filter((e) => e.fund_id === fund.id).sort((a, b) => new Date(b.date) - new Date(a.date));
                          if (taggedExps.length === 0) return null;
                          const taggedTotal = taggedExps.reduce((s, e) => s + parseFloat(e.amount), 0);
                          return (
                            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginBottom: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ fontSize: 9, letterSpacing: "0.1em", color: T.textDim }}>BUDGET TRANSACTIONS TAGGED HERE</div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: T.accent }}>{fmt(taggedTotal)}</div>
                              </div>
                              {taggedExps.map((e) => {
                                const cat = CATEGORIES.find((c) => c.id === e.category);
                                const isCredit = parseFloat(e.amount) < 0;
                                return (
                                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.surface3}` }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                      <span style={{ fontSize: 13 }}>{cat.icon}</span>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                                        <div style={{ fontSize: 9, color: T.textDim, marginTop: 1 }}>{cat.label} · {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 12, fontWeight: 500, color: isCredit ? "#6AE89B" : T.textMuted, flexShrink: 0, marginLeft: 8 }}>{isCredit ? `+${fmt(Math.abs(parseFloat(e.amount)))}` : fmt(parseFloat(e.amount))}</div>
                                  </div>
                                );
                              })}
                              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontSize: 11, color: T.textDim }}>
                                <span>Combined fund total</span>
                                <span style={{ color: T.text, fontWeight: 500 }}>{fmt(spent + taggedTotal)}</span>
                              </div>
                            </div>
                          );
                        })()}

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

              </div>
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

              {/* Fund offset toggle */}
              {funds.some(f => fundTransactions.filter(t => t.fund_id === f.id).length > 0 || expenses.some(e => e.fund_id)) && (
                <div style={{ background: T.surface, border: `1px solid ${fundOffsetEnabled ? T.accent+"55" : T.border}`, borderRadius: 12, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3 }}>Fund Day Offset</div>
                    <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.4 }}>
                      On days over {fmt(dailyBudget)}/day avg, excess fund-tagged spending is offset from your budget total.
                      {fundOffsetEnabled && fundOffset > 0 && <span style={{ color: T.accent }}> Saving {fmt(fundOffset)} this period.</span>}
                    </div>
                  </div>
                  <button className="btn" onClick={toggleFundOffset}
                    style={{ width: 44, height: 24, borderRadius: 12, background: fundOffsetEnabled ? T.accent : T.border, position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: fundOffsetEnabled ? 23 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
                {[
                  { label: "DISCRETIONARY", value: fmt(fundOffsetEnabled ? adjustedTotal : total), color: statusColor },
                  { label: "REMAINING", value: fmt(fundOffsetEnabled ? adjustedRemaining : remaining), color: (fundOffsetEnabled ? adjustedRemaining : remaining) >= 0 ? "#6AE89B" : "#E86A6A" },
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
                {[...CATEGORIES].sort((a, b) => { const netA = getCatData(a.id).net; const netB = getCatData(b.id).net; return netB - netA; }).map((cat) => {
                  const { net, target, pct: catPct, status } = getCatData(cat.id);
                  if (net === 0 && target === 0) return null;
                  const isExcluded = !!excludedCats[cat.id];
                  const barPct = target > 0 ? catPct : (total > 0 ? (Math.max(net,0) / total) * 100 : 0);
                  const pctOfTotal = totalIncExcluded !== 0 ? Math.abs((net / totalIncExcluded) * 100) : 0;
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
                          {pctOfTotal > 0 && <span style={{ fontSize: 10, color: T.textFaint }}>{pctOfTotal.toFixed(0)}%</span>}
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

          {/* ── IMPORT ── */}
          {activeTab === "import" && (() => {
            // ── CSV parsing logic ──────────────────────────────────────────
            // ── Citi website copy-paste parser ───────────────────────────────
            const parseCitiWeb = (text) => {
              const isDateLine = (s) =>
                /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+,\s+\d{4}$/.test(s);

              const parseCitiDate = (s) => new Date(s);

              const parseCitiAmount = (s) => {
                const isNeg = s.startsWith("-") || s.startsWith("−");
                const num = parseFloat(s.replace(/[^0-9.]/g, ""));
                return isNaN(num) ? null : (isNeg ? -num : num);
              };

              const isAmountLine = (s) => /^[$−-]?\$?[\d,]+\.\d{2}/.test(s) || /^\$[\d,]+/.test(s);
              const isSkipLine = (s) => /Eligible for Citi|Citi.*Flex Pay|Digital Account Number/i.test(s);

              const shouldSkip = (desc) => {
                const d = desc.toUpperCase();
                return /PAYMENT.THANK.YOU|ONLINE.PAYMENT|AUTOPAY|BILL.PAY|MOBILE.PAY|CREDIT.POSTED/.test(d);
              };

              const categorize = (desc) => {
                const d = desc.toUpperCase();
                if (/COSTCO|WM\s?SUPERCENTER|WALMART|STOKES|SMITH.S|KROGER|TRADER JOE|WHOLE FOOD|WINCO|HARMON|MACEYS|SPROUTS|ALDI|SAFEWAY|FRESH FOOD|FROSTOP/.test(d)) return "groceries";
                if (/MCDONALD|CHICK.FIL|SUBWAY|WENDY|BURGER|TACO|PIZZA|CAFE|PANERA|STARBUCKS|DUTCH.BROS|SONIC|OLIVE.GARDEN|TEXAS.ROAD|RED.ROBIN|APPLEBEE|IHOP|DENNY|WAFFLE|SWIG|KNEADERS|CAFE.RIO|ZUPAS|CHIPOTLE|DOMINO|RAISING|IN-N-OUT|CULVER|FIVE.GUYS|CRUMBL|TAILWIND|FIIZ|JIMMY.JOHN|HIVE|CUPBOP|CUBBY/.test(d)) return "dining";
                if (/CHEVRON|SHELL|MAVERIK|MAVERICK|EXXON|MOBIL|SINCLAIR|PHILLIPS|PILOT|LOVE.S|AUTOZONE|JIFFY.LUBE|FIRESTONE|VALVOLINE|NAPA.AUTO|UBER|LYFT|DISCOUNT.TIRE/.test(d)) return "transport";
                if (/NETFLIX|HULU|DISNEY|SPOTIFY|APPLE.COM|GOOGLE|AUDIBLE|YOUTUBE|SLING|PEACOCK|PARAMOUNT|HBO|VIVINT|ADT|FITNESS|GYM|INSURANCE|AT&T|VERIZON|T-MOBILE|COMCAST|XFINITY|NINTENDO|VIDANGEL|PAYPAL.*DISNEY|PAYPAL.*NETFLIX|PAYPAL.*HULU/.test(d)) return "recurring";
                if (/AMAZON|NIKE|TARGET|NORDSTROM|MACY|KOHL|OLD.NAVY|GAP|DICK.S|SCHEELS|HOMEGOODS|TJ.MAXX|MARSHALLS|ROSS|EBAY|ETSY|CVS|WALGREEN|WALMART.COM/.test(d)) return "shopping";
                if (/BYU|TICKET/.test(d)) return "other";
                return "other";
              };

              // Clean lines — remove empty lines and separator lines (---, ===, etc.)
              const rawLines = text.split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l && !/^[-=*_]{2,}$/.test(l));

              // Group into blocks by date lines
              const blocks = [];
              let cur = [];
              for (const line of rawLines) {
                if (isDateLine(line) && cur.length > 0) {
                  blocks.push(cur);
                  cur = [line];
                } else {
                  cur.push(line);
                }
              }
              if (cur.length > 0) blocks.push(cur);

              const rows = [];
              for (const block of blocks) {
                if (block.length < 2) continue;
                try {
                  const date = parseCitiDate(block[0]);
                  // Amount is the last line (starts with $)
                  const amountStr = block[block.length - 1];
                  if (!isAmountLine(amountStr)) continue;
                  const amount = parseCitiAmount(amountStr);
                  if (amount === null || amount < 0) continue; // skip negatives (credits/payments)

                  // Description: first non-date, non-skip, non-amount line
                  let desc = "";
                  for (let i = 1; i < block.length - 1; i++) {
                    if (!isSkipLine(block[i]) && !isAmountLine(block[i])) {
                      desc = block[i]; break;
                    }
                  }
                  if (!desc) desc = block[1];
                  // Clean up "Digital Account Number" from description if at end
                  desc = desc.replace(/\s*Digital Account Number\s*X+\d+/i, "").trim();

                  if (shouldSkip(desc)) continue;

                  rows.push({
                    id: String(Date.now() + Math.random()),
                    date: date.toDateString(),
                    dateObj: date,
                    desc: desc.trim(),
                    amount,
                    category: categorize(desc),
                    include: true,
                    period: periodKey(date, viewMode),
                  });
                } catch (e) { continue; }
              }

              rows.sort((a, b) => b.dateObj - a.dateObj);
              return { format: "citi_web", rows, error: rows.length === 0 ? "No transactions found" : null };
            };

            // ── Chase website copy-paste parser ──────────────────────────────
            const parseChaseWeb = (text) => {
              const isDateLine = (s) =>
                /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+,\s+\d{4}$/.test(s) ||
                /^\d{2}\/\d{2}\/\d{4}$/.test(s);

              const parseWebDate = (s) => {
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
                  const [m, d, y] = s.split("/");
                  return new Date(parseInt(y), parseInt(m)-1, parseInt(d));
                }
                return new Date(s); // "Jun 13, 2026"
              };

              const parseWebAmount = (s) => {
                const isNeg = s.includes("negative") || s.startsWith("−") || s.startsWith("-");
                const num = parseFloat(s.replace(/[^0-9.]/g, ""));
                return isNaN(num) ? null : (isNeg ? -num : num);
              };

              const categorize = (desc, chaseCat = "") => {
                const d = desc.toUpperCase(); const c = chaseCat.toLowerCase();
                if (/COSTCO|WM\s?SUPERCENTER|WALMART|STOKES|SMITH.S|KROGER|TRADER JOE|WHOLE FOOD|WINCO|HARMON|MACEYS|SPROUTS|ALDI|SAFEWAY|FRESH FOOD|FROSTOP/.test(d)) return "groceries";
                if (/MCDONALD|CHICK.FIL|SUBWAY|WENDY|BURGER|TACO|PIZZA|CAFE|PANERA|STARBUCKS|DUTCH.BROS|SONIC|OLIVE.GARDEN|TEXAS.ROAD|RED.ROBIN|APPLEBEE|IHOP|DENNY|WAFFLE|SWIG|KNEADERS|CAFE.RIO|ZUPAS|CHIPOTLE|DOMINO|RAISING|IN-N-OUT|CULVER|FIVE.GUYS|CRUMBL|TAILWIND/.test(d) || c.includes("food & drink")) return "dining";
                if (/CHEVRON|SHELL|MAVERIK|MAVERICK|EXXON|MOBIL|SINCLAIR|PHILLIPS|PILOT|LOVE.S|FUEL|AUTOZONE|JIFFY.LUBE|FIRESTONE|VALVOLINE|NAPA.AUTO|UBER|LYFT|DISCOUNT.TIRE/.test(d) || c.includes("gas")) return "transport";
                if (/NETFLIX|HULU|DISNEY|SPOTIFY|APPLE.COM\/BILL|GOOGLE|AUDIBLE|YOUTUBE|SLING|VIVINT|ADT|FITNESS|GYM|INSURANCE|AT&T|VERIZON|T-MOBILE|COMCAST|XFINITY|NINTENDO/.test(d) || c.includes("entertain")) return "recurring";
                if (c.includes("travel") || /AIRPORT|PARKING|HOTEL|AIRBNB|NATIONAL CAR|HERTZ|AVIS|SOUTHWEST|DELTA|UNITED|AMERICAN AIR/.test(d)) return "other";
                if (/AMAZON|NIKE|TARGET|NORDSTROM|MACY|KOHL|OLD.NAVY|GAP|DICK.S|AL.S.SPORT|HOMEGOODS|TJ.MAXX|MARSHALLS|ROSS|EBAY|ETSY|CVS|WALGREEN|SOCCERCOM|REDWOOD/.test(d) || c.includes("shop") || c.includes("health")) return "shopping";
                return "other";
              };

              const shouldSkip = (desc) => {
                const d = desc.toUpperCase();
                return /PAYMENT.THANK.YOU|ONLINE.PAYMENT|AUTOPAY|BILL.PAY|ONLINE.TRANSFER|MOBILE.PAY/.test(d);
              };

              // Clean lines: remove header junk and empty lines
              const rawLines = text.split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l &&
                  !l.includes("not sorted") &&
                  l !== "Action" &&
                  l !== "Category" &&
                  l !== "Description" &&
                  l !== "Date" &&
                  l !== "Amount"
                );

              // Group lines into transaction blocks by date lines
              const blocks = [];
              let cur = [];
              for (const line of rawLines) {
                if (isDateLine(line) && cur.length > 0) {
                  blocks.push(cur);
                  cur = [line];
                } else {
                  cur.push(line);
                }
              }
              if (cur.length > 0) blocks.push(cur);

              const rows = [];
              for (const block of blocks) {
                if (block.length < 3) continue;
                try {
                  const date = parseWebDate(block[0]);
                  const desc = block[1]; // first description line
                  const amountStr = block[block.length - 1];
                  const amount = parseWebAmount(amountStr);
                  if (amount === null || isNaN(amount)) continue;
                  if (shouldSkip(desc)) continue;
                  // Skip payments (negative = payment on credit card)
                  if (amount < 0) continue;

                  // Try to get Chase's category from the block (doubled category line)
                  let chaseCat = "";
                  for (let i = 2; i < block.length - 1; i++) {
                    const l = block[i];
                    if (!l.includes("Pay Over Time") && !isDateLine(l)) {
                      // Doubled category like "GroceriesGroceries" — take first half
                      const half = l.slice(0, Math.floor(l.length / 2));
                      if (l.toLowerCase().startsWith(half.toLowerCase())) {
                        chaseCat = half;
                      } else {
                        chaseCat = l;
                      }
                    }
                  }

                  rows.push({
                    id: String(Date.now() + Math.random()),
                    date: date.toDateString(),
                    dateObj: date,
                    desc: desc.trim(),
                    amount,
                    category: categorize(desc, chaseCat),
                    include: true,
                    period: periodKey(date, viewMode),
                  });
                } catch (e) { continue; }
              }

              rows.sort((a, b) => b.dateObj - a.dateObj);
              return { format: "chase_web", rows, error: rows.length === 0 ? "No transactions found" : null };
            };

            const parseCSV = (text) => {
              // ── Chase website copy-paste format ──────────────────────────
              // Detect by presence of "not sorted" in header or doubled descriptions
              if (text.includes("not sorted") || text.includes("not sortedDate") || text.includes("not sortedAmount")) {
                return parseChaseWeb(text);
              }

              // ── Citi website copy-paste format ──────────────────────────
              // Detect: explicit Citi markers, OR generic date→description→amount pattern
              // (covers both the full statement view and the pending/simple view)
              const hasCitiMarker = text.includes("Eligible for Citi") || text.includes("Citi® Flex Pay") || text.includes("Citi Flex Pay");
              const hasDateAmountPattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+,\s+\d{4}$/m.test(text) && /^\$[\d,]+\.\d{2}$/m.test(text);
              if (hasCitiMarker || hasDateAmountPattern) {
                return parseCitiWeb(text);
              }

              const lines = text.trim().split(/\r?\n/);
              if (lines.length < 2) return { error: "No data found" };

              // Auto-detect delimiter: tab vs comma
              const firstLine = lines[0];
              const tabCount = (firstLine.match(/\t/g) || []).length;
              const commaCount = (firstLine.match(/,/g) || []).length;
              const delim = tabCount > commaCount ? "\t" : ",";

              const splitRow = (line) => {
                if (delim === "\t") return line.split("\t").map((f) => f.trim().replace(/^"|"$/g, ""));
                // CSV comma split respecting quotes
                const row = []; let cur = ""; let inQ = false;
                for (const ch of line + ",") {
                  if (ch === '"') { inQ = !inQ; }
                  else if (ch === "," && !inQ) { row.push(cur.trim()); cur = ""; }
                  else { cur += ch; }
                }
                return row;
              };

              const headers = splitRow(lines[0]).map((h) => h.toLowerCase());

              // Detect format
              const has = (name) => headers.some((h) => h.includes(name));
              let format = null;
              if (has("transaction date") && has("post date") && has("type") && has("amount")) format = "chase_card";
              else if (has("details") && has("posting date") && has("balance")) format = "chase_checking";
              else if (has("status") && has("date") && has("debit") && has("credit")) format = "cu"; // credit union (both variants)
              else return { error: `Unrecognized format. Headers found: ${headers.join(", ")}` };

              // Category keyword rules
              const categorize = (desc) => {
                const d = desc.toUpperCase();
                if (/COSTCO|WM\s?SUPERCENTER|WALMART|STOKES|SMITH.S|KROGER|TRADER JOE|WHOLE FOOD|WINCO|HARMON|MACEYS|SPROUTS|ALDI|SAFEWAY|FRESH FOOD|FROSTOP|BROULIMS/.test(d)) return "groceries";
                if (/MCDONALD|CHICK.FIL|SUBWAY|WENDY|BURGER|TACO|PIZZA|CAFE|PANERA|STARBUCKS|DUTCH.BROS|SONIC|OLIVE.GARDEN|TEXAS.ROAD|RED.ROBIN|APPLEBEE|IHOP|DENNY|WAFFLE|SWIG|KNEADERS|CAFE.RIO|ZUPAS|CUBBY|CINNABON|JAMBA|TROPICAL|PANDA|RAISING|IN-N-OUT|CULVER|SHAKE.SHACK|FIVE.GUYS|SMASH|CRUMBL|SILL|NIELSEN.S|HOP/.test(d)) return "dining";
                if (/CHEVRON|SHELL|MAVERIK|MAVERICK|EXXON|MOBIL|SINCLAIR|PHILLIPS|PILOT|LOVE.S.TRAVEL|FUEL|GAS.STATION|AUTOZONE|JIFFY.LUBE|FIRESTONE|VALVOLINE|NAPA.AUTO|PEP.BOYS|O.REILLY|UBER|LYFT|DISCOUNT.TIRE/.test(d)) return "transport";
                if (/NETFLIX|HULU|DISNEY|SPOTIFY|APPLE.COM\/BILL|GOOGLE.*STOR|AMAZON.PRIME|AUDIBLE|YOUTUBE|SLING|HBO|PARAMOUNT|PEACOCK|VIVINT|ADT|PLANET.FITNESS|LA.FITNESS|GOLD.S.GYM|INSURANCE|ALLSTATE|STATE.FARM|GEICO|PROGRESSIVE|BLUE.CROSS|CIGNA|AT&T|VERIZON|T-MOBILE|COMCAST|XFINITY/.test(d)) return "recurring";
                if (/AMAZON|NIKE|TARGET|NORDSTROM|MACY|KOHL|OLD.NAVY|GAP|H&M|DICK.S.SPORT|AL.S.SPORT|HOMEGOODS|TJ.MAXX|MARSHALLS|ROSS|EBAY|ETSY|WALMART(?!.*SUPER)|COSTCO(?!.*FOOD)/.test(d)) return "shopping";
                return "other";
              };

              // Skip patterns — payments, transfers, payroll
              const shouldSkip = (desc, type = "") => {
                const d = desc.toUpperCase(); const t = type.toUpperCase();
                return /PAYMENT.THANK.YOU|ONLINE.PAYMENT|AUTOPAY|BILL.PAY|MOBILE.PAY|ONLINE.TRANSFER|ACCT.XFER|LOAN.PMT/.test(d)
                  || t === "payment" || t === "acct_xfer" || t === "loan_pmt";
              };

              const getCol = (row, name) => {
                const idx = headers.findIndex((h) => h.includes(name));
                return idx >= 0 ? (row[idx] || "").trim().replace(/^"|"$/g, "") : "";
              };

              const parseDate = (str) => {
                // M/D/YYYY, MM/DD/YYYY, M/D/YY, or MM/DD/YY
                const parts = str.split("/");
                if (parts.length === 3) {
                  let year = parseInt(parts[2]);
                  if (year < 100) year += 2000; // handle 2-digit years
                  return new Date(year, parseInt(parts[0])-1, parseInt(parts[1]));
                }
                return new Date(str);
              };

              const rows = [];
              for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const row = splitRow(lines[i]);

                let date, desc, amount, type = "";
                try {
                  if (format === "chase_card") {
                    date = parseDate(getCol(row, "transaction date"));
                    desc = getCol(row, "description");
                    amount = parseFloat(getCol(row, "amount"));
                    type = getCol(row, "type");
                    if (shouldSkip(desc, type)) continue;
                    if (isNaN(amount)) continue;
                    // Chase card: negative = expense, positive = return/credit
                    // flip sign so expenses are positive in our app
                    amount = -amount;
                  } else if (format === "chase_checking") {
                    date = parseDate(getCol(row, "posting date"));
                    desc = getCol(row, "description");
                    amount = parseFloat(getCol(row, "amount"));
                    type = getCol(row, "type");
                    if (shouldSkip(desc, type)) continue;
                    if (isNaN(amount)) continue;
                    // checking: negative = expense, positive = income — skip income
                    if (amount > 0) continue;
                    amount = -amount; // flip to positive
                  } else if (format === "cu") {
                    date = parseDate(getCol(row, "date"));
                    desc = getCol(row, "description");
                    const debit = parseFloat(getCol(row, "debit")) || 0;
                    const credit = parseFloat(getCol(row, "credit")) || 0;
                    if (shouldSkip(desc)) continue;
                    // Debit > 0 = expense; Credit < 0 = refund; Credit > 0 = payment (skip)
                    if (debit > 0) { amount = debit; }
                    else if (credit < 0) { amount = credit; } // negative = refund (credit back)
                    else { continue; } // skip positive credits (payments)
                  }
                  if (!desc || !date || isNaN(amount)) continue;
                  const dateStr = date.toDateString();
                  rows.push({
                    id: String(Date.now() + Math.random()),
                    date: dateStr,
                    dateObj: date,
                    desc: desc.replace(/\s+/g, " ").trim(),
                    amount,
                    category: categorize(desc),
                    include: true,
                    period: periodKey(date, viewMode),
                  });
                } catch (e) { continue; }
              }
              rows.sort((a, b) => b.dateObj - a.dateObj);
              return { format, rows, error: null };
            };

            return <ImportTab parseCSV={parseCSV} expenses={allExpenses} historyExpenses={historyExpenses} setAllExpenses={setAllExpenses} upsertExpense={upsertExpense} upsertFundTransaction={upsertFundTransaction} setFundTransactions={setFundTransactions} curPeriodKey={curPeriodKey} funds={funds} periodStart={periodStart} periodEnd={periodEnd} T={T} iStyle={iStyle} fmt={fmt} CATEGORIES={CATEGORIES} setSyncStatus={setSyncStatus} setSyncError={setSyncError} />;
          })()}

          {/* ── HISTORY ── */}
          {activeTab === "history" && (() => {
            // Load all expenses on first open
            if (!historyLoaded && !historyLoading) {
              setHistoryLoading(true);
              loadAllExpenses().then((data) => {
                setHistoryExpenses(data || []);
                setHistoryLoaded(true);
                setHistoryLoading(false);
              }).catch(() => setHistoryLoading(false));
            }

            if (historyLoading) return (
              <div style={{ textAlign: "center", color: T.textDim, fontSize: 12, padding: "40px 0" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>Loading history...
              </div>
            );

            // Build rolling 13 months
            const now = new Date();
            const months = [];
            for (let i = 12; i >= 0; i--) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
              months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
            }

            // Aggregate data per month
            const monthData = months.map((mk) => {
              const mExps = historyExpenses.filter((e) => {
                const d = new Date(e.date); 
                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` === mk;
              });
              const mFundTx = fundTransactions.filter((t) => monthKey(t.date) === mk);
              const budgetSpent = mExps.reduce((s, e) => s + parseFloat(e.amount), 0);
              const fundsOnly = mFundTx.reduce((s, t) => s + parseFloat(t.amount), 0);
              const total = budgetSpent + fundsOnly;
              const hasData = mExps.length > 0 || mFundTx.length > 0;
              return { mk, budgetSpent, fundsOnly, total, hasData, exps: mExps, fundTxs: mFundTx };
            });

            const withData = monthData.filter((m) => m.hasData);
            const avgBudget = withData.length > 0 ? withData.reduce((s, m) => s + m.budgetSpent, 0) / withData.length : 0;
            const avgFunds = withData.length > 0 ? withData.reduce((s, m) => s + m.fundsOnly, 0) / withData.length : 0;
            const avgTotal = withData.length > 0 ? withData.reduce((s, m) => s + m.total, 0) / withData.length : 0;

            // Chart dimensions
            const chartW = isDesktop ? 860 : 440; const chartH = isDesktop ? 180 : 140; const padL = 48; const padR = 12; const padT = 12; const padB = 28;
            const innerW = chartW - padL - padR;
            const innerH = chartH - padT - padB;
            const allTotals = monthData.map((m) => m.total).filter((v) => v > 0);
            const maxVal = allTotals.length > 0 ? Math.max(...allTotals) * 1.15 : 1000;
            const xStep = innerW / (months.length - 1);
            const yScale = (v) => padT + innerH - (v / maxVal) * innerH;
            const xPos = (i) => padL + i * xStep;

            const linePath = (getter) => monthData.map((m, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yScale(getter(m)).toFixed(1)}`).join(" ");
            const areaPath = (getter) => `${linePath(getter)} L ${xPos(months.length-1).toFixed(1)} ${(padT+innerH).toFixed(1)} L ${padL.toFixed(1)} ${(padT+innerH).toFixed(1)} Z`;

            const curMk = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
            const prevYearMk = `${now.getFullYear()-1}-${String(now.getMonth()+1).padStart(2,"0")}`;

            const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((f) => ({ val: maxVal * f, y: yScale(maxVal * f) }));

            const fmtK = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${Math.round(n)}`;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Averages */}
                {withData.length > 0 && (
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 10 }}>
                      {withData.length}-MONTH AVERAGE
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      {[
                        { label: "BUDGET", value: fmt(avgBudget), color: "#6A9BE8" },
                        { label: "FUNDS-ONLY", value: fmt(avgFunds), color: "#B86AE8" },
                        { label: "TOTAL", value: fmt(avgTotal), color: T.accent },
                      ].map((s) => (
                        <div key={s.label} style={{ background: T.surface2, borderRadius: 8, padding: "8px 10px" }}>
                          <div style={{ fontSize: 8, letterSpacing: "0.1em", color: T.textDim, marginBottom: 3 }}>{s.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: s.color }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line chart */}
                {withData.length > 1 && (
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 10px 10px" }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.textDim, marginBottom: 8, paddingLeft: 4 }}>ROLLING 13 MONTHS</div>
                    <div style={{ overflowX: "auto" }}>
                      <svg width={chartW} height={chartH} style={{ display: "block", minWidth: chartW }}>
                        {/* Grid lines */}
                        {yTicks.map(({ val, y }) => (
                          <g key={val}>
                            <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke={T.border} strokeWidth={1} />
                            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={8} fill={T.textFaint}>{fmtK(val)}</text>
                          </g>
                        ))}
                        {/* Area fills */}
                        <path d={areaPath((m) => m.budgetSpent)} fill="#6A9BE822" />
                        <path d={areaPath((m) => m.fundsOnly)} fill="#B86AE811" />
                        {/* Lines */}
                        <path d={linePath((m) => m.total)} fill="none" stroke={T.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                        <path d={linePath((m) => m.budgetSpent)} fill="none" stroke="#6A9BE8" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
                        <path d={linePath((m) => m.fundsOnly)} fill="none" stroke="#B86AE8" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />
                        {/* Dots for current and same-month-last-year */}
                        {monthData.map((m, i) => {
                          const highlight = m.mk === curMk || m.mk === prevYearMk;
                          if (!highlight && !m.hasData) return null;
                          return (
                            <g key={m.mk}>
                              {m.hasData && <circle cx={xPos(i)} cy={yScale(m.total)} r={m.mk === curMk ? 5 : 3} fill={T.accent} stroke={T.surface} strokeWidth={1.5} />}
                              {m.mk === curMk && <text x={xPos(i)} y={yScale(m.total) - 8} textAnchor="middle" fontSize={8} fill={T.accent}>NOW</text>}
                              {m.mk === prevYearMk && m.hasData && <text x={xPos(i)} y={yScale(m.total) - 8} textAnchor="middle" fontSize={8} fill={T.textDim}>LY</text>}
                            </g>
                          );
                        })}
                        {/* X axis labels — show every 3 months */}
                        {monthData.map((m, i) => {
                          if (i % 3 !== 0 && m.mk !== curMk) return null;
                          const [y, mo] = m.mk.split("-");
                          const label = new Date(y, mo-1, 1).toLocaleDateString("en-US", { month: "short" });
                          return <text key={m.mk} x={xPos(i)} y={chartH - 6} textAnchor="middle" fontSize={8} fill={m.mk === curMk ? T.accent : T.textFaint}>{label}</text>;
                        })}
                      </svg>
                    </div>
                    {/* Legend */}
                    <div style={{ display: "flex", gap: 12, paddingLeft: padL, marginTop: 6 }}>
                      {[
                        { color: T.accent, label: "Total", dash: false },
                        { color: "#6A9BE8", label: "Budget", dash: false },
                        { color: "#B86AE8", label: "Funds-only", dash: true },
                      ].map((l) => (
                        <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <svg width={16} height={8}>
                            <line x1={0} y1={4} x2={16} y2={4} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash ? "4 2" : undefined} />
                          </svg>
                          <span style={{ fontSize: 9, color: T.textDim }}>{l.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Month rows */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "2fr 1fr 1fr 1fr" : "1fr 1fr 1fr 1fr", padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
                    {["MONTH", "BUDGET", "FUNDS", "TOTAL"].map((h) => (
                      <div key={h} style={{ fontSize: 8, letterSpacing: "0.1em", color: T.textFaint }}>{h}</div>
                    ))}
                  </div>
                  {[...monthData].reverse().map((m) => {
                    const isExpanded = expandedMonths[m.mk];
                    const isCur = m.mk === curMk;
                    const isPrevYear = m.mk === prevYearMk;
                    const [y, mo] = m.mk.split("-");
                    const label = new Date(y, mo-1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

                    // Category breakdown for this month
                    const catBreakdown = CATEGORIES.map((c) => {
                      const catExps = m.exps.filter((e) => e.category === c.id);
                      const catNet = catExps.reduce((s, e) => s + parseFloat(e.amount), 0);
                      return { ...c, net: catNet, count: catExps.length };
                    }).filter((c) => c.net !== 0).sort((a, b) => b.net - a.net);

                    return (
                      <div key={m.mk} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <div
                          onClick={() => m.hasData && toggleMonth(m.mk)}
                          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "11px 14px", alignItems: "center", cursor: m.hasData ? "pointer" : "default", background: isCur ? `${T.accent}11` : isPrevYear ? `${T.border}` : "transparent" }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: isCur ? 600 : 400, color: isCur ? T.accent : isPrevYear ? T.textMuted : T.text }}>{label}</div>
                            {isCur && <div style={{ fontSize: 8, color: T.accent, letterSpacing: "0.08em" }}>CURRENT</div>}
                            {isPrevYear && <div style={{ fontSize: 8, color: T.textFaint, letterSpacing: "0.08em" }}>LAST YR</div>}
                          </div>
                          <div style={{ fontSize: 12, color: m.hasData ? "#6A9BE8" : T.textFaint }}>{m.hasData ? fmt(m.budgetSpent) : "—"}</div>
                          <div style={{ fontSize: 12, color: m.hasData ? "#B86AE8" : T.textFaint }}>{m.hasData ? fmt(m.fundsOnly) : "—"}</div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: m.hasData ? T.accent : T.textFaint }}>{m.hasData ? fmt(m.total) : "—"}</div>
                            {m.hasData && <span style={{ fontSize: 10, color: T.textDim, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>}
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ padding: "0 14px 12px", background: T.surface2 }}>
                            {/* Category breakdown with expandable transactions */}
                            {catBreakdown.length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: 8, letterSpacing: "0.1em", color: T.textDim, marginBottom: 8 }}>BY CATEGORY</div>
                                {catBreakdown.map((c) => {
                                  const pct = m.budgetSpent !== 0 ? Math.abs((c.net / m.budgetSpent) * 100) : 0;
                                  const catExps = m.exps.filter((e) => e.category === c.id).sort((a, b) => Math.abs(parseFloat(b.amount)) - Math.abs(parseFloat(a.amount)));
                                  const catKey = `${m.mk}-${c.id}`;
                                  const isCatExpanded = expandedHistoryCats[catKey];
                                  return (
                                    <div key={c.id} style={{ marginBottom: 10 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                        <button className="btn" onClick={() => toggleHistoryCat(catKey)}
                                          style={{ background: "none", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", padding: 0 }}>
                                          <span style={{ fontSize: 11 }}>{c.icon} {c.label}</span>
                                          <span style={{ fontSize: 9, color: T.textFaint }}>({catExps.length})</span>
                                          <span style={{ fontSize: 10, color: T.textFaint, transform: isCatExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                                        </button>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                          <span style={{ fontSize: 9, color: T.textFaint }}>{pct.toFixed(0)}%</span>
                                          <span style={{ fontSize: 12, color: c.net < 0 ? "#6AE89B" : c.color }}>{c.net < 0 ? `+${fmt(Math.abs(c.net))}` : fmt(c.net)}</span>
                                        </div>
                                      </div>
                                      <div style={{ height: 3, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: isCatExpanded ? 6 : 0 }}>
                                        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: c.color, borderRadius: 2 }} />
                                      </div>
                                      {/* Transaction list */}
                                      {isCatExpanded && (
                                        <div style={{ background: T.surface, borderRadius: 8, overflow: "hidden", marginTop: 4 }}>
                                          {catExps.map((e) => {
                                            const isCredit = parseFloat(e.amount) < 0;
                                            const isEditingThis = editingHistoryExpense?.id === e.id;
                                            const fund = funds.find((f) => f.id === e.fund_id);
                                            return (
                                              <div key={e.id} style={{ borderBottom: `1px solid ${T.surface3}` }}>
                                                {/* Transaction row */}
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px" }}>
                                                  <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                                                    <div style={{ fontSize: 9, color: T.textDim, marginTop: 1 }}>
                                                      {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                      {fund && <span style={{ marginLeft: 6, color: T.accent }}>· {fund.icon} {fund.name}</span>}
                                                      {isCredit && <span style={{ marginLeft: 6, color: "#6AE89B" }}>· credit</span>}
                                                    </div>
                                                  </div>
                                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 500, color: isCredit ? "#6AE89B" : c.color }}>{isCredit ? `+${fmt(Math.abs(parseFloat(e.amount)))}` : fmt(parseFloat(e.amount))}</div>
                                                    <button className="btn"
                                                      onClick={() => isEditingThis ? setEditingHistoryExpense(null) : setEditingHistoryExpense({ id: e.id, amount: String(Math.abs(parseFloat(e.amount))), label: e.label, category: e.category, isCredit, fund_id: e.fund_id || null, editFundMode: e.fund_id ? "tag" : "none" })}
                                                      style={{ background: isEditingThis ? T.surface2 : "none", border: isEditingThis ? `1px solid ${T.border}` : "none", borderRadius: 6, color: isEditingThis ? T.accent : T.textDim, fontSize: 11, padding: "2px 7px", fontFamily: "inherit" }}>
                                                      {isEditingThis ? "cancel" : "edit"}
                                                    </button>
                                                  </div>
                                                </div>
                                                {/* Inline edit form */}
                                                {isEditingThis && (
                                                  <div style={{ background: T.surface2, padding: "10px 10px 12px" }}>
                                                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                                      <input type="number" inputMode="decimal" value={editingHistoryExpense.amount}
                                                        onChange={(e) => setEditingHistoryExpense((p) => ({ ...p, amount: e.target.value }))}
                                                        style={{ flex: "0 0 90px", background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 15, padding: "7px 9px", fontFamily: "inherit", outline: "none" }} />
                                                      <input type="text" value={editingHistoryExpense.label}
                                                        onChange={(e) => setEditingHistoryExpense((p) => ({ ...p, label: e.target.value }))}
                                                        onKeyDown={(e) => e.key === "Enter" && saveHistoryEdit()}
                                                        style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 14, padding: "7px 9px", fontFamily: "inherit", outline: "none" }} />
                                                    </div>
                                                    {/* Category */}
                                                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                                                      {CATEGORIES.map((cat) => (
                                                        <button key={cat.id} className="btn" onClick={() => setEditingHistoryExpense((p) => ({ ...p, category: cat.id }))}
                                                          style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: editingHistoryExpense.category === cat.id ? `${cat.color}33` : T.surface3, border: `1px solid ${editingHistoryExpense.category === cat.id ? cat.color : T.border}`, color: editingHistoryExpense.category === cat.id ? cat.color : T.textMuted }}>
                                                          {cat.icon} {cat.label}
                                                        </button>
                                                      ))}
                                                    </div>
                                                    {/* Fund */}
                                                    {funds.length > 0 && (
                                                      <div style={{ marginBottom: 8 }}>
                                                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                                                          <span style={{ fontSize: 9, color: T.textDim, letterSpacing: "0.08em" }}>FUND:</span>
                                                          {[{ mode: "none", label: "None" }, { mode: "tag", label: "Tag" }, { mode: "move", label: "Move" }].map(({ mode, label }) => (
                                                            <button key={mode} className="btn" onClick={() => setEditingHistoryExpense((p) => ({ ...p, editFundMode: mode, fund_id: mode === "none" ? null : p.fund_id }))}
                                                              style={{ padding: "3px 7px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: (editingHistoryExpense.editFundMode || "none") === mode ? T.accent+"33" : T.surface3, border: `1px solid ${(editingHistoryExpense.editFundMode || "none") === mode ? T.accent : T.border}`, color: (editingHistoryExpense.editFundMode || "none") === mode ? T.accent : T.textMuted }}>
                                                              {label}
                                                            </button>
                                                          ))}
                                                          {editingHistoryExpense.editFundMode && editingHistoryExpense.editFundMode !== "none" && funds.map((f) => (
                                                            <button key={f.id} className="btn" onClick={() => setEditingHistoryExpense((p) => ({ ...p, fund_id: p.fund_id === f.id ? null : f.id }))}
                                                              style={{ padding: "3px 7px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: editingHistoryExpense.fund_id === f.id ? T.accent+"33" : T.surface3, border: `1px solid ${editingHistoryExpense.fund_id === f.id ? T.accent : T.border}`, color: editingHistoryExpense.fund_id === f.id ? T.accent : T.textMuted }}>
                                                              {f.icon} {f.name}
                                                            </button>
                                                          ))}
                                                        </div>
                                                        {editingHistoryExpense.editFundMode === "move" && editingHistoryExpense.fund_id && (
                                                          <button className="btn" onClick={() => moveHistoryExpenseToFund(editingHistoryExpense.id, editingHistoryExpense.fund_id)}
                                                            style={{ width: "100%", background: "#E8D06A22", border: "1px solid #E8D06A44", borderRadius: 6, padding: "7px", fontSize: 11, color: "#E8D06A", fontFamily: "inherit", marginTop: 6 }}>
                                                            Move to {funds.find(f => f.id === editingHistoryExpense.fund_id)?.name} (removes from budget)
                                                          </button>
                                                        )}
                                                      </div>
                                                    )}
                                                    <div style={{ display: "flex", gap: 6 }}>
                                                      <button className="btn" onClick={saveHistoryEdit}
                                                        style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 7, padding: "9px", fontSize: 12, fontWeight: 500, fontFamily: "inherit" }}>SAVE</button>
                                                      <button className="btn" onClick={() => { setHistoryExpenses((prev) => prev.filter((ex) => ex.id !== e.id)); setAllExpenses((prev) => prev.filter((ex) => ex.id !== e.id)); setEditingHistoryExpense(null); setSyncStatus("saving"); deleteExpense(e.id).then(() => setSyncStatus("idle")).catch(() => setSyncStatus("error")); }}
                                                        style={{ padding: "9px 12px", background: "#E86A6A22", border: "1px solid #E86A6A44", color: "#E86A6A", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }}>Delete</button>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* Fund transactions this month */}
                            {m.fundTxs.length > 0 && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ fontSize: 8, letterSpacing: "0.1em", color: T.textDim, marginBottom: 8 }}>FUNDS-ONLY TRANSACTIONS</div>
                                {m.fundTxs.map((t) => {
                                  const fund = funds.find((f) => f.id === t.fund_id);
                                  return (
                                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "5px 0", borderBottom: `1px solid ${T.surface3}` }}>
                                      <span style={{ color: T.textMuted }}>{fund ? `${fund.icon} ${fund.name}` : "Fund"} · {t.label}</span>
                                      <span style={{ color: "#B86AE8" }}>{fmt(parseFloat(t.amount))}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* Totals row */}
                            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, marginTop: 4, borderTop: `1px solid ${T.border}` }}>
                              <span style={{ fontSize: 11, color: T.textDim }}>Total out of pocket</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>{fmt(m.total)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Large transactions across all history */}
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer" }}
                  onClick={() => setShowLarge((v) => !v)}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", color: T.textDim }}>LARGE TRANSACTIONS</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                      {historyExpenses.filter(e => parseFloat(e.amount) >= largeThreshold).length} over {fmt(largeThreshold)} — all months
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={ev => ev.stopPropagation()}>
                      <span style={{ fontSize: 12, color: T.textMuted }}>$</span>
                      <input type="number" inputMode="decimal" value={largeThreshold}
                        onChange={(ev) => setLargeThreshold(Math.max(0, parseFloat(ev.target.value) || 0))}
                        style={{ width: 60, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 14, padding: "4px 7px", fontFamily: "inherit", outline: "none", textAlign: "right" }} />
                    </div>
                    <span style={{ fontSize: 11, color: T.textDim, transform: showLarge ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                  </div>
                </div>
                {showLarge && (() => {
                  const large = [...historyExpenses]
                    .filter(e => parseFloat(e.amount) >= largeThreshold)
                    .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
                  if (large.length === 0) return (
                    <div style={{ padding: "14px 16px", fontSize: 12, color: T.textFaint, textAlign: "center", borderTop: `1px solid ${T.border}` }}>
                      No transactions over {fmt(largeThreshold)}
                    </div>
                  );
                  return (
                    <div style={{ borderTop: `1px solid ${T.border}` }}>
                      {large.map((e) => {
                        const cat = CATEGORIES.find((c) => c.id === e.category) || CATEGORIES[CATEGORIES.length - 1];
                        const fund = funds.find((f) => f.id === e.fund_id);
                        const isEditingThis = editingLarge?.id === e.id;
                        const dateLabel = new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                        return (
                          <div key={e.id} style={{ borderBottom: `1px solid ${T.surface3}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${cat.color}22`, border: `1px solid ${cat.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{cat.icon}</div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                                    <span style={{ color: T.textMuted }}>{dateLabel}</span>
                                    <span style={{ marginLeft: 6, color: cat.color }}>· {cat.label}</span>
                                    {fund && <span style={{ marginLeft: 6, color: T.accent }}>· {fund.icon} {fund.name}</span>}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{fmt(parseFloat(e.amount))}</div>
                                <button className="btn"
                                  onClick={() => isEditingThis ? setEditingLarge(null) : setEditingLarge({ id: e.id, amount: String(parseFloat(e.amount)), label: e.label, category: e.category, isCredit: false, fund_id: e.fund_id || null, editFundMode: e.fund_id ? "tag" : "none" })}
                                  style={{ background: isEditingThis ? T.surface2 : "none", border: isEditingThis ? `1px solid ${T.border}` : "none", borderRadius: 6, color: isEditingThis ? T.accent : T.textDim, fontSize: 11, padding: "2px 7px", fontFamily: "inherit" }}>
                                  {isEditingThis ? "cancel" : "edit"}
                                </button>
                              </div>
                            </div>
                            {isEditingThis && (
                              <div style={{ background: T.surface2, padding: "10px 16px 12px" }}>
                                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                  <input type="number" inputMode="decimal" value={editingLarge.amount}
                                    onChange={(ev) => setEditingLarge((p) => ({ ...p, amount: ev.target.value }))}
                                    style={{ flex: "0 0 100px", background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 15, padding: "7px 9px", fontFamily: "inherit", outline: "none" }} />
                                  <input type="text" value={editingLarge.label}
                                    onChange={(ev) => setEditingLarge((p) => ({ ...p, label: ev.target.value }))}
                                    style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 14, padding: "7px 9px", fontFamily: "inherit", outline: "none" }} />
                                </div>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                                  {CATEGORIES.map((c) => (
                                    <button key={c.id} className="btn" onClick={() => setEditingLarge((p) => ({ ...p, category: c.id }))}
                                      style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: editingLarge.category === c.id ? `${c.color}33` : T.surface3, border: `1px solid ${editingLarge.category === c.id ? c.color : T.border}`, color: editingLarge.category === c.id ? c.color : T.textMuted }}>
                                      {c.icon} {c.label}
                                    </button>
                                  ))}
                                </div>
                                {funds.length > 0 && (
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
                                    <span style={{ fontSize: 9, color: T.textDim, letterSpacing: "0.08em" }}>FUND:</span>
                                    {[{ mode: "none", label: "None" }, { mode: "tag", label: "Tag" }, { mode: "move", label: "Move" }].map(({ mode, label }) => (
                                      <button key={mode} className="btn" onClick={() => setEditingLarge((p) => ({ ...p, editFundMode: mode, fund_id: mode === "none" ? null : p.fund_id }))}
                                        style={{ padding: "2px 7px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: (editingLarge.editFundMode || "none") === mode ? T.accent+"33" : T.surface3, border: `1px solid ${(editingLarge.editFundMode || "none") === mode ? T.accent : T.border}`, color: (editingLarge.editFundMode || "none") === mode ? T.accent : T.textMuted }}>
                                        {label}
                                      </button>
                                    ))}
                                    {editingLarge.editFundMode && editingLarge.editFundMode !== "none" && funds.map((f) => (
                                      <button key={f.id} className="btn" onClick={() => setEditingLarge((p) => ({ ...p, fund_id: p.fund_id === f.id ? null : f.id }))}
                                        style={{ padding: "2px 7px", borderRadius: 20, fontSize: 10, fontFamily: "inherit", background: editingLarge.fund_id === f.id ? T.accent+"33" : T.surface3, border: `1px solid ${editingLarge.fund_id === f.id ? T.accent : T.border}`, color: editingLarge.fund_id === f.id ? T.accent : T.textMuted }}>
                                        {f.icon} {f.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {editingLarge.editFundMode === "move" && editingLarge.fund_id && (
                                  <button className="btn" onClick={() => moveExpenseToFund(editingLarge.id, editingLarge.fund_id).then(() => setEditingLarge(null))}
                                    style={{ width: "100%", background: "#E8D06A22", border: "1px solid #E8D06A44", borderRadius: 6, padding: "7px", fontSize: 11, color: "#E8D06A", fontFamily: "inherit", marginBottom: 6 }}>
                                    Move to {funds.find(f => f.id === editingLarge.fund_id)?.name} (removes from budget)
                                  </button>
                                )}
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button className="btn" onClick={() => {
                                    const amt = parseFloat(editingLarge.amount);
                                    if (!amt || !editingLarge.label.trim()) return;
                                    const updated = { ...(historyExpenses.find(ex => ex.id === editingLarge.id) || allExpenses.find(ex => ex.id === editingLarge.id)), amount: amt, label: editingLarge.label.trim(), category: editingLarge.category, fund_id: editingLarge.editFundMode === "none" ? null : (editingLarge.fund_id || null) };
                                    setHistoryExpenses(prev => prev.map(ex => ex.id === updated.id ? updated : ex));
                                    setAllExpenses(prev => prev.map(ex => ex.id === updated.id ? updated : ex));
                                    setEditingLarge(null);
                                    setSyncStatus("saving");
                                    upsertExpense(updated).then(() => setSyncStatus("idle")).catch(() => setSyncStatus("error"));
                                  }} style={{ flex: 1, background: T.accent, color: "#fff", borderRadius: 7, padding: "9px", fontSize: 12, fontWeight: 500, fontFamily: "inherit" }}>SAVE</button>
                                  <button className="btn" onClick={() => {
                                    setHistoryExpenses(prev => prev.filter(ex => ex.id !== e.id));
                                    setAllExpenses(prev => prev.filter(ex => ex.id !== e.id));
                                    setEditingLarge(null);
                                    setSyncStatus("saving");
                                    deleteExpense(e.id).then(() => setSyncStatus("idle")).catch(() => setSyncStatus("error"));
                                  }} style={{ padding: "9px 12px", background: "#E86A6A22", border: "1px solid #E86A6A44", color: "#E86A6A", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }}>Delete</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMuted, borderTop: `1px solid ${T.border}` }}>
                        <span>{large.length} transactions</span>
                        <span style={{ fontWeight: 500, color: T.text }}>{fmt(large.reduce((s, e) => s + parseFloat(e.amount), 0))}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
