/* Demo data for testing (admins only: Settings → Demo data). The same invented sessions, laps,
   races and community as the phone apps' Demo.kt / Demo.swift. It only lives in this browser:
   nothing is uploaded, and a DEMO banner shows on every screen while it is on. */
(function () {
  const COMBOS = [
    { track: "Spa-Francorchamps", cfg: "Grand Prix Pits", trackId: 163, car: "Porsche 911 GT3 R (992)", carId: 169, len: 7004, lap: 137.8 },
    { track: "Watkins Glen International", cfg: "Boot", trackId: 434, car: "Mazda MX-5 Cup", carId: 67, len: 5435, lap: 126.4 },
    { track: "Okayama International Circuit", cfg: "Full Course", trackId: 166, car: "Toyota GR86", carId: 160, len: 3703, lap: 92.1 },
    { track: "Road Atlanta", cfg: "Full Course", trackId: 127, car: "BMW M4 GT3", carId: 132, len: 4088, lap: 85.6 },
    { track: "Laguna Seca", cfg: "Full Course", trackId: 47, car: "Mazda MX-5 Cup", carId: 67, len: 3602, lap: 95.3 },
  ];
  const NAMES = "ABCDEFGHIJ".split("").map((c) => "Demo Driver " + c);
  const DAY = 86400000, NOW = Date.now();

  // a repeatable random sequence, so the demo looks the same every time
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return { f: (a, b) => a + (b - a) * next(), i: (a, b) => Math.floor(a + (b - a) * next()) };
  }
  const hash = (str) => { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff; return h; };

  // a lap trace: a speed profile with braking zones; rows of speed m/s, throttle, brake, gear, steering, lap time
  function trace(c, lapTime, seed) {
    const r = rng(seed), bin = 10, n = Math.floor(c.len / bin);
    const corners = Array.from({ length: 9 }, (_, k) => (k + 0.5 + r.f(-0.2, 0.2)) / 9);
    const raw = [];
    for (let i = 0; i < n; i++) {
      const x = i / n;
      let v = 72;
      for (const k of corners) { const d = x - k; v -= 38 * Math.exp(-(d * d) / 0.0009); }
      raw.push(Math.max(18, v + Math.sin(x * 2 * Math.PI * 3) * 3 + r.f(-0.6, 0.6)));
    }
    const f = raw.reduce((a, v) => a + bin / v, 0) / lapTime;
    let t = 0;
    const d = raw.map((rv, i) => {
      const v = rv * f;
      t += bin / v;
      const next = raw[Math.min(n - 1, i + 3)] * f, braking = next < v - 1.5;
      return [v, braking ? 0 : Math.min(1, 0.55 + v / 80), braking ? Math.min(1, (v - next) / 8) : 0, Math.min(6, Math.floor(1 + v / 14)), Math.cos(i * 0.05) * 0.1, t];
    });
    return { bin, d };
  }
  function sectors(lap, r) {
    const a = [0.31, 0.37, 0.32].map((x) => x * lap + r.f(-0.15, 0.15)), s = a.reduce((p, x) => p + x, 0);
    return a.map((x) => (x * lap) / s);
  }

  function sessions() {
    const out = [];
    COMBOS.forEach((c, i) => {
      out.push({ id: `demo:${i}:p`, started: NOW - (i * 2 + 1) * DAY, track: c.track, track_config: c.cfg, car: c.car, kind: "Practice", laps: 9, best: c.lap + 0.4 + i * 0.05, game: "iracing", driver: "You" });
      out.push({ id: `demo:${i}:r`, started: NOW - i * 2 * DAY - 3600000, track: c.track, track_config: c.cfg, car: c.car, kind: "Race", laps: 14, best: c.lap + 0.2, game: "iracing", driver: "You" });
    });
    return out.sort((a, b) => b.started - a.started);
  }
  const comboOf = (id) => COMBOS[+String(id).split(":")[1] || 0];
  function laps(sid) {
    const s = sessions().find((x) => x.id === sid);
    if (!s) return [];
    const r = rng(hash(sid)), out = [];
    for (let n = 1; n <= s.laps; n++) {
      const time = n === 3 ? s.best : s.best + r.f(0.1, 1.6) + (n === 1 ? 4 : 0);
      out.push({ id: `${sid}:${n}`, n, time, valid: n === 6 ? 0 : 1, fuel: null, vmax: null, sectors: sectors(time, r) });
    }
    return out;
  }
  function board(trackId, carId) {
    const i = COMBOS.findIndex((c) => c.trackId === +trackId && c.carId === +carId);
    if (i < 0) return [];
    const c = COMBOS[i], r = rng(i * 31 + 7);
    return NAMES.map((n, k) => {
      const time = c.lap - 0.7 + k * r.f(0.08, 0.35);
      return { id: `comm:${i}:${k}`, alias: n, time, created: NOW - k * DAY, hasTrace: true, sectors: sectors(time, r), car: c.car, track: c.track };
    }).sort((a, b) => a.time - b.time);
  }
  function races() {
    let ir = 2150;
    const out = [];
    for (let k = 0; k < 8; k++) {
      const c = COMBOS[k % COMBOS.length], r = rng(k * 101 + 1);
      const field = 16 + r.i(0, 8), start = 1 + r.i(0, field), finish = Math.max(1, Math.min(field, start + r.i(-5, 5)));
      const change = Math.trunc((Math.trunc(field / 2) - finish) * 6.5) + r.i(-8, 8), inc = r.i(0, 9), best = c.lap + 0.3 + r.f(0, 0.8);
      const lapsArr = Array.from({ length: 15 }, (_, j) => {
        const n = j + 1;
        return { n, t: best + r.f(0, 1.5) + (n === 1 ? 5 : 0), p: Math.max(1, start + Math.trunc(((finish - start) * n) / 15)), i: n === 4 ? Math.min(inc, 4) : 0, pit: n === 9 };
      });
      const results = Array.from({ length: field }, (_, j) => {
        const p = j + 1;
        return p === finish ? { pos: p, cpos: p, name: "You", ir, best, inc, laps: 15 } : { pos: p, cpos: p, name: NAMES[(p + k) % NAMES.length], ir: 1500 + r.i(0, 1600), best: best + r.f(-0.8, 1.2), inc: r.i(0, 10), laps: 15 };
      });
      out.push({ id: "demo-race-" + k, when: NOW - k * DAY - 7200000, track: c.track, trackId: c.trackId, car: c.car, carId: c.carId, official: true, start, finish, field, inc, best, fieldBest: best - 0.4, avg: best + 0.7, consistency: 0.42, pits: 1, fuelUsed: 38.5, ir, irChange: change, sof: 1800 + r.i(0, 900), laps: lapsArr, results });
      ir -= change;
    }
    return out;
  }
  function reports() {
    const out = [];
    COMBOS.forEach((c, i) => { for (let k = 0; k < 2; k++) out.push({ id: `rep${i}${k}`, alias: NAMES[(i + k) % NAMES.length], track: c.track, car: c.car, created: NOW - (i + k) * DAY, finish: 3 + k * 4, field: 18 + i, best: c.lap + 0.3 + k * 0.2 }); });
    return out;
  }
  function setups() {
    return COMBOS.map((c, i) => ({ id: "set" + i, alias: NAMES[i], carPath: c.car.toLowerCase().replace(/[^a-z0-9]+/g, ""), car: c.car, track: c.track, name: c.track.split(" ")[0] + " race", notes: "Stable on entry, a click less rear wing for the long straight.", size: 4200, downloads: 12 + i * 9, created: NOW - i * 3 * DAY }));
  }

  /** The demo answer for a GET of the Pitlane HQ API, or undefined when the demo has none. */
  function get(path) {
    const u = new URL(path, "https://x"), p = u.pathname, q = u.searchParams;
    if (p === "/api/sessions") return sessions();
    let m = p.match(/^\/api\/sessions\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]), s = sessions().find((x) => x.id === id);
      if (!s) return undefined;
      const ls = laps(id);
      return { session: s, laps: q.get("traces") === "1" ? ls.map((l) => ({ ...l, trace: trace(comboOf(l.id), l.time, hash(l.id)) })) : ls };
    }
    m = p.match(/^\/api\/laps\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]), sid = id.slice(0, id.lastIndexOf(":")), l = laps(sid).find((x) => x.id === id), s = sessions().find((x) => x.id === sid);
      return l && s ? { ...l, session_id: sid, track: s.track, car: s.car, started: s.started, trace: trace(comboOf(id), l.time, hash(id)) } : undefined;
    }
    if (p === "/api/bests") return COMBOS.map((c, i) => ({ game: "iracing", track: c.track, track_config: c.cfg, car: c.car, who: "you", driver: "You", best: c.lap + 0.2, laps: 23, last: NOW - i * 2 * DAY, bestLapId: `demo:${i}:r:3`, bestSessionId: `demo:${i}:r` }));
    if (p === "/api/races") return { races: races() };
    if (p === "/api/community/combos") return { combos: COMBOS.map((c) => ({ trackId: c.trackId, track: c.track, carId: c.carId, car: c.car, laps: 40 + (c.carId % 30), best: c.lap - 0.7 })) };
    if (p === "/api/community/laps") {
      const id = q.get("id");
      if (id) {
        const i = +id.split(":")[1], c = COMBOS[i], l = c && board(c.trackId, c.carId).find((x) => x.id === id);
        return l ? { ...l, game: "iracing", carId: c.carId, trackId: c.trackId, trace: trace(c, l.time, hash(id)) } : undefined;
      }
      return { laps: board(q.get("trackId"), q.get("carId")) };
    }
    if (p === "/api/community/reports") return q.get("id") ? undefined : { reports: reports() };
    if (p === "/api/community/setups") return { setups: setups() };
    return undefined;
  }

  window.PITLANE_DEMO = { get, live: (tick) => { const c = COMBOS[0], tr = trace(c, c.lap, 1), row = tr.d[tick % tr.d.length]; return { Speed: row[0], Throttle: row[1], Brake: row[2], Gear: row[3], LapCurrentLapTime: row[5] }; } };
})();
