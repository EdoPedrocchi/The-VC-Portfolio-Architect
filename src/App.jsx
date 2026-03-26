import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ── Global Styles ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,400&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #06080f; }
  input[type=number] { -moz-appearance: textfield; }
  input[type=number]::-webkit-outer-spin-button,
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
  input[type=range] {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px; border-radius: 2px;
    background: #1a2540; outline: none; cursor: pointer;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 20px; height: 20px; border-radius: 50%;
    background: #d4922a; cursor: pointer;
    border: 3px solid #06080f;
    box-shadow: 0 0 10px rgba(212,146,42,0.4);
    transition: box-shadow 0.2s;
  }
  input[type=range]::-webkit-slider-thumb:hover {
    box-shadow: 0 0 16px rgba(212,146,42,0.7);
  }
  input[type=range]::-moz-range-thumb {
    width: 20px; height: 20px; border-radius: 50%;
    background: #d4922a; cursor: pointer;
    border: 3px solid #06080f;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
  }
  .step-enter { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
`;

// ── Calculation Engine ────────────────────────────────────────────────────────
function calc(i) {
  const fees    = i.fundSize * (i.mgmtFee / 100) * i.fundLife;
  const net     = Math.max(0, i.fundSize - fees);
  const initCap = net * (1 - i.followOnReserve / 100);
  const resCap  = net * (i.followOnReserve / 100);
  const nStarts = i.avgCheck > 0 ? Math.floor(initCap / i.avgCheck) : 0;
  const nFO     = i.avgFollowOnCheck > 0 ? Math.floor(resCap / i.avgFollowOnCheck) : 0;
  const succ    = Math.min(Math.max(0, i.numSuccessful), nStarts);
  const gross   = succ * i.avgExitValuation * (i.exitOwnership / 100);
  const lpCap   = Math.min(gross, i.fundSize);
  const rem     = Math.max(0, gross - i.fundSize);
  const gpCarry = rem * (i.carry / 100);
  const lpProfit= rem * (1 - i.carry / 100);
  const totalLp = lpCap + lpProfit;
  const grossMoic = i.fundSize > 0 ? gross / i.fundSize : 0;
  const netMoic   = i.fundSize > 0 ? totalLp / i.fundSize : 0;
  const irr = i.avgYearsToExit > 0 && netMoic > 0
    ? (Math.pow(netMoic, 1 / i.avgYearsToExit) - 1) * 100
    : 0;
  return {
    fees, net, initCap, resCap, nStarts, nFO, succ,
    gross, lpCap, lpProfit, gpCarry, totalLp,
    grossMoic, netMoic, irr, tvpi: grossMoic, dpi: netMoic,
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────
const f1  = n => Number(n || 0).toFixed(1);
const f2  = n => Number(n || 0).toFixed(2);
const fM  = n => `$${f1(n)}M`;
const fX  = n => `${f2(n)}x`;
const fP  = n => `${f1(n)}%`;
const fN  = n => Math.round(n || 0);

function verdict(moic) {
  if (moic < 1)   return { label: "Capital Loss",   color: "#f87171", glow: "rgba(248,113,113,0.15)" };
  if (moic < 2)   return { label: "Below Target",   color: "#fbbf24", glow: "rgba(251,191,36,0.15)"  };
  if (moic < 3)   return { label: "Good Return",    color: "#34d399", glow: "rgba(52,211,153,0.15)"  };
  if (moic < 4)   return { label: "Great Return",   color: "#38bdf8", glow: "rgba(56,189,248,0.15)"  };
  return            { label: "Exceptional",          color: "#c084fc", glow: "rgba(192,132,252,0.15)" };
}

// ── Primitive Components ──────────────────────────────────────────────────────

const C = {
  bg:       "#06080f",
  surface:  "#0b0f1c",
  elevated: "#111829",
  border:   "#1a2540",
  gold:     "#d4922a",
  goldLight:"#f0b84a",
  text:     "#eef2ff",
  muted:    "#6b7fa3",
  faint:    "#2a3555",
  fontDisplay: "'Playfair Display', Georgia, serif",
  fontBody:    "'Outfit', sans-serif",
  fontMono:    "'JetBrains Mono', monospace",
};

function Label({ children, small }) {
  return (
    <p style={{
      fontFamily: C.fontBody, fontSize: small ? 11 : 12, fontWeight: 500,
      color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em",
      marginBottom: small ? 4 : 10,
    }}>{children}</p>
  );
}

function Hint({ children }) {
  return (
    <p style={{ fontFamily: C.fontBody, fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function Insight({ children }) {
  return (
    <p style={{ fontFamily: C.fontMono, fontSize: 12, color: C.gold, marginTop: 8 }}>
      ↳ {children}
    </p>
  );
}

function NumIn({ value, onChange, min = 0, max, step = 0.5, prefix, suffix }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {prefix && (
        <span style={{
          position: "absolute", left: 16, zIndex: 1,
          fontFamily: C.fontMono, fontSize: 15, color: C.muted, pointerEvents: "none",
        }}>{prefix}</span>
      )}
      <input
        type="number"
        value={value}
        min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          background: C.elevated,
          border: `1.5px solid ${focused ? C.gold : C.border}`,
          borderRadius: 10,
          padding: `15px ${suffix ? "52px" : "16px"} 15px ${prefix ? "34px" : "16px"}`,
          fontFamily: C.fontMono, fontSize: 20, fontWeight: 500, color: C.text,
          outline: "none", transition: "border-color 0.2s, box-shadow 0.2s",
          boxShadow: focused ? `0 0 0 3px rgba(212,146,42,0.12)` : "none",
        }}
      />
      {suffix && (
        <span style={{
          position: "absolute", right: 14, zIndex: 1,
          fontFamily: C.fontBody, fontSize: 12, color: C.muted, pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>{suffix}</span>
      )}
    </div>
  );
}

function RangeRow({ value, onChange, min, max, step = 1, display }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
        />
      </div>
      <div style={{
        background: C.elevated, border: `1.5px solid ${C.border}`, borderRadius: 8,
        padding: "10px 14px", fontFamily: C.fontMono, fontSize: 14,
        color: C.gold, minWidth: 72, textAlign: "center", whiteSpace: "nowrap",
      }}>{display}</div>
    </div>
  );
}

function Btn({ children, onClick, ghost, disabled }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "14px 32px", borderRadius: 10,
        border: ghost ? `1.5px solid ${C.border}` : "none",
        background: ghost ? "transparent" : hov ? C.goldLight : C.gold,
        color: ghost ? (hov ? C.text : C.muted) : C.bg,
        fontFamily: C.fontBody, fontSize: 15, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "all 0.2s", letterSpacing: "0.02em",
      }}
    >{children}</button>
  );
}

function FieldWrap({ label, hint, insight, children, half }) {
  return (
    <div style={{ marginBottom: 28, ...(half ? {} : {}) }}>
      <Label>{label}</Label>
      {children}
      {hint    && <Hint>{hint}</Hint>}
      {insight && <Insight>{insight}</Insight>}
    </div>
  );
}

function TwoCol({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {children}
    </div>
  );
}

function InsightBox({ children }) {
  return (
    <div style={{
      background: "rgba(212,146,42,0.07)",
      border: "1px solid rgba(212,146,42,0.22)",
      borderRadius: 12, padding: "16px 20px", marginBottom: 32,
      fontFamily: C.fontBody, fontSize: 14, color: "#c4a060", lineHeight: 1.7,
    }}>{children}</div>
  );
}

function StepHeading({ stepNum, title, sub }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <p style={{
        fontFamily: C.fontMono, fontSize: 11, color: C.gold,
        letterSpacing: "0.22em", marginBottom: 12,
      }}>STEP {stepNum} OF 3</p>
      <h2 style={{
        fontFamily: C.fontDisplay, fontSize: 34, fontWeight: 700,
        color: C.text, lineHeight: 1.2, marginBottom: 10,
      }}>{title}</h2>
      <p style={{ fontFamily: C.fontBody, fontSize: 15, color: C.muted, lineHeight: 1.6 }}>{sub}</p>
    </div>
  );
}

// ── Step 1: Fund Setup ────────────────────────────────────────────────────────
function Step1({ inp, set, res, onNext }) {
  const feeRatio = inp.fundSize > 0 ? (res.fees / inp.fundSize * 100) : 0;
  return (
    <div className="step-enter">
      <StepHeading stepNum={1} title="Your Fund" sub="Define the financial architecture. These numbers set the boundaries for everything else." />

      <TwoCol>
        <FieldWrap
          label="Fund Size"
          hint="Total capital raised from LPs"
          insight={res.net > 0 ? `${fM(res.net)} available to invest` : undefined}
        >
          <NumIn value={inp.fundSize} onChange={set("fundSize")} prefix="$" suffix="M" min={1} max={2000} step={5} />
        </FieldWrap>
        <FieldWrap label="Carry" hint="GP profit share above return of capital">
          <NumIn value={inp.carry} onChange={set("carry")} suffix="%" min={0} max={30} step={1} />
        </FieldWrap>
      </TwoCol>

      <TwoCol>
        <FieldWrap label="Management Fee" hint="Annual fee charged on committed capital">
          <NumIn value={inp.mgmtFee} onChange={set("mgmtFee")} suffix="% / yr" min={0.25} max={4} step={0.25} />
        </FieldWrap>
        <FieldWrap label="Fund Life" hint="Total duration of the fund">
          <NumIn value={inp.fundLife} onChange={set("fundLife")} suffix="years" min={3} max={15} step={1} />
        </FieldWrap>
      </TwoCol>

      {res.net > 0 && (
        <InsightBox>
          💼 Over {inp.fundLife} years, management fees total <strong>${f1(res.fees)}M</strong> ({f1(feeRatio)}% of the fund). Your investible capital is <strong>{fM(res.net)}</strong>.
        </InsightBox>
      )}
      {res.net <= 0 && (
        <InsightBox>
          ⚠️ Management fees exceed the fund size. Reduce fees or increase fund size.
        </InsightBox>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn onClick={onNext} disabled={res.net <= 0}>Continue →</Btn>
      </div>
    </div>
  );
}

// ── Step 2: Deployment Strategy ───────────────────────────────────────────────
function Step2({ inp, set, res, onNext, onBack }) {
  return (
    <div className="step-enter">
      <StepHeading stepNum={2} title="Deployment Strategy" sub="How will your investible capital be split between new bets and follow-on rounds?" />

      <FieldWrap
        label="Average Initial Check"
        hint="Typical first investment per startup"
        insight={res.nStarts > 0 ? `${res.nStarts} initial investments from ${fM(res.initCap)}` : "Adjust check size"}
      >
        <NumIn value={inp.avgCheck} onChange={set("avgCheck")} prefix="$" suffix="M" min={0.1} max={20} step={0.25} />
      </FieldWrap>

      <FieldWrap
        label="Follow-on Reserve"
        hint="Percentage of net capital held back for follow-on rounds"
        insight={`${fM(res.resCap)} reserved — funds ${res.nFO} follow-on round${res.nFO !== 1 ? "s" : ""}`}
      >
        <RangeRow
          value={inp.followOnReserve}
          onChange={set("followOnReserve")}
          min={0} max={70} step={5}
          display={`${inp.followOnReserve}%`}
        />
      </FieldWrap>

      <FieldWrap
        label="Average Follow-on Check"
        hint="Typical check size when you double down on winners"
      >
        <NumIn value={inp.avgFollowOnCheck} onChange={set("avgFollowOnCheck")} prefix="$" suffix="M" min={0.1} max={20} step={0.25} />
      </FieldWrap>

      <InsightBox>
        📊 You back <strong>{res.nStarts} startups</strong> ({fM(inp.avgCheck)} each) and can follow-on in <strong>{res.nFO}</strong> of them ({fM(inp.avgFollowOnCheck)} each). Total capital deployed: <strong>{fM(res.net)}</strong>.
      </InsightBox>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Btn onClick={onBack} ghost>← Back</Btn>
        <Btn onClick={onNext} disabled={res.nStarts === 0}>Continue →</Btn>
      </div>
    </div>
  );
}

// ── Step 3: Portfolio Outcomes ────────────────────────────────────────────────
function Step3({ inp, set, res, onNext, onBack }) {
  const maxSucc = Math.max(1, res.nStarts);
  const clampedSucc = Math.min(inp.numSuccessful, maxSucc);
  const successRate = maxSucc > 0 ? (clampedSucc / maxSucc * 100) : 0;
  const dilution = inp.entryOwnership > 0
    ? (1 - inp.exitOwnership / inp.entryOwnership) * 100
    : 0;

  return (
    <div className="step-enter">
      <StepHeading
        stepNum={3}
        title="Your Bets"
        sub={`You're backing ${res.nStarts} startups. Now model how they perform at exit.`}
      />

      <FieldWrap
        label={`Successful Exits  (out of ${res.nStarts})`}
        hint="Startups that return at least their invested capital"
        insight={`${fP(successRate)} success rate`}
      >
        <RangeRow
          value={clampedSucc}
          onChange={v => set("numSuccessful")(Math.min(v, maxSucc))}
          min={1} max={maxSucc} step={1}
          display={`${clampedSucc}`}
        />
      </FieldWrap>

      <FieldWrap
        label="Average Exit Valuation"
        hint="Expected enterprise value at exit for each successful startup"
        insight={`Gross proceeds: ${fM(res.gross)} across ${clampedSucc} exit${clampedSucc !== 1 ? "s" : ""}`}
      >
        <NumIn value={inp.avgExitValuation} onChange={set("avgExitValuation")} prefix="$" suffix="M" min={10} max={5000} step={25} />
      </FieldWrap>

      <TwoCol>
        <FieldWrap label="Entry Ownership" hint="Your stake at initial investment">
          <NumIn value={inp.entryOwnership} onChange={set("entryOwnership")} suffix="%" min={0.5} max={50} step={0.5} />
        </FieldWrap>
        <FieldWrap
          label="Exit Ownership"
          hint="Your stake at exit after all dilution"
          insight={dilution > 0 ? `${fP(dilution)} diluted from entry` : undefined}
        >
          <NumIn
            value={inp.exitOwnership}
            onChange={v => set("exitOwnership")(Math.min(v, inp.entryOwnership))}
            suffix="%" min={0.5} max={inp.entryOwnership} step={0.5}
          />
        </FieldWrap>
      </TwoCol>

      <FieldWrap
        label="Average Years to Exit"
        hint="Used alongside Net MOIC to derive the fund's IRR"
      >
        <NumIn value={inp.avgYearsToExit} onChange={set("avgYearsToExit")} suffix="years" min={1} max={15} step={1} />
      </FieldWrap>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Btn onClick={onBack} ghost>← Back</Btn>
        <Btn onClick={onNext}>See Results →</Btn>
      </div>
    </div>
  );
}

// ── Custom Chart Tooltip ──────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f1527", border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "10px 14px",
    }}>
      <p style={{ fontFamily: C.fontBody, fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</p>
      <p style={{ fontFamily: C.fontMono, fontSize: 14, color: C.text }}>{fM(payload[0]?.value)}</p>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, gold }) {
  return (
    <div style={{
      background: C.elevated,
      border: `1.5px solid ${gold ? "rgba(212,146,42,0.5)" : C.border}`,
      borderRadius: 12, padding: "18px 20px",
      boxShadow: gold ? "0 0 24px rgba(212,146,42,0.1)" : "none",
    }}>
      <Label small>{label}</Label>
      <p style={{
        fontFamily: C.fontMono, fontSize: gold ? 26 : 20,
        fontWeight: 500, color: gold ? C.gold : C.text,
      }}>{value}</p>
      {sub && <p style={{ fontFamily: C.fontBody, fontSize: 11, color: C.faint, marginTop: 5 }}>{sub}</p>}
    </div>
  );
}

// ── Results Dashboard ─────────────────────────────────────────────────────────
function Results({ inp, set, res, onRestart }) {
  const maxSucc = Math.max(1, res.nStarts);
  const v = verdict(res.netMoic);

  const chartData = [
    { name: "LP Capital\nReturned", value: res.lpCap,    color: "#3b82f6" },
    { name: "LP Profit",            value: res.lpProfit, color: "#10b981" },
    { name: "GP Carry",             value: res.gpCarry,  color: C.gold    },
  ];

  const sliders = [
    { label: "Fund Size",           key: "fundSize",         min: 10,   max: 1000, step: 10,  fmt: v => `$${v}M`  },
    { label: "Mgmt Fee / yr",       key: "mgmtFee",          min: 0.5,  max: 4,    step: 0.25,fmt: v => `${v}%`   },
    { label: "Successful Exits",    key: "numSuccessful",    min: 1,    max: maxSucc, step: 1,fmt: v => `${Math.min(v, maxSucc)}`  },
    { label: "Avg Exit Valuation",  key: "avgExitValuation", min: 50,   max: 3000, step: 50,  fmt: v => `$${v}M`  },
    { label: "Exit Ownership",      key: "exitOwnership",    min: 0.5,  max: 20,   step: 0.5, fmt: v => `${v}%`   },
    { label: "Years to Exit",       key: "avgYearsToExit",   min: 1,    max: 15,   step: 1,   fmt: v => `${v} yrs`},
  ];

  return (
    <div className="step-enter">
      {/* Hero */}
      <div style={{ marginBottom: 36 }}>
        <p style={{ fontFamily: C.fontMono, fontSize: 11, color: C.gold, letterSpacing: "0.2em", marginBottom: 14 }}>
          FUND PERFORMANCE SUMMARY
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <p style={{ fontFamily: C.fontBody, fontSize: 13, color: C.muted, marginBottom: 6 }}>
              Net MOIC to LPs
            </p>
            <p style={{
              fontFamily: C.fontDisplay, fontSize: 64, fontWeight: 700,
              color: C.text, lineHeight: 1, letterSpacing: "-0.01em",
            }}>
              {fX(res.netMoic)}
            </p>
          </div>
          <div style={{ paddingBottom: 10 }}>
            <span style={{
              fontFamily: C.fontBody, fontSize: 13, fontWeight: 600,
              color: v.color,
              background: v.glow,
              border: `1px solid ${v.color}55`,
              borderRadius: 20, padding: "7px 16px",
            }}>{v.label}</span>
          </div>
        </div>
        <p style={{ fontFamily: C.fontBody, fontSize: 14, color: C.muted }}>
          On a <strong style={{ color: C.text }}>{fM(inp.fundSize)}</strong> fund with <strong style={{ color: C.text }}>{fN(res.succ)}</strong> exits at an average of <strong style={{ color: C.text }}>{fM(inp.avgExitValuation)}</strong> each.
        </p>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24 }}>
        <Kpi label="IRR"        value={fP(res.irr)}       sub={`Over ${inp.avgYearsToExit} years`} gold />
        <Kpi label="Gross MOIC" value={fX(res.grossMoic)} sub="Before carry & fees" />
        <Kpi label="DPI"        value={fX(res.dpi)}        sub="Distributed to paid-in" />
        <Kpi label="TVPI"       value={fX(res.tvpi)}       sub="Total value / paid-in" />
        <Kpi label="GP Carry"   value={fM(res.gpCarry)}    sub={`At ${inp.carry}% carry`} />
        <Kpi label="LP Return"  value={fM(res.totalLp)}    sub="Net to limited partners" />
      </div>

      {/* Portfolio Construction */}
      <div style={{
        background: C.elevated, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: "20px 24px", marginBottom: 24,
      }}>
        <Label>Portfolio Construction</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 8 }}>
          {[
            ["Total Startups",    res.nStarts],
            ["Follow-ons Available", res.nFO],
            ["Successful Exits",  fN(res.succ)],
            ["Success Rate",      fP(res.nStarts > 0 ? res.succ / res.nStarts * 100 : 0)],
          ].map(([lbl, val]) => (
            <div key={lbl}>
              <p style={{ fontFamily: C.fontBody, fontSize: 11, color: C.faint, marginBottom: 5 }}>{lbl}</p>
              <p style={{ fontFamily: C.fontMono, fontSize: 19, color: C.text }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fee Summary */}
      <div style={{
        background: C.elevated, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: "20px 24px", marginBottom: 24,
      }}>
        <Label>Capital Overview</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 8 }}>
          {[
            ["Fund Size",         fM(inp.fundSize)],
            ["Total Mgmt Fees",   fM(res.fees)],
            ["Net Investible",    fM(res.net)],
            ["Gross Exit Value",  fM(res.gross)],
          ].map(([lbl, val]) => (
            <div key={lbl}>
              <p style={{ fontFamily: C.fontBody, fontSize: 11, color: C.faint, marginBottom: 5 }}>{lbl}</p>
              <p style={{ fontFamily: C.fontMono, fontSize: 19, color: C.text }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{
        background: C.elevated, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: "22px 24px", marginBottom: 40,
      }}>
        <Label>Fund Distribution Waterfall</Label>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={56} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: C.muted, fontFamily: C.fontBody, fontSize: 12 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fill: C.muted, fontFamily: C.fontMono, fontSize: 10 }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `$${v}M`}
            />
            <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Adjust Assumptions ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 40, marginBottom: 16 }}>
        <p style={{
          fontFamily: C.fontDisplay, fontSize: 26, fontWeight: 700,
          color: C.text, marginBottom: 8,
        }}>Adjust Assumptions</p>
        <p style={{ fontFamily: C.fontBody, fontSize: 14, color: C.muted, marginBottom: 36, lineHeight: 1.6 }}>
          Drag any slider to see the results update live.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 32px" }}>
          {sliders.map(({ label, key, min, max, step: st, fmt }) => {
            const val = key === "numSuccessful" ? Math.min(inp[key], maxSucc) : inp[key];
            return (
              <div key={key} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <p style={{ fontFamily: C.fontBody, fontSize: 13, color: C.muted }}>{label}</p>
                  <p style={{ fontFamily: C.fontMono, fontSize: 13, color: C.gold }}>{fmt(val)}</p>
                </div>
                <input
                  type="range"
                  min={min}
                  max={key === "numSuccessful" ? maxSucc : max}
                  step={st}
                  value={val}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    set(key)(key === "numSuccessful" ? Math.min(v, maxSucc) : v);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Restart */}
      <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 60px" }}>
        <Btn onClick={onRestart} ghost>← Start Over</Btn>
      </div>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  const labels = ["Fund Setup", "Deployment", "Your Bets"];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 52 }}>
      {labels.map((label, i) => (
        <div key={i} style={{ flex: 1 }}>
          <div style={{
            height: 3, borderRadius: 2, marginBottom: 7,
            background: i + 1 <= step ? C.gold : C.border,
            transition: "background 0.4s ease",
          }} />
          <span style={{
            fontFamily: C.fontBody, fontSize: 11,
            color: i + 1 <= step ? C.gold : C.faint,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Default Inputs ────────────────────────────────────────────────────────────
const DEFAULTS = {
  fundSize: 100, mgmtFee: 2, fundLife: 10, carry: 20,
  avgCheck: 1.5, followOnReserve: 50, avgFollowOnCheck: 1.0,
  numSuccessful: 5, avgExitValuation: 400,
  entryOwnership: 10, exitOwnership: 7, avgYearsToExit: 7,
};

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(1);
  const [inp, setInp] = useState(DEFAULTS);

  const set = key => val => setInp(prev => ({ ...prev, [key]: val }));
  const res = useMemo(() => calc(inp), [inp]);
  const maxSucc = Math.max(1, res.nStarts);

  const restart = () => { setStep(1); setInp(DEFAULTS); };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.fontBody }}>
      <style>{GLOBAL_CSS}</style>

      {/* Header */}
      <div style={{
        padding: "18px 32px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 14,
        background: C.surface,
      }}>
        <span style={{
          fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700, color: C.gold,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>◆</span> VC Architect
        </span>
        <span style={{ marginLeft: "auto", fontFamily: C.fontMono, fontSize: 10, color: C.faint, letterSpacing: "0.15em" }}>
          FUND MODELING TOOL
        </span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "52px 28px" }}>
        {step < 4 && <ProgressBar step={step} />}

        {step === 1 && (
          <Step1 inp={inp} set={set} res={res} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <Step2 inp={inp} set={set} res={res} onNext={() => setStep(3)} onBack={() => setStep(1)} />
        )}
        {step === 3 && (
          <Step3 inp={inp} set={set} res={res} onNext={() => setStep(4)} onBack={() => setStep(2)} />
        )}
        {step === 4 && (
          <Results inp={inp} set={set} res={res} maxSucc={maxSucc} onRestart={restart} />
        )}
      </div>
    </div>
  );
}