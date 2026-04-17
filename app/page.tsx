"use client";

import React, { useMemo, useState } from "react";

function toNum(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmt(n: number, digits = 2) {
  return n.toFixed(digits);
}

function impliedProb(decimalOdds: number) {
  return 1 / decimalOdds;
}

function fairFromProbs(probs: number[]) {
  const total = probs.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return 1 / total;
}

function poissonP(lambda: number, k: number) {
  if (!Number.isFinite(lambda) || lambda < 0) return 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
}

function bttsFirstHalf(home1H: number, away1H: number) {
  return (1 - Math.exp(-home1H)) * (1 - Math.exp(-away1H));
}

function totalGoalsProbOver(lambda: number, line: 0.5 | 1.5 | 2.5 | 3.5) {
  if (line === 0.5) return 1 - poissonP(lambda, 0);
  if (line === 1.5) return 1 - (poissonP(lambda, 0) + poissonP(lambda, 1));
  if (line === 2.5) return 1 - (poissonP(lambda, 0) + poissonP(lambda, 1) + poissonP(lambda, 2));
  return 1 - (poissonP(lambda, 0) + poissonP(lambda, 1) + poissonP(lambda, 2) + poissonP(lambda, 3));
}

function inferTotalLambdaFromOvers(p05: number | null, p15: number | null, p25: number | null) {
  let best = { lambda: 1.2, err: Infinity };
  for (let lambda = 0.05; lambda <= 4.5; lambda += 0.001) {
    let err = 0;
    if (p05 !== null) err += Math.pow(totalGoalsProbOver(lambda, 0.5) - p05, 2);
    if (p15 !== null) err += Math.pow(totalGoalsProbOver(lambda, 1.5) - p15, 2);
    if (p25 !== null) err += Math.pow(totalGoalsProbOver(lambda, 2.5) - p25, 2);
    if (err < best.err) best = { lambda, err };
  }
  return best.lambda;
}

function inferHomeShareFromHT1X2(totalLambda: number, homeProb: number | null, drawProb: number | null, awayProb: number | null) {
  let best = { share: 0.5, err: Infinity };
  for (let share = 0.05; share <= 0.95; share += 0.001) {
    const lh = totalLambda * share;
    const la = totalLambda * (1 - share);

    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;

    for (let h = 0; h <= 10; h++) {
      for (let a = 0; a <= 10; a++) {
        const p = poissonP(lh, h) * poissonP(la, a);
        if (h > a) pHome += p;
        else if (h === a) pDraw += p;
        else pAway += p;
      }
    }

    let err = 0;
    if (homeProb !== null) err += Math.pow(pHome - homeProb, 2);
    if (drawProb !== null) err += Math.pow(pDraw - drawProb, 2);
    if (awayProb !== null) err += Math.pow(pAway - awayProb, 2);
    if (err < best.err) best = { share, err };
  }
  return best.share;
}

function normalizeThreeWay(homeOdds: number, drawOdds: number, awayOdds: number) {
  const pH = 1 / homeOdds;
  const pD = 1 / drawOdds;
  const pA = 1 / awayOdds;
  const sum = pH + pD + pA;
  return {
    pHome: pH / sum,
    pDraw: pD / sum,
    pAway: pA / sum,
  };
}

function fitFirstGoalModel(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number,
  zeroZeroOdds: number,
  bttsOdds: number | null,
  over25Odds: number | null,
  over35Odds: number | null
) {
  if (homeOdds <= 1 || drawOdds <= 1 || awayOdds <= 1 || zeroZeroOdds <= 1) return null;

  const targets = normalizeThreeWay(homeOdds, drawOdds, awayOdds);
  const totalLambda = Math.log(zeroZeroOdds);
  if (!Number.isFinite(totalLambda) || totalLambda <= 0) return null;

  let best = { lh: totalLambda / 2, la: totalLambda / 2, err: Infinity };

  for (let share = 0.02; share <= 0.98; share += 0.001) {
    const lh = totalLambda * share;
    const la = totalLambda * (1 - share);
    const total = lh + la;

    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;

    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const p = poissonP(lh, i) * poissonP(la, j);
        if (i > j) pHome += p;
        else if (i === j) pDraw += p;
        else pAway += p;
      }
    }

    let err =
      Math.pow(pHome - targets.pHome, 2) +
      Math.pow(pDraw - targets.pDraw, 2) +
      Math.pow(pAway - targets.pAway, 2);

    if (bttsOdds !== null) {
      const targetBTTS = 1 / bttsOdds;
      const modelBTTS = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
      err += Math.pow(modelBTTS - targetBTTS, 2);
    }
    if (over25Odds !== null) {
      const targetOver25 = 1 / over25Odds;
      const modelOver25 = totalGoalsProbOver(total, 2.5);
      err += Math.pow(modelOver25 - targetOver25, 2);
    }
    if (over35Odds !== null) {
      const targetOver35 = 1 / over35Odds;
      const modelOver35 = totalGoalsProbOver(total, 3.5);
      err += Math.pow(modelOver35 - targetOver35, 2);
    }

    if (err < best.err) best = { lh, la, err };
  }

  return best;
}

function fitScoreModel(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number,
  over25Odds: number,
  over35Odds: number | null,
  bttsOdds: number | null,
  score21Odds: number | null,
  score31Odds: number | null
) {
  if (homeOdds <= 1 || drawOdds <= 1 || awayOdds <= 1 || over25Odds <= 1) return null;

  const targets = normalizeThreeWay(homeOdds, drawOdds, awayOdds);
  const targetOver25 = 1 / over25Odds;

  let best = { lh: 1.5, la: 1.0, err: Infinity };

  for (let lh = 0.2; lh <= 4.5; lh += 0.01) {
    for (let la = 0.1; la <= 3.5; la += 0.01) {
      const total = lh + la;
      let pHome = 0;
      let pDraw = 0;
      let pAway = 0;

      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          const p = poissonP(lh, i) * poissonP(la, j);
          if (i > j) pHome += p;
          else if (i === j) pDraw += p;
          else pAway += p;
        }
      }

      let err =
        Math.pow(pHome - targets.pHome, 2) +
        Math.pow(pDraw - targets.pDraw, 2) +
        Math.pow(pAway - targets.pAway, 2) +
        Math.pow(totalGoalsProbOver(total, 2.5) - targetOver25, 2);

      if (over35Odds !== null) {
        const targetOver35 = 1 / over35Odds;
        err += Math.pow(totalGoalsProbOver(total, 3.5) - targetOver35, 2);
      }
      if (bttsOdds !== null) {
        const targetBTTS = 1 / bttsOdds;
        const modelBTTS = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
        err += Math.pow(modelBTTS - targetBTTS, 2);
      }
      if (score21Odds !== null) {
        const target21 = 1 / score21Odds;
        const model21 = poissonP(lh, 2) * poissonP(la, 1);
        err += Math.pow(model21 - target21, 2);
      }
      if (score31Odds !== null) {
        const target31 = 1 / score31Odds;
        const model31 = poissonP(lh, 3) * poissonP(la, 1);
        err += Math.pow(model31 - target31, 2);
      }

      if (err < best.err) best = { lh, la, err };
    }
  }

  return best;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
      <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20, color: "white" }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>{label}</label>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ padding: "10px 12px", border: "1px solid #475569", borderRadius: 8, fontSize: 14, background: "#0f172a", color: "white" }} />
    </div>
  );
}

function StatBox({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div style={{ borderRadius: 12, padding: 16, border: dark ? "none" : "1px solid #334155", background: dark ? "#020617" : "#0f172a", color: "white" }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default function Page() {
  const [tab, setTab] = useState<"combo" | "fhbtts" | "firstgoal" | "score41">("combo");

  const [selection1, setSelection1] = useState("9.9");
  const [selection2, setSelection2] = useState("17.75");
  const [selection3, setSelection3] = useState("40");

  const [ov05, setOv05] = useState("1.37");
  const [ov15, setOv15] = useState("2.67");
  const [ov25, setOv25] = useState("7.10");
  const [htHome, setHtHome] = useState("2.18");
  const [htDraw, setHtDraw] = useState("2.63");
  const [htAway, setHtAway] = useState("6.20");

  const [fgHomeOdds, setFgHomeOdds] = useState("4.45");
  const [fgDrawOdds, setFgDrawOdds] = useState("3.425");
  const [fgAwayOdds, setFgAwayOdds] = useState("2.07");
  const [fg00, setFg00] = useState("8.0");
  const [fgBTTS, setFgBTTS] = useState("");
  const [fgOver25, setFgOver25] = useState("");
  const [fgOver35, setFgOver35] = useState("");

  const [sHomeOdds, setSHomeOdds] = useState("1.865");
  const [sDrawOdds, setSDrawOdds] = useState("3.975");
  const [sAwayOdds, setSAwayOdds] = useState("4.75");
  const [sOver25, setSOver25] = useState("1.865");
  const [sOver35, setSOver35] = useState("3.225");
  const [sBTTS, setSBTTS] = useState("1.80");
  const [s21, setS21] = useState("9.9");
  const [s31, setS31] = useState("17.75");

  const combo = useMemo(() => {
    const odds = [toNum(selection1), toNum(selection2), toNum(selection3)].filter((x): x is number => x !== null);
    const probs = odds.map(impliedProb);
    const fair = fairFromProbs(probs);
    return { odds, probs, fair, totalProb: probs.reduce((a, b) => a + b, 0) };
  }, [selection1, selection2, selection3]);

  const firstHalf = useMemo(() => {
    const p05 = toNum(ov05) ? impliedProb(toNum(ov05)!) : null;
    const p15 = toNum(ov15) ? impliedProb(toNum(ov15)!) : null;
    const p25 = toNum(ov25) ? impliedProb(toNum(ov25)!) : null;
    const totalLambda = inferTotalLambdaFromOvers(p05, p15, p25);
    const homeProb = toNum(htHome) ? impliedProb(toNum(htHome)!) : null;
    const drawProb = toNum(htDraw) ? impliedProb(toNum(htDraw)!) : null;
    const awayProb = toNum(htAway) ? impliedProb(toNum(htAway)!) : null;
    const homeShare = inferHomeShareFromHT1X2(totalLambda, homeProb, drawProb, awayProb);
    const home1H = totalLambda * homeShare;
    const away1H = totalLambda * (1 - homeShare);
    const prob = bttsFirstHalf(home1H, away1H);
    return { totalLambda, home1H, away1H, prob, fair: prob > 0 ? 1 / prob : null };
  }, [ov05, ov15, ov25, htHome, htDraw, htAway]);

  const firstGoal = useMemo(() => {
    const homeOdds = toNum(fgHomeOdds);
    const drawOdds = toNum(fgDrawOdds);
    const awayOdds = toNum(fgAwayOdds);
    const zeroZeroOdds = toNum(fg00);
    const bttsOdds = toNum(fgBTTS);
    const over25Odds = toNum(fgOver25);
    const over35Odds = toNum(fgOver35);

    if (!homeOdds || !drawOdds || !awayOdds || !zeroZeroOdds) {
      return { ready: false, message: "Enter Home, Draw, Away and 0-0 mids to build the model." };
    }

    const fit = fitFirstGoalModel(homeOdds, drawOdds, awayOdds, zeroZeroOdds, bttsOdds, over25Odds, over35Odds);
    if (!fit || !Number.isFinite(fit.lh) || !Number.isFinite(fit.la)) {
      return { ready: false, message: "The inputs do not produce a stable fit. Check the odds and try again." };
    }

    const total = fit.lh + fit.la;
    const noGoalProb = Math.exp(-total);
    const homeFirstProb = (fit.lh / total) * (1 - noGoalProb);
    const awayFirstProb = (fit.la / total) * (1 - noGoalProb);
    const bttsProb = (1 - Math.exp(-fit.lh)) * (1 - Math.exp(-fit.la));

    return {
      ready: true,
      lh: fit.lh,
      la: fit.la,
      noGoalProb,
      homeFirstProb,
      awayFirstProb,
      fairHome: 1 / homeFirstProb,
      fairAway: 1 / awayFirstProb,
      fairNoGoal: 1 / noGoalProb,
      bttsProb,
    };
  }, [fgHomeOdds, fgDrawOdds, fgAwayOdds, fg00, fgBTTS, fgOver25, fgOver35]);

  const scoreSolver = useMemo(() => {
    const homeOdds = toNum(sHomeOdds);
    const drawOdds = toNum(sDrawOdds);
    const awayOdds = toNum(sAwayOdds);
    const over25Odds = toNum(sOver25);
    const over35Odds = toNum(sOver35);
    const bttsOdds = toNum(sBTTS);
    const score21Odds = toNum(s21);
    const score31Odds = toNum(s31);

    if (!homeOdds || !drawOdds || !awayOdds || !over25Odds) {
      return { ready: false, message: "Enter Home, Draw, Away and Over 2.5 to build the 4-1 solver." };
    }

    const fit = fitScoreModel(homeOdds, drawOdds, awayOdds, over25Odds, over35Odds, bttsOdds, score21Odds, score31Odds);
    if (!fit) return { ready: false, message: "The inputs do not produce a stable fit. Check the odds and try again." };

    const p21 = poissonP(fit.lh, 2) * poissonP(fit.la, 1);
    const p31 = poissonP(fit.lh, 3) * poissonP(fit.la, 1);
    const p41 = poissonP(fit.lh, 4) * poissonP(fit.la, 1);
    const comboProb = p21 + p31 + p41;

    return {
      ready: true,
      lh: fit.lh,
      la: fit.la,
      p21,
      p31,
      p41,
      fair41: p41 > 0 ? 1 / p41 : null,
      comboProb,
      fairCombo: comboProb > 0 ? 1 / comboProb : null,
    };
  }, [sHomeOdds, sDrawOdds, sAwayOdds, sOver25, sOver35, sBTTS, s21, s31]);

  const resetExample = () => {
    setSelection1("9.9");
    setSelection2("17.75");
    setSelection3("40");
    setOv05("1.37");
    setOv15("2.67");
    setOv25("7.10");
    setHtHome("2.18");
    setHtDraw("2.63");
    setHtAway("6.20");
    setFgHomeOdds("4.45");
    setFgDrawOdds("3.425");
    setFgAwayOdds("2.07");
    setFg00("8.0");
    setFgBTTS("");
    setFgOver25("");
    setFgOver35("");
    setSHomeOdds("1.865");
    setSDrawOdds("3.975");
    setSAwayOdds("4.75");
    setSOver25("1.865");
    setSOver35("3.225");
    setSBTTS("1.80");
    setS21("9.9");
    setS31("17.75");
  };

  const tabButton = (id: "combo" | "fhbtts" | "firstgoal" | "score41", label: string) => (
    <button onClick={() => setTab(id)} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #475569", background: tab === id ? "#e2e8f0" : "#1e293b", color: tab === id ? "#0f172a" : "white", cursor: "pointer", fontWeight: 600 }}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, color: "white" }}>Fair Odds Betting Calculator</h1>
            <p style={{ color: "#94a3b8", marginTop: 8 }}>Combo builder, first-half BTTS xG, team-to-score-first model, and 4-1 solver.</p>
          </div>
          <button onClick={resetExample} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #475569", background: "#1e293b", color: "white", cursor: "pointer" }}>Reset example</button>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {tabButton("combo", "Combo builder")}
          {tabButton("fhbtts", "1H BTTS xG model")}
          {tabButton("firstgoal", "Team to score first")}
          {tabButton("score41", "4-1 solver")}
        </div>

        {tab === "combo" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <Card title="Combined fair odds">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <Field label="Selection 1 odds" value={selection1} onChange={setSelection1} />
                <Field label="Selection 2 odds" value={selection2} onChange={setSelection2} />
                <Field label="Selection 3 odds" value={selection3} onChange={setSelection3} />
              </div>
              <p style={{ marginTop: 16, color: "#94a3b8" }}>Enter decimal odds for each selection. The app sums implied probabilities and converts back to a fair combined price.</p>
            </Card>
            <Card title="Results">
              <div style={{ display: "grid", gap: 10 }}>
                {combo.odds.map((odd, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", background: "#0f172a", padding: 12, borderRadius: 10, color: "white" }}>
                    <span>Selection {idx + 1}</span>
                    <span>Prob {fmt(combo.probs[idx] * 100)}%</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 20 }}>
                <StatBox label="Combined probability" value={`${fmt(combo.totalProb * 100)}%`} dark />
                <StatBox label="Fair odds" value={combo.fair ? fmt(combo.fair) : "-"} />
              </div>
            </Card>
          </div>
        )}

        {tab === "fhbtts" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <Card title="Inputs">
              <div style={{ marginBottom: 18, fontWeight: 600, color: "white" }}>First-half goal line mids</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <Field label="Over 0.5" value={ov05} onChange={setOv05} />
                <Field label="Over 1.5" value={ov15} onChange={setOv15} />
                <Field label="Over 2.5" value={ov25} onChange={setOv25} />
              </div>
              <div style={{ marginBottom: 18, fontWeight: 600, color: "white" }}>Half-time 1X2 mids</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <Field label="HT Home" value={htHome} onChange={setHtHome} />
                <Field label="HT Draw" value={htDraw} onChange={setHtDraw} />
                <Field label="HT Away" value={htAway} onChange={setHtAway} />
              </div>
            </Card>
            <Card title="Model output">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                <StatBox label="1H total xG" value={fmt(firstHalf.totalLambda, 3)} />
                <StatBox label="Home 1H xG" value={fmt(firstHalf.home1H, 3)} />
                <StatBox label="Away 1H xG" value={fmt(firstHalf.away1H, 3)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <StatBox label="BTTS first half probability" value={`${fmt(firstHalf.prob * 100)}%`} dark />
                <StatBox label="Fair odds" value={firstHalf.fair ? fmt(firstHalf.fair) : "-"} />
              </div>
            </Card>
          </div>
        )}

        {tab === "firstgoal" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <Card title="Inputs (mid prices)">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <Field label="Home" value={fgHomeOdds} onChange={setFgHomeOdds} />
                <Field label="Draw" value={fgDrawOdds} onChange={setFgDrawOdds} />
                <Field label="Away" value={fgAwayOdds} onChange={setFgAwayOdds} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <Field label="0-0" value={fg00} onChange={setFg00} />
                <Field label="BTTS Yes (optional)" value={fgBTTS} onChange={setFgBTTS} placeholder="Optional" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 12 }}>
                <Field label="Over 2.5 (optional)" value={fgOver25} onChange={setFgOver25} placeholder="Optional" />
                <Field label="Over 3.5 (optional)" value={fgOver35} onChange={setFgOver35} placeholder="Optional" />
              </div>
              <p style={{ marginTop: 16, color: "#94a3b8" }}>Uses W/D/W and 0-0 to fit home and away xG, then prices home first, away first, and no goal. BTTS, Over 2.5 and Over 3.5 are optional refinements.</p>
            </Card>
            <Card title="Model output">
              {!firstGoal.ready ? (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: 14, color: "#111827" }}>{firstGoal.message}</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                    <StatBox label="Home xG" value={fmt(firstGoal.lh, 3)} />
                    <StatBox label="Away xG" value={fmt(firstGoal.la, 3)} />
                    <StatBox label="No-goal probability" value={`${fmt(firstGoal.noGoalProb * 100)}%`} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                    <StatBox label="Home scores first" value={`${fmt(firstGoal.homeFirstProb * 100)}%`} dark />
                    <StatBox label="Away scores first" value={`${fmt(firstGoal.awayFirstProb * 100)}%`} dark />
                    <StatBox label="Model BTTS" value={`${fmt(firstGoal.bttsProb * 100)}%`} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    <StatBox label="Fair home first odds" value={fmt(firstGoal.fairHome)} />
                    <StatBox label="Fair away first odds" value={fmt(firstGoal.fairAway)} />
                    <StatBox label="Fair no-goal odds" value={fmt(firstGoal.fairNoGoal)} />
                  </div>
                </>
              )}
            </Card>
          </div>
        )}

        {tab === "score41" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <Card title="Inputs (mid prices)">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <Field label="Home" value={sHomeOdds} onChange={setSHomeOdds} />
                <Field label="Draw" value={sDrawOdds} onChange={setSDrawOdds} />
                <Field label="Away" value={sAwayOdds} onChange={setSAwayOdds} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <Field label="Over 2.5" value={sOver25} onChange={setSOver25} />
                <Field label="Over 3.5 (optional)" value={sOver35} onChange={setSOver35} placeholder="Optional" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
                <Field label="BTTS Yes (optional)" value={sBTTS} onChange={setSBTTS} placeholder="Optional" />
                <Field label="2-1 (optional)" value={s21} onChange={setS21} placeholder="Optional" />
                <Field label="3-1 (optional)" value={s31} onChange={setS31} placeholder="Optional" />
              </div>
              <p style={{ marginTop: 16, color: "#94a3b8" }}>Uses W/D/W and Over 2.5 to fit home and away xG. Over 3.5, BTTS, 2-1 and 3-1 are optional refinements. Outputs fair 4-1 and fair combo odds for 2-1, 3-1, 4-1.</p>
            </Card>
            <Card title="Model output">
              {!scoreSolver.ready ? (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: 14, color: "#111827" }}>{scoreSolver.message}</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                    <StatBox label="Home xG" value={fmt(scoreSolver.lh, 3)} />
                    <StatBox label="Away xG" value={fmt(scoreSolver.la, 3)} />
                    <StatBox label="4-1 probability" value={`${fmt(scoreSolver.p41 * 100)}%`} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                    <StatBox label="2-1 probability" value={`${fmt(scoreSolver.p21 * 100)}%`} />
                    <StatBox label="3-1 probability" value={`${fmt(scoreSolver.p31 * 100)}%`} />
                    <StatBox label="Combo probability" value={`${fmt(scoreSolver.comboProb * 100)}%`} dark />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    <StatBox label="Fair 4-1 odds" value={scoreSolver.fair41 ? fmt(scoreSolver.fair41) : "-"} />
                    <StatBox label="Fair combo odds" value={scoreSolver.fairCombo ? fmt(scoreSolver.fairCombo) : "-"} dark />
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
