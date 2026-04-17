"use client";

import React, { useMemo, useState } from "react";

export default function Page() {
  const [home, setHome] = useState("");
  const [draw, setDraw] = useState("");
  const [away, setAway] = useState("");
  const [zero, setZero] = useState("");

  const result = useMemo(() => {
    const h = Number(home);
    const d = Number(draw);
    const a = Number(away);
    const z = Number(zero);

    if (!h || !d || !a || !z) return null;

    const pH = 1 / h;
    const pD = 1 / d;
    const pA = 1 / a;
    const total = pH + pD + pA;

    const normH = pH / total;
    const normA = pA / total;

    const lambda = Math.log(z);

    const homeFirst = normH * (1 - Math.exp(-lambda));
    const awayFirst = normA * (1 - Math.exp(-lambda));

    return {
      homeFirst,
      awayFirst,
      homeOdds: 1 / homeFirst,
      awayOdds: 1 / awayFirst
    };
  }, [home, draw, away, zero]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Team to Score First Model</h1>

      <div style={{ display: "grid", gap: 10, maxWidth: 300 }}>
        <input placeholder="Home odds" value={home} onChange={e => setHome(e.target.value)} />
        <input placeholder="Draw odds" value={draw} onChange={e => setDraw(e.target.value)} />
        <input placeholder="Away odds" value={away} onChange={e => setAway(e.target.value)} />
        <input placeholder="0-0 odds" value={zero} onChange={e => setZero(e.target.value)} />
      </div>

      {result && (
        <div style={{ marginTop: 20 }}>
          <p>Home first: {(result.homeFirst * 100).toFixed(2)}% ({result.homeOdds.toFixed(2)})</p>
          <p>Away first: {(result.awayFirst * 100).toFixed(2)}% ({result.awayOdds.toFixed(2)})</p>
        </div>
      )}
    </div>
  );
}
