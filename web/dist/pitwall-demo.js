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
    { track: "Lime Rock Park", cfg: "Full Course", trackId: 54, car: "Ray Formula 1600", carId: 74, len: 2459, lap: 63.2, cat: "formula_car" },
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
    // the corners of a track are always in the same place: every lap of a combination shares them
    const rc = rng(hash(c.track)), corners = Array.from({ length: 9 }, (_, k) => (k + 0.5 + rc.f(-0.2, 0.2)) / 9);
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
    // the shape of the track, like the position Pitlane HQ records: a loop that turns at every corner
    const turns = corners.map((_, k) => (k % 3 === 2 ? -0.6 : 1) * rc.f(0.6, 1.3)), tot = turns.reduce((p, q) => p + q, 0);
    const x = [], y = []; let h = 0, px = 0, py = 0;
    for (let i = 0; i < n; i++) {
      const q = i / n; let dh = 0;
      corners.forEach((k, j) => { const dd = q - k; dh += turns[j] * 2 * Math.PI / tot * Math.exp(-(dd * dd) / 0.0006) / (Math.sqrt(Math.PI * 0.0006) * n); });
      h += dh; px += bin * Math.cos(h); py += bin * Math.sin(h); x.push(px); y.push(py);
    }
    const ex = x[n - 1] - x[0], ey = y[n - 1] - y[0];
    for (let i = 0; i < n; i++) { const f = i / (n - 1); x[i] = Math.round((x[i] - ex * f) * 10) / 10; y[i] = Math.round((y[i] - ey * f) * 10) / 10; }
    return { bin, d, x, y };
  }
  // a lap with incidents carries where they happened: [distance m, points]
  function withInc(tr, l, c) { return l && l.inc ? { ...tr, inc: [Math.round(c.len * 0.42), l.inc] } : tr; }
  function sectors(lap, r) {
    const a = [0.31, 0.37, 0.32].map((x) => x * lap + r.f(-0.15, 0.15)), s = a.reduce((p, x) => p + x, 0);
    return a.map((x) => (x * lap) / s);
  }

  function sessions() {
    const out = [];
    COMBOS.forEach((c, i) => {
      out.push({ id: `demo:${i}:p`, started: NOW - (i * 2 + 1) * DAY, track: c.track, track_config: c.cfg, car: c.car, kind: "Practice", laps: 9, cat: c.cat || "sports_car", best: c.lap + 0.4 + i * 0.05, game: "iracing", driver: "You" });
      out.push({ id: `demo:${i}:r`, started: NOW - i * 2 * DAY - 3600000, track: c.track, track_config: c.cfg, car: c.car, kind: "Race", laps: 14, cat: c.cat || "sports_car", best: c.lap + 0.2, game: "iracing", driver: "You" });
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
      out.push({ id: `${sid}:${n}`, n, time, valid: n === 6 ? 0 : 1, fuel: null, vmax: null, sectors: sectors(time, r), inc: n === 3 ? 2 : 0 });
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
      return { session: s, laps: q.get("traces") === "1" ? ls.map((l) => ({ ...l, trace: withInc(trace(comboOf(l.id), l.time, hash(l.id)), l, comboOf(l.id)) })) : ls };
    }
    m = p.match(/^\/api\/laps\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]), sid = id.slice(0, id.lastIndexOf(":")), l = laps(sid).find((x) => x.id === id), s = sessions().find((x) => x.id === sid);
      return l && s ? { ...l, session_id: sid, track: s.track, car: s.car, started: s.started, trace: withInc(trace(comboOf(id), l.time, hash(id)), l, comboOf(id)) } : undefined;
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

  // ---------- a live race to look at (Live, overlays): 10 invented drivers at Spa, the player is car 3 ----------
  const LIVE = (() => {
    const c = COMBOS[0], tr = trace(c, c.lap, 1), n = tr.d.length, bin = tr.bin, L = n * bin, N = 10, ME = 3;
    const pace = Array.from({ length: N }, (_, i) => c.lap * (1 + (i - 3) * 0.0035)), off = Array.from({ length: N }, (_, i) => -i * 0.012);
    const times = tr.d.map((r) => r[5]), lapT = times[n - 1];
    // where a car is after `f` of its lap (by time): the row whose lap time matches
    const rowAt = (f) => { const t = f * lapT; let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t) lo = m + 1; else hi = m; } return lo; };
    const yaml = () => {
      let y = `---\nWeekendInfo:\n TrackName: demospa\n TrackID: ${c.trackId}\n TrackLength: ${(c.len / 1000).toFixed(2)} km\n TrackDisplayName: ${c.track}\n TrackDisplayShortName: Spa\n TrackConfigName: ${c.cfg}\n TrackNumTurns: 19\n TrackSurfaceTemp: 27.80 C\n TrackAirTemp: 19.40 C\n SeriesID: 0\n SubSessionID: 0\n Official: 0\n EventType: Race\n Category: Road\n NumCarClasses: 1\nSessionInfo:\n CurrentSessionNum: 0\n Sessions:\n - SessionNum: 0\n   SessionLaps: 20\n   SessionTime: unlimited\n   SessionType: Race\n   SessionName: RACE\nDriverInfo:\n DriverCarIdx: ${ME}\n DriverCarIdleRPM: 1200.000\n DriverCarRedLine: 9200.000\n DriverCarFuelMaxLtr: 120.000\n DriverCarMaxFuelPct: 1.000\n DriverCarSLShiftRPM: 8800.000\n DriverCarEstLapTime: ${c.lap.toFixed(4)}\n DriverCarGearNumForward: 6\n Drivers:\n`;
      for (let i = 0; i < N; i++) y += ` - CarIdx: ${i}\n   UserName: ${NAMES[i]}\n   AbbrevName: ${NAMES[i]}\n   UserID: ${500000 + i}\n   CarNumber: "${10 + i}"\n   CarNumberRaw: ${10 + i}\n   CarClassID: 1\n   CarID: ${c.carId}\n   CarScreenName: ${c.car}\n   CarClassShortName: GT3\n   CarClassColor: 0xffda59\n   IRating: ${2600 - i * 90}\n   LicString: A ${(3.2 - i * 0.1).toFixed(2)}\n   IsSpectator: 0\n   CarIsPaceCar: 0\n   CurDriverIncidentCount: ${i % 4}\n`;
      return y + "...\n";
    };
    const frame = (t) => {
      const prog = pace.map((p, i) => t / p + 1 + off[i]), order = prog.map((_, i) => i).sort((a, b) => prog[b] - prog[a]), pos = []; order.forEach((ci, k) => (pos[ci] = k + 1));
      const lead = prog[order[0]], A = (f) => Array.from({ length: 64 }, (_, i) => (i < N ? f(i) : -1));
      const mp = prog[ME], lapN = Math.floor(mp), frac = mp - lapN, ri = rowAt(frac), r = tr.d[ri], nx = tr.d[Math.min(n - 1, ri + 1)];
      const sp = r[0], yaw = Math.atan2(tr.y[Math.min(n - 1, ri + 1)] - tr.y[ri], tr.x[Math.min(n - 1, ri + 1)] - tr.x[ri]);
      const gear = Math.max(1, Math.min(6, r[3])), rpm = Math.min(9100, 3500 + (sp % 15) / 15 * 5400), fuel = Math.max(4, 110 - (mp - 1) * 2.9);
      const T = {
        SessionTime: t, SessionState: 4, SessionNum: 0, SessionFlags: 0, SessionLapsTotal: 20, SessionLapsRemainEx: Math.max(0, 20 - lapN), SessionTimeRemain: 604800,
        PlayerCarIdx: ME, PlayerCarPosition: pos[ME], PlayerCarClassPosition: pos[ME], IsOnTrack: 1, OnPitRoad: 0, PlayerTrackSurface: 3, CarLeftRight: 1,
        Speed: sp, RPM: rpm, Gear: gear, Throttle: r[1], Brake: r[2], Clutch: 1, SteeringWheelAngle: r[4], LongAccel: (nx[0] - sp) * 3,
        Lap: lapN, LapCompleted: lapN - 1, LapDist: frac * L, LapDistPct: frac, LapCurrentLapTime: r[5] * pace[ME] / lapT,
        LapLastLapTime: lapN > 1 ? pace[ME] + 0.21 * Math.sin(lapN) : -1, LapBestLapTime: lapN > 1 ? pace[ME] - 0.15 : -1,
        LapDeltaToBestLap: 0.25 * Math.sin(frac * 6.283 + lapN), LapDeltaToBestLap_OK: lapN > 1, LapDeltaToSessionBestLap: 0.6 + 0.25 * Math.sin(frac * 6.283), LapDeltaToSessionBestLap_OK: lapN > 1,
        LapDeltaToOptimalLap: 0.4 * Math.sin(frac * 6.283), LapDeltaToOptimalLap_OK: lapN > 1,
        FuelLevel: fuel, FuelLevelPct: fuel / 120, FuelUsePerHour: 75, FuelUsePerLap: 2.9, WaterTemp: 88, OilTemp: 102, OilPress: 5.1, Voltage: 13.8, AirTemp: 19.4, TrackTempCrew: 27.8,
        dcBrakeBias: 54.5, dcTractionControl: 3, dcTractionControlMax: 12, dcABS: 4, dcABSMax: 12, dcEngineMap: 1, dcEngineMapMax: 8,
        dcAntiRollFront: 3, dcAntiRollRear: 4, dcFuelMixture: 2, dcDiffEntry: 5, dcDiffMiddle: 3, dcDiffExit: 6, dcPitSpeedLimiterToggle: 0,
        WindVel: 3.5, WindDir: 0.8, Skies: 1, RelativeHumidity: 0.62, SessionTimeOfDay: 52320 + (t % 60), SolarAltitude: 0.7,
        FrameRate: 118 + 6 * Math.sin(t / 3), GpuUsage: 0.71 + 0.05 * Math.sin(t / 5), CpuUsageFG: 0.34, ChanLatency: 0.041, ChanQuality: 0.98,
        Yaw: yaw, YawNorth: yaw, VelocityX: sp, VelocityY: 0, PlayerCarMyIncidentCount: 2, PlayerCarDriverIncidentCount: 2, Precipitation: 0, TrackWetness: 1, PlayerTireCompound: 0,
        CarIdxLap: A((i) => Math.floor(prog[i])), CarIdxLapCompleted: A((i) => Math.floor(prog[i]) - 1), CarIdxLapDistPct: A((i) => prog[i] % 1),
        CarIdxPosition: A((i) => pos[i]), CarIdxClassPosition: A((i) => pos[i]), CarIdxEstTime: A((i) => (prog[i] % 1) * pace[i]), CarIdxF2Time: A((i) => (lead - prog[i]) * pace[i]),
        CarIdxLastLapTime: A((i) => (prog[i] > 2 ? pace[i] : -1)), CarIdxBestLapTime: A((i) => (prog[i] > 2 ? pace[i] - 0.1 : -1)), CarIdxOnPitRoad: A(() => 0), CarIdxTrackSurface: A(() => 3), CarIdxTireCompound: A(() => 0),
      };
      ["LF", "RF", "LR", "RR"].forEach((w, k) => { ["CL", "CM", "CR"].forEach((z, j) => (T[w + "temp" + z] = 82 + k * 3 + j * 2 + 4 * Math.sin(t / 9 + k))); ["L", "M", "R"].forEach((z, j) => (T[w + "wear" + z] = Math.max(0.6, 1 - (mp - 1) * 0.012 - j * 0.004))); T[w + "pressure"] = 172 + k; T[w + "coldPressure"] = 165; });
      return T;
    };
    // the track's outline for the Live map, so it shows at once instead of after a lap
    const shape = () => ({ x: tr.x.slice(), y: tr.y.slice(), len: L, trackId: c.trackId, name: c.track });
    return { yaml, frame, shape };
  })();

  window.PITLANE_DEMO = { get, liveSession: LIVE.yaml, liveFrame: LIVE.frame, liveShape: LIVE.shape };
})();
