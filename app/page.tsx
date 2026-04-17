"use client";

import React, { useMemo, useState } from "react";

function toNum(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmt(n: number, digits = 2) {
  return n.toFixed(digits);
}

function poissonP(lambda: number, k: number) {
  if (!Number.isFinite(lambda) || lambda < 0) return 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
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
  bttsOdds: number | null
) {
  if (homeOdds <= 1 || drawOdds <= 1 || awayOdds <= 1 || zeroZeroOdds <= 1) {
    return null;
  }

  const targets = normalizeThreeWay(homeOdds, drawOdds, awayOdds);

  // P(0-0) = exp(-(lh + la)) so total lambda = ln(odds_0_0)
  const totalLambda = Math.log(zeroZeroOdds);
  if (!Number.isFinite(totalLambda) || totalLambda <= 0) return null;

  let best = { lh: totalLambda / 2, la: totalLambda / 2, err: Infinity };

  for (let share = 0.02; share <= 0.98; share += 0.001) {
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

    let err =
      Math.pow(pHome - targets.pHome, 2) +
      Math.pow(pDraw - targets.pDraw, 2) +
      Math.pow(pAway - targets.pAway, 2);

    if (bttsOdds !== null) {
      const targetBTTS = 1 / bttsOdds;
      const modelBTTS = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
      err += Math.pow(modelBTTS - targetBTTS, 2);
    }

    if (err < best.err) {
      best = { lh, la, err };
    }
  }

  return best;
}

export default function Page() {
  const [home, setHome] = useState("");
  const [draw, setDraw] = useState("");
  const [away, setAway] = useState("");
  const [zeroZero, setZeroZero] = useState("");
  const [btts, setBtts] = useState("");

  const result = useMemo(() => {
    const h = toNum(home);
    const d = toNum(draw);
    const a = toNum(away);
    const z = toNum(zeroZero);
    const b = toNum(btts);

    if (!h || !d || !a || !z) return null;

    const fit = fitFirstGoalModel(h, d, a, z, b);
    if (!fit) return null;

    const total = fit.lh + fit.la;
    if (total <= 0) return null;

    const noGoal = Math.exp(-total);
    const homeFirst = (fit.lh / total) * (1 - noGoal);
    const awayFirst = (fit.la / total) * (1 - noGoal);
    const modelBTTS = (1 - Math.exp(-fit.lh)) * (1 - Math.exp(-fit.la));

    return {
      homeXG: fit.lh,
      awayXG: fit.la,
      noGoalProb: noGoal,
      homeFirstProb: homeFirst,
      awayFirstProb: awayFirst,
      homeFirstOdds: 1 / homeFirst,
      awayFirstOdds: 1 / awayFirst,
      noGoalOdds: 1 / noGoal,
      modelBTTS,
    };
  }, [home, draw, away, zeroZero, btts]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Arial, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#1e293b",
          padding: 28,
          borderRadius: 12,
          width: 420,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 28 }}>
          Team to Score First
        </h1>
        <p style={{ color: "#cbd5e1", marginTop: 0, marginBottom: 20 }}>
          Uses W/D/W + 0-0, with optional BTTS refinement.
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            placeholder="Home odds"
            value={home}
            onChange={(e) => setHome(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #475569" }}
          />
          <input
            placeholder="Draw odds"
            value={draw}
            onChange={(e) => setDraw(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #475569" }}
          />
          <input
            placeholder="Away odds"
            value={away}
            onChange={(e) => setAway(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #475569" }}
          />
          <input
            placeholder="0-0 odds"
            value={zeroZero}
            onChange={(e) => setZeroZero(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #475569" }}
          />
          <input
            placeholder="BTTS Yes odds (optional)"
            value={btts}
            onChange={(e) => setBtts(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #475569" }}
          />
        </div>

        {result && (
          <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
            <div>Home xG: {fmt(result.homeXG, 3)}</div>
            <div>Away xG: {fmt(result.awayXG, 3)}</div>
            <div>No goal: {fmt(result.noGoalProb * 100)}% ({fmt(result.noGoalOdds)})</div>
            <div>Home scores first: {fmt(result.homeFirstProb * 100)}% ({fmt(result.homeFirstOdds)})</div>
            <div>Away scores first: {fmt(result.awayFirstProb * 100)}% ({fmt(result.awayFirstOdds)})</div>
            <div>Model BTTS: {fmt(result.modelBTTS * 100)}%</div>
          </div>
        )}
      </div>
    </div>
  );
}
