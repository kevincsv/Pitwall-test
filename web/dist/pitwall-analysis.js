/* The lap analysis and the coach of Pitlane HQ, one file for every device: the web and the PC app (index.html loads it)
   and the phones (Android runs it in a JavaScriptSandbox, iOS in JavaScriptCore; they download it from pitlanehq.app and
   keep a copy in the app). Pure JavaScript: no page, no storage, no network. What it needs from around it comes in a
   context argument:
     lang     "en", "es" or "pt": the language of the texts it writes
     units    "metric" or "imperial"
     turns    the track's official turns as fractions of the lap (null without them)
     weights  what the coach learnt from everyone (/community/coach/weights: w and b by "kind|cls", off as a list or a Set)
     me       the driver's own memory (/community/coach/me: w by "kind|cls", habits)
     hint     a function (apex m) → the model's corner card there, or cards: the model's corner cards (/community/model)
     laps     the session's laps (how steady each corner is), for analyse
     step     the next level's step (the model's ladder entry, step), for analyse when lap B is the next level
     post     a function every text of the plan and the analyzer goes through (the web turns "this PC" into "your PC")
   A lap is the web's own shape: bins (one every 5 m: [speed m/s, lap time s, throttle 0-1, brake 0-1, gear, steering
   rad]), maxBin, time, sectors, trackId and xy {x, y, g} (the path, g its origin when it comes from the game's position).
   analyse(A, B, ctx) gives everything the analyzer and the coach show as plain JSON. The corners' tips carry English,
   Spanish and Portuguese ([en, es, pt]); text is the one in ctx.lang, and todo what the braking points table says to do
   there (tipMain, tipShort). */
(function (root) {
  "use strict";
  const VERSION = 1, BIN = 5;
  const langOf = (ctx) => { const l = ctx && ctx.lang; return l === "es" || l === "pt" ? l : "en"; };
  const txOf = (ctx) => { const l = langOf(ctx), post = ctx && typeof ctx.post === "function" ? ctx.post : (s) => s; return (en, es, pt) => post(l === "es" ? es : l === "pt" ? (pt != null ? pt : en) : en); };
  const unitsOf = (ctx) => { const imp = !!(ctx && ctx.units === "imperial"); return { spd: (ms) => imp ? ms * 2.23694 : ms * 3.6, spdU: () => imp ? "mph" : "km/h" }; };
  const turnsOf = (ctx) => ctx && Array.isArray(ctx.turns) ? ctx.turns : null;
  const sgn = (d, n = 3) => d == null || isNaN(d) ? "–" : (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(n);
  // what the coach learnt: the weight of a tip (everyone's and this driver's), the metres a braking tip asks for, the kinds turned off
  function coachOf(ctx) {
    const W = (ctx && ctx.weights) || {}, ME = (ctx && ctx.me) || {}, w = W.w || {}, b = W.b || {}, mw = ME.w || {};
    const off = W.off instanceof Set ? W.off : new Set(Array.isArray(W.off) ? W.off : []);
    return {
      weight: (c) => c && c.kind ? (w[c.kind + "|" + c.cls] || 1) * (mw[c.kind + "|" + c.cls] || 1) : 1,
      ask: (k, cls) => { const x = b[k + "|" + cls]; return x && x.ask > 0 ? x.ask : null; },
      off: (k, cls) => off.has(k + "|" + cls),
      habits: Array.isArray(ME.habits) ? ME.habits : [],
    };
  }
  // the model's corner card nearest a corner's slowest point (within 60 m), each knowing the hardest corner's spread
  function hintOf(ctx) {
    if (ctx && typeof ctx.hint === "function") return ctx.hint;
    const cs = ctx && Array.isArray(ctx.cards) ? ctx.cards : null;
    if (!cs || !cs.length) return () => null;
    const mx = Math.max(0, ...cs.map((c) => c.spread || 0));
    return (apex) => { if (!(apex >= 0)) return null; let b = null; for (const c of cs) { const g = Math.abs(c.apex - apex); if (g <= 60 && (!b || g < Math.abs(b.apex - apex))) b = c; } return b ? { ...b, spreadMax: b.spreadMax != null ? b.spreadMax : mx } : null; };
  }

  /* ---------- a lap's points ---------- */
  function lapSeries(l) { const out = []; let last = null; const lim = Math.min(l.bins.length, (l.maxBin || l.bins.length - 1) + 1); for (let i = 0; i < lim; i++) { const b = l.bins[i] || last; if (!l.bins[i] && !last) continue; out[i] = b; last = b; } const end = out.length; return { arr: out, end }; }
  function serOf(l) { if (!l._ser || l._serN !== l.bins.length) { l._ser = lapSeries(l).arr; l._serN = l.bins.length; } return l._ser; }

  /* ---------- the racing line ---------- */
  /* the shape of a lap Pitlane HQ recorded with the car's position */
  const lapShape = (l) => l && l.xy && l.xy.x.length > 10 ? { x: l.xy.x, y: l.xy.y, N: l.xy.x.length, g: l.xy.g || null, lap: true } : null;
  /* two paths in one frame: both from the game's position (b moved to a's origin) or both dead reckoning; null when one is each (they never line up) */
  function sameFrame(a, b) { if (!a || !b || !!a.g !== !!b.g) return null; if (!a.g || (a.g[0] === b.g[0] && a.g[1] === b.g[1])) return b; const dx = (b.g[1] - a.g[1]) * 111320 * Math.cos(a.g[0] * Math.PI / 180), dy = (b.g[0] - a.g[0]) * 110540; return { ...b, x: b.x.map((v) => v + dx), y: b.y.map((v) => v + dy) }; }
  /* where lap A's car was across the track against lap B's, every 5 m (racingline.go does the same). Both paths share their
     orientation, so at the same lap distance A's point along B's normal is how far A was to one side of B; the slow drift of
     the dead reckoning goes with a ±400 m moving average. Null when either lap has no path or the two paths are not the same
     track; NaN where they do not line up. */
  function lineOffsets(A, B) {
    const a = lapShape(A), b = sameFrame(a, lapShape(B)); if (!a || !b) return null; const n = Math.min(a.N, b.N); if (n < 60) return null;
    const lat = new Array(n), lon = new Array(n);
    for (let i = 0; i < n; i++) { const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2); let tx = b.x[i1] - b.x[i0], ty = b.y[i1] - b.y[i0]; const tm = Math.hypot(tx, ty) || 1; tx /= tm; ty /= tm; const dx = a.x[i] - b.x[i], dy = a.y[i] - b.y[i]; lat[i] = -ty * dx + tx * dy; lon[i] = tx * dx + ty * dy; }
    const W = 80, sm = (v) => { const pre = [0]; v.forEach((x, i) => pre.push(pre[i] + x)); return v.map((x, i) => { const lo = Math.max(0, i - W), hi = Math.min(n - 1, i + W); return x - (pre[hi + 1] - pre[lo]) / (hi - lo + 1); }); };
    const lc = sm(lat), oc = sm(lon), ab = oc.map(Math.abs).sort((p, q) => p - q); if (ab[n >> 1] > 6) return null;
    return lc.map((v, i) => Math.abs(oc[i]) > 20 || Math.abs(v) > 25 ? NaN : v);
  }
  /* how far A was to the inside of B (m, + inside) at B's turn-in (its braking point), apex and exit; null on a straight */
  function cornerLine(lat, B, brake, apex) {
    const b = lapShape(B); if (!lat || !b) return null; const n = Math.min(lat.length, b.N); if (apex <= 0 || apex >= n - 1) return null;
    const tan = (i) => { const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2), tx = b.x[i1] - b.x[i0], ty = b.y[i1] - b.y[i0], m = Math.hypot(tx, ty) || 1; return [tx / m, ty / m]; };
    const t1 = tan(Math.max(0, apex - 8)), t2 = tan(Math.min(n - 1, apex + 8)), cr = t1[0] * t2[1] - t1[1] * t2[0]; if (Math.abs(cr) < .05) return null; const sg = cr < 0 ? -1 : 1;
    const at = (i) => { let s = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) if (!isNaN(lat[k])) { s += lat[k]; c++; } return c ? s / c * sg : NaN; };
    const r = { entry: at(brake), apex: at(apex), exit: at(Math.min(n - 1, apex + 16)) }; return isNaN(r.entry) || isNaN(r.apex) || isNaN(r.exit) ? null : r;
  }
  /* the advice of the line in one corner, [en, es, kind, pt], or null when it is like the reference's */
  function lineTip(c, sameBrake) {
    if (!c) return null; const f = (v) => Math.abs(v).toFixed(1), o = [];
    if (c.entry >= 1.5) o.push([c.entry, sameBrake ? `You brake where the reference does but ${f(c.entry)} m more to the inside. Turn in from the outside` : `You turn in ${f(c.entry)} m more to the inside. Start the corner from the outside`, sameBrake ? `Frenas donde la referencia pero ${f(c.entry)} m más por dentro. Entra a la curva desde fuera` : `Entras ${f(c.entry)} m más por dentro. Empieza la curva desde fuera`, sameBrake ? "line_same_brake" : "line_turnin",
      sameBrake ? `Você freia onde a referência freia, mas ${f(c.entry)} m mais por dentro. Entre na curva por fora` : `Você entra na curva ${f(c.entry)} m mais por dentro. Comece a curva por fora`]);
    if (c.apex <= -1.5) o.push([-c.apex, `You pass ${f(c.apex)} m away from the apex. Get closer to the inside`, `Pasas a ${f(c.apex)} m del vértice. Acércate más por dentro`, "line_apex", `Você passa a ${f(c.apex)} m do ápice. Chegue mais perto da parte de dentro`]);
    if (c.exit >= 1.5) o.push([c.exit, `You use ${f(c.exit)} m less track on exit. Let the car run out to the outside`, `Usas ${f(c.exit)} m menos de pista a la salida. Deja correr el coche hacia fuera`, "line_exit", `Você usa ${f(c.exit)} m a menos de pista na saída. Deixe o carro abrir até a parte de fora`]);
    if (!o.length) return null; o.sort((p, q) => q[0] - p[0]); return [o[0][1], o[0][2], o[0][3], o[0][4]];
  }

  /* ---------- corners ---------- */
  /* the braking zones of a lap: where each starts, its entry and minimum speed */
  function brakeZones(s) { const out = []; for (let i = 1; i < s.length; i++) { const a = s[i], b = s[i - 1]; if (!a || !b) continue; if (a[3] > .12 && b[3] <= .12) { let k = i, vmin = a[0], imin = i; while (k < s.length && k < i + 120 && s[k] && !(s[k][2] > .6 && s[k][3] < .05)) { if (s[k][0] < vmin) { vmin = s[k][0]; imin = k; } k++; } if (a[0] - vmin > 4) out.push({ i, v: a[0], vmin, imin }); i = k; } } return out; }
  /* each corner in four phases, as driver coaches read data: braking (brake point, how hard), entry (releasing the brake
     into the turn, trail braking; coasting), apex (minimum speed) and exit (when the throttle comes back) */
  const PHASES = [["brake", "Braking", "Frenada", "Frenagem"], ["entry", "Entry", "Entrada", "Entrada"], ["apex", "Apex", "Vértice", "Ápice"], ["exit", "Exit", "Salida", "Saída"]];
  const phaseName = (k, ctx) => { const p = PHASES.find((x) => x[0] === k); return p ? txOf(ctx)(p[1], p[2], p[3]) : ""; };
  /* the official number of the turn nearest a point of the lap (turns: fractions of the lap, T1 … Tn), else fb */
  function turnNo(turns, d, L, fb) { const t = turns; if (!t || !t.length || !(L > 0)) return fb; const f = (((d / L) % 1) + 1) % 1; let bi = 0, bd = 2; t.forEach((x, i) => { let dd = Math.abs(x - f); dd = Math.min(dd, 1 - dd); if (dd < bd) { bd = dd; bi = i; } }); return bi + 1; }
  /* the tips that say nothing the data showed (their kinds): what the data shows plainly (the gear, lifts, the line) replaces them */
  const COACH_GEN = ["brake_generic", "entry_speed", "apex_line", "full_throttle", "brake_same", "entry_before", "apex_longer"];
  /* a corner's speed at the reference's slowest point (m/s): the coach's tips are counted by it (coachtips.js) */
  const cornerClass = (v) => v < 22 ? "slow" : v < 42 ? "medium" : "fast";
  /* the corners of the reference lap: its braking zones, each named by the track's turn so two brake applications in one
     corner are one corner, plus the turns the reference takes without braking (a lift, a fast corner); without turns, the
     braking zones as they are (cornerZones in ovnative4.go does the same) */
  function cornerZones(sb, n, turns) {
    const zb = brakeZones(sb), t = turns; if (!t || !t.length || !(n > 0)) return zb;
    const ap = t.map((f) => Math.round(f * n)).filter((i) => i > 0 && i < n - 1), near = (i) => { let b = -1, bd = 1e9; ap.forEach((a, k) => { const d = Math.abs(a - i); if (d < bd) { bd = d; b = k; } }); return bd <= 30 ? b : -1; }; // the turn whose apex is within 150 m
    const by = new Map(); zb.forEach((z) => { const k = near(z.imin); if (k < 0) { by.set("z" + z.i, z); return; } const o = by.get(k); if (!o) by.set(k, { ...z, turn: k }); else { if (z.vmin < o.vmin) { o.vmin = z.vmin; o.imin = z.imin; } o.i = Math.min(o.i, z.i); o.v = Math.max(o.v, z.v); } });
    // a turn the reference takes without braking: from where it lifts (its last full throttle before the apex, or 100 m before) to its slowest point, when it really slows
    ap.forEach((a, k) => { if (by.has(k)) return; let i0 = Math.max(0, a - 20); for (let i = a; i > Math.max(0, a - 40); i--) if (sb[i] && sb[i][2] > .9) { i0 = i; break; } let imin = a, vmin = sb[a] ? sb[a][0] : 0; for (let i = i0; i < Math.min(n, a + 10); i++) if (sb[i] && sb[i][0] < vmin) { vmin = sb[i][0]; imin = i; } const v = sb[i0] ? sb[i0][0] : vmin; if (v - vmin > 2) by.set(k, { i: i0, v, vmin, imin, turn: k, lift: true }); });
    return [...by.values()].sort((a, b) => a.i - b.i);
  }

  /* ---------- the coach, corner by corner ---------- */
  /* lap A against lap B in every corner of B: where it brakes, its speeds, the time won or lost from 50 m before braking to
     150 m after the slowest point, phase by phase, and the tip about the phase where the time goes, in en, es and pt */
  function coachCompare(A, B, ctx) {
    const { spd, spdU } = unitsOf(ctx), C = coachOf(ctx), tipAsk = C.ask, tipOff = C.off, turns = turnsOf(ctx);
    const sa = serOf(A), sb = serOf(B), n = Math.min(sa.length, sb.length), zb = cornerZones(sb, n, turns), za = brakeZones(sa), lat = lineOffsets(A, B);
    const T = (s, i) => s[i] && s[i][1], seg = (x, y) => x < y && sa[x] && sa[y] && sb[x] && sb[y] ? (T(sa, y) - T(sa, x)) - (T(sb, y) - T(sb, x)) : 0;
    const peak = (s, x, y) => { let p = 0, ip = x; for (let k = x; k <= y && k < s.length; k++) if (s[k] && s[k][3] > p) { p = s[k][3]; ip = k; } return [p, ip]; };
    const release = (s, from, to) => { for (let k = from; k <= to && k < s.length; k++) if (s[k] && s[k][3] < .05) return k; return to; };
    const coast = (s, x, y) => { let c = 0; for (let k = x; k <= y && k < s.length; k++) if (s[k] && s[k][2] < .05 && s[k][3] < .05) c++; return c * BIN; };
    const pickup = (s, from, to) => { for (let k = from; k <= to && k < s.length; k++) if (s[k] && s[k][2] > .5) return k; return null; };
    return zb.map((z, k) => {
      const m = za.filter((q) => Math.abs(q.i - z.i) <= 20).sort((p, q) => Math.abs(p.i - z.i) - Math.abs(q.i - z.i))[0]; /* the same corner: the nearest braking point within 100 m */
      const i0 = Math.max(0, z.i - 10), i1 = Math.min(n - 1, z.imin + 30); if (!sa[i0] || !sa[i1] || !sb[i0] || !sb[i1]) return null;
      const lost = (sa[i1][1] - sa[i0][1]) - (sb[i1][1] - sb[i0][1]); const dd = m ? (m.i - z.i) * BIN : null, dmin = m ? spd(m.vmin) - spd(z.vmin) : null;
      // the reference lap's phases, on the same distance grid for both laps
      const [pb, ipb] = peak(sb, z.i, z.imin), rel = Math.min(release(sb, ipb, z.imin), z.imin), a0 = Math.max(rel, z.imin - 4), a1 = Math.min(i1, z.imin + 4);
      const ph = { brake: seg(i0, rel), entry: seg(rel, a0), apex: seg(a0, a1), exit: seg(a1, i1) };
      const worst = Object.entries(ph).sort((p, q) => q[1] - p[1])[0];
      // what this lap does differently
      const [pa, ipa] = m ? peak(sa, m.i, m.imin) : [0, 0], relA = m ? release(sa, ipa, m.imin) : 0;
      const trailA = m ? (relA - ipa) * BIN : null, trailB = (rel - ipb) * BIN, coastA = coast(sa, i0, i1), coastB = coast(sb, i0, i1);
      // how the throttle is opened after the apex: metres from picking it up (5 %) to full (95 %)
      const ramp = (s, from, to) => { let a = null; for (let k = from; k <= to && k < s.length; k++) { if (!s[k]) continue; if (a == null && s[k][2] > .05) a = k; if (a != null && s[k][2] > .95) return (k - a) * BIN; } return null; }, rampA = m ? ramp(sa, m.imin, i1) : null, rampB = ramp(sb, z.imin, i1);
      const puA = m ? pickup(sa, m.imin, i1) : null, puB = pickup(sb, z.imin, i1), late = puA != null && puB != null ? (puA - puB) * BIN : null;
      // the gear through the corner, the lifts after the apex and the corrections of the wheel: what a generic tip gives way to
      const gearAt = (s, i) => s[i] && isFinite(s[i][4]) ? Math.round(s[i][4]) : 0, apexA = m ? m.imin : z.imin, gA = gearAt(sa, apexA), gB = gearAt(sb, z.imin);
      const lifts = (s, from, to) => { let n = 0, prev = -1; for (let k = from; k <= to && k < s.length; k++) { if (!s[k]) continue; const t = s[k][2]; if (prev >= 0 && prev > .8 && t < .5) n++; prev = t; } return n; }, lA = lifts(sa, apexA, i1), lB = lifts(sb, z.imin, i1);
      const revs = (s, from, to) => { let n = 0, prevD = 0, last = null, has = false; for (let k = from; k <= to && k < s.length; k++) { if (!s[k] || !isFinite(s[k][5])) continue; const v = s[k][5]; if (v !== 0) has = true; if (last != null) { const d = v - last; if (Math.abs(d) > .004) { if (prevD !== 0 && Math.sign(d) !== Math.sign(prevD)) n++; prevD = d; } } last = v; } return [n, has]; }, [rA, hasA] = revs(sa, i0, i1), [rB, hasB] = revs(sb, i0, i1);
      let en = "", es = "", pt = "", phase = null, kind = ""; const say = (k, a, b, c) => { kind = k; en = a; es = b; pt = c; };
      const cls = cornerClass(z.vmin);
      if (lost > .03) {
        phase = worst[0]; if (z.lift && phase === "brake") phase = "entry"; const r = Math.round; // a corner taken without braking has no braking phase to speak of
        // the metres a braking tip asks for: what the drivers who gained really moved their braking by (tipAsk), never more than the gap seen
        const askA = tipAsk("brake_late_apex", cls), askE = tipAsk("brake_earlier", cls), askL = tipAsk("brake_later", cls);
        // braking later than the reference and arriving slower at the apex is one mistake, whatever phase pays for it
        if (m && dd != null && dd > 6 && dmin != null && dmin < -2) say("brake_late_apex", `You brake ${r(dd)} m later than the reference and lose ${r(-dmin)} ${spdU()} at the apex. Brake ${askA && askA < r(dd) ? askA + " m" : "a little"} earlier and carry the speed`, `Frenas ${r(dd)} m más tarde que la referencia y pierdes ${r(-dmin)} ${spdU()} en el vértice. Frena ${askA && askA < r(dd) ? askA + " m" : "un poco"} antes y conserva la velocidad`, `Você freia ${r(dd)} m depois da referência e perde ${r(-dmin)} ${spdU()} no ápice. Freie ${askA && askA < r(dd) ? askA + " m" : "um pouco"} antes e leve a velocidade`);
        else if (phase === "brake") {
          if (dd != null && dd < -6) { const mv = askL && askL < r(-dd) ? askL : r(-dd); say("brake_later", `Brake ${mv} m later`, `Frena ${mv} m más tarde`, `Freie ${mv} m depois`); }
          else if (m && pa < pb - .05) say("brake_harder", `Brake harder at first (${r(pa * 100)} % vs ${r(pb * 100)} %)`, `Pisa más fuerte al empezar a frenar (${r(pa * 100)} % frente a ${r(pb * 100)} %)`, `Freie mais forte no início (${r(pa * 100)} % contra ${r(pb * 100)} %)`);
          else if (dd != null && dd > 6) say("brake_earlier", `You braked ${r(dd)} m too late and lost the corner. Brake ${askE && askE < r(dd) ? askE + " m" : ""} earlier`.replace("  ", " "), `Frenaste ${r(dd)} m demasiado tarde y perdiste la curva. Frena ${askE && askE < r(dd) ? askE + " m " : ""}antes`, `Você freou ${r(dd)} m tarde demais e perdeu a curva. Freie ${askE && askE < r(dd) ? askE + " m " : ""}antes`);
          else if (trailA != null && trailB - trailA >= 15) say("trail", `Release the brake more gradually into the turn (trail braking ${r(trailA)} m vs ${r(trailB)} m)`, `Suelta el freno más progresivamente al entrar (trail braking ${r(trailA)} m frente a ${r(trailB)} m)`, `Solte o freio de forma mais gradual ao entrar na curva (trail braking ${r(trailA)} m contra ${r(trailB)} m)`);
          else if (dd != null) say("brake_same", "Same braking point but slower through the braking zone. Brake hard at once, then release progressively", "Mismo punto de frenada pero más lento en la frenada. Pisa fuerte de golpe y suelta progresivamente", "Mesmo ponto de frenagem, mas mais lento na zona de frenagem. Freie forte de uma vez e depois solte aos poucos");
          else say("brake_generic", "Brake a little later and harder", "Frena un poco más tarde y más fuerte", "Freie um pouco depois e mais forte");
        }
        else if (phase === "entry") {
          if (trailA != null && trailB - trailA >= 15) say("trail", `Release the brake more gradually into the turn (trail braking ${r(trailA)} m vs ${r(trailB)} m)`, `Suelta el freno más progresivamente al entrar (trail braking ${r(trailA)} m frente a ${r(trailB)} m)`, `Solte o freio de forma mais gradual ao entrar na curva (trail braking ${r(trailA)} m contra ${r(trailB)} m)`);
          else if (coastA - coastB >= 10) say("coast", `Do not coast before the apex. ${r(coastA)} m without throttle or brake (reference ${r(coastB)} m)`, `No vayas sin gas ni freno antes del vértice. ${r(coastA)} m (referencia ${r(coastB)} m)`, `Não vá no embalo antes do ápice. ${r(coastA)} m sem acelerador nem freio (referência ${r(coastB)} m)`);
          else if (dmin != null && dmin >= 0) say("entry_before", "You reach the apex as fast as the reference, so the time goes before it. Release the brake more gradually as you turn in", "Llegas al vértice tan rápido como la referencia, así que el tiempo se va antes. Suelta el freno más progresivamente al girar", "Você chega ao ápice tão rápido quanto a referência, então o tempo se perde antes. Solte o freio de forma mais gradual ao entrar na curva");
          else say("entry_speed", "Carry more speed into the turn", "Entra con más velocidad en la curva", "Leve mais velocidade para dentro da curva");
        }
        else if (phase === "apex") { if (dmin != null && dmin < -2) say("apex_speed", `Carry ${r(-dmin)} ${spdU()} more through the apex`, `Pasa ${r(-dmin)} ${spdU()} más rápido por el vértice`, `Passe pelo ápice com ${r(-dmin)} ${spdU()} a mais`); else if (dmin != null && dmin >= 0) say("apex_longer", "As fast at the slowest point but slow for longer. Shorten the slow part of the corner (turn in later, later apex)", "Igual de rápido en el punto más lento, pero lento durante más metros. Acorta la parte lenta de la curva (gira más tarde, vértice más tardío)", "Tão rápido no ponto mais lento, mas lento por mais tempo. Encurte a parte lenta da curva (entre mais tarde, ápice mais tardio)"); else say("apex_line", "A rounder, faster line through the apex", "Una trazada más redonda y rápida por el vértice", "Uma linha mais redonda e rápida pelo ápice"); }
        else {
          if (late != null && late >= 8) say("throttle", `Get on the throttle ${r(late)} m earlier`, `Acelera ${r(late)} m antes`, `Acelere ${r(late)} m antes`);
          else if (rampA != null && rampB != null && rampB - rampA >= 15 && ((lA >= 1 && lA > lB) || (hasA && hasB && rA > rB + 1))) say("throttle_rough", `You open the throttle faster than the reference and then have to correct. Open it more progressively (${Math.round(rampA)} m to full vs ${Math.round(rampB)} m)`, `Abres el gas más rápido que la referencia y luego tienes que corregir. Ábrelo más progresivo (${Math.round(rampA)} m hasta el fondo frente a ${Math.round(rampB)} m)`, `Você abre o acelerador mais rápido que a referência e depois precisa corrigir. Abra de forma mais progressiva (${Math.round(rampA)} m até o fundo contra ${Math.round(rampB)} m)`);
          else if (rampA != null && rampB != null && rampA - rampB >= 15) say("throttle_slow", `You take ${Math.round(rampA)} m to reach full throttle (reference ${Math.round(rampB)} m). Squeeze it to full sooner`, `Tardas ${Math.round(rampA)} m en llegar a fondo (referencia ${Math.round(rampB)} m). Llega al 100 % antes`, `Você leva ${Math.round(rampA)} m para chegar ao acelerador a fundo (referência ${Math.round(rampB)} m). Pise até o fundo mais cedo`);
          else if (coastA - coastB >= 10) say("no_wait", "Do not wait between the brake and the throttle", "No esperes entre el freno y el acelerador", "Não espere entre o freio e o acelerador");
          else if (late != null && late <= -8 && dmin != null && dmin < -1) say("exit_speed", `You pick up the throttle ${r(-late)} m earlier but leave the apex ${r(-dmin)} ${spdU()} slower. Carry the speed through the apex and the exit follows`, `Aceleras ${r(-late)} m antes pero sales del vértice ${r(-dmin)} ${spdU()} más lento. Conserva la velocidad en el vértice y la salida vendrá sola`, `Você acelera ${r(-late)} m antes, mas sai do ápice ${r(-dmin)} ${spdU()} mais lento. Leve a velocidade pelo ápice e a saída vem junto`);
          else say("full_throttle", "Full throttle sooner on exit", "Acelerador a fondo antes en la salida", "Acelerador a fundo mais cedo na saída");
        }
        if (COACH_GEN.includes(kind)) {
          if (gA >= 1 && gB >= 1 && gB > gA) say("gear_up", `Take this corner in gear ${gB} like the reference (you use gear ${gA})`, `Toma esta curva en ${gB}ª como la referencia (tú vas en ${gA}ª)`, `Faça esta curva em ${gB}ª marcha como a referência (você usa a ${gA}ª)`);
          else if (gA >= 1 && gB >= 1 && gB < gA) say("gear_down", `Drop to gear ${gB} for the apex like the reference (you stay in gear ${gA})`, `Baja a ${gB}ª en el vértice como la referencia (tú te quedas en ${gA}ª)`, `Reduza para a ${gB}ª marcha no ápice como a referência (você fica na ${gA}ª)`);
          else if (phase === "exit" && lA >= 2 && lA > lB + 1) say("lifts", `Smoother throttle on exit. You lifted ${lA} times after the apex (reference ${lB})`, `Acelera más progresivo a la salida. Levantaste ${lA} veces tras el vértice (referencia ${lB})`, `Acelerador mais suave na saída. Você aliviou ${lA} vezes depois do ápice (referência ${lB})`);
          else if (hasA && hasB && rA >= 3 && rA > rB + 2) say("steer", `${rA} steering corrections in this corner (reference ${rB}). Turn in once, smoothly`, `${rA} correcciones de volante en esta curva (referencia ${rB}). Gira una vez, suave`, `${rA} correções de volante nesta curva (referência ${rB}). Gire uma vez, com suavidade`);
        }
        // a tip an admin turned off for corners of this speed gives way to the phase's plain tip
        if (tipOff(kind, cls)) { const G = { brake: ["brake_generic", "Brake a little later and harder", "Frena un poco más tarde y más fuerte", "Freie um pouco depois e mais forte"], entry: ["entry_speed", "Carry more speed into the turn", "Entra con más velocidad en la curva", "Leve mais velocidade para dentro da curva"], apex: ["apex_line", "A rounder, faster line through the apex", "Una trazada más redonda y rápida por el vértice", "Uma linha mais redonda e rápida pelo ápice"], exit: ["full_throttle", "Full throttle sooner on exit", "Acelerador a fondo antes en la salida", "Acelerador a fundo mais cedo na saída"] }; say(...(G[phase] || G.brake)); }
      }
      // the line: where the car was across the track. Braking at the reference's point but on the wrong part of the
      // track is said first; a generic tip gives way to it; otherwise it goes after the tip of the phase
      const line = cornerLine(lat, B, z.i, z.imin), lt = lost > .03 ? lineTip(line, m && dd != null && Math.abs(dd) <= 6) : null;
      if (lt) {
        const generic = COACH_GEN.includes(kind);
        if (generic || (phase === "brake" && m && Math.abs(dd) <= 6)) { en = lt[0]; es = lt[1]; kind = lt[2]; pt = lt[3]; } else { en += ". " + lt[0]; es += ". " + lt[1]; pt += ". " + lt[3]; }
      }
      // the corner's own times (what the lap and the reference spent from the braking zone to the exit): the coach learns from them
      const ta = sa[i1][1] - sa[i0][1], tb = sb[i1][1] - sb[i0][1];
      return { n: z.turn != null ? z.turn + 1 : turnNo(turns, z.imin * BIN, n * BIN, k + 1), d: z.i * BIN, apex: z.imin * BIN, dd, ve: m ? spd(m.v) : null, vr: spd(z.v), vmin: m ? spd(m.vmin) : null, vminr: spd(z.vmin), lost, ph, phase, coastA, coastB, trailA, trailB, late, line, tip: [en, es, pt], kind, cls, ta, tb, gA, gB, lift: !!z.lift };
    }).filter(Boolean);
  }
  /* how steady each corner is over the laps of the session: the spread of its time */
  function cornerConsistency(laps, R, turns) {
    const sb = serOf(R), zb = cornerZones(sb, sb.length, turns); if (laps.length < 3) return null;
    const per = zb.map((z) => { const ts = laps.map((L) => { const s = serOf(L), i0 = Math.max(0, z.i - 10), i1 = Math.min(s.length - 1, z.imin + 30); return s[i0] && s[i1] ? s[i1][1] - s[i0][1] : null; }).filter((x) => x != null); if (ts.length < 3) return null; const mu = ts.reduce((a, b) => a + b, 0) / ts.length; return Math.sqrt(ts.reduce((a, b) => a + (b - mu) * (b - mu), 0) / ts.length); });
    return per.map((sd, i) => ({ n: zb[i].turn != null ? zb[i].turn + 1 : i + 1, sd })).filter((x) => x.sd != null).sort((a, b) => b.sd - a.sd);
  }
  /* the sector times of two laps, the same in the analyzer and in the coach: the ones the game gave for each lap when both
     laps have them; otherwise thirds of the lap from the traces, counted from the start of the lap */
  function pairSecs(A, B, sa, sb, n) {
    const third = Math.floor(n / 3), tAt = (s, i) => { for (let k = Math.min(i, n - 1); k >= 0; k--) if (s.arr[k]) return s.arr[k][1]; return 0; };
    const gameSecs = (L) => Array.isArray(L.sectors) && L.sectors.length >= 2 && L.sectors.every((v) => v > 0) && Math.abs(L.sectors.reduce((p, v) => p + v, 0) - L.time) < 1 ? L.sectors : null;
    const traceSecs = (s, L) => { const c1 = tAt(s, third), c2 = tAt(s, 2 * third), ok = c1 > 0 && c2 > c1 && c2 < L.time; return ok ? [c1, c2 - c1, L.time - c2] : null; };
    const ga = gameSecs(A), gb = gameSecs(B), useGame = ga && gb && ga.length === gb.length, qa = useGame ? ga : traceSecs(sa, A), qb = useGame ? gb : traceSecs(sb, B);
    return qa && qb ? qa.map((v, k) => [v, qb[k]]) : [];
  }
  /* how each lap was driven, from all the telemetry: flat out, coasting, lifts in the middle of a corner and how busy the
     steering is; what A does differently from B, in plain words */
  function lapDriving(sa, sb, n, ctx) {
    const Tx = txOf(ctx);
    const m = (s) => { let full = 0, coast = 0, c = 0, lifts = 0, steer = 0, rev = 0, hasS = false, prevT = null, prevD = 0, lastS = null; for (let i = 0; i < n; i++) { const b = s.arr[i]; if (!b) continue; c++; const t = b[2], k = b[3]; if (t > .95) full++; if (t < .05 && k < .05) coast++;
      if (prevT != null && prevT > .9 && t < .6 && k < .05) lifts++; prevT = t; if (isFinite(b[5])) { hasS = true; if (lastS != null) { const d = b[5] - lastS; steer += Math.abs(d); if (Math.abs(d) > .004 && Math.sign(d) !== Math.sign(prevD) && prevD !== 0) rev++; if (Math.abs(d) > .004) prevD = d; } lastS = b[5]; } }
      return { full: c ? full / c : 0, coast: c ? coast / c : 0, lifts, steer, rev, hasS }; };
    const a = m(sa), b = m(sb), out = [], pc = (v) => Math.round(v * 100) + "%";
    if (b.full - a.full > .03) out.push("🦶 " + Tx(`A is flat out ${pc(a.full)} of the lap, B ${pc(b.full)}. Get back on the throttle sooner on the corner exits.`, `A va a fondo el ${pc(a.full)} de la vuelta, B el ${pc(b.full)}. Vuelve al acelerador antes a la salida de las curvas.`, `A vai de pé no fundo ${pc(a.full)} da volta, B ${pc(b.full)}. Volte ao acelerador antes na saída das curvas.`));
    if (a.coast - b.coast > .02) out.push("💤 " + Tx(`A spends ${pc(a.coast)} of the lap with no pedal (B ${pc(b.coast)}). Go from brake to throttle without waiting in between.`, `A pasa el ${pc(a.coast)} de la vuelta sin pisar ningún pedal (B el ${pc(b.coast)}). Pasa del freno al acelerador sin esperar entre medias.`, `A passa ${pc(a.coast)} da volta sem pedal (B ${pc(b.coast)}). Vá do freio ao acelerador sem esperar.`));
    if (a.lifts > b.lifts + 1) out.push("↕️ " + Tx(`A lifts off the throttle ${a.lifts} times in the middle of a corner (B ${b.lifts}). A smoother entry lets you stay on the throttle.`, `A levanta el pie del acelerador ${a.lifts} veces en mitad de curva (B ${b.lifts}). Una entrada más suave te deja mantener el gas.`, `A tira o pé ${a.lifts} vezes no meio da curva (B ${b.lifts}). Uma entrada mais suave deixa você manter o acelerador.`));
    if (a.hasS && b.hasS && b.steer > 0 && a.steer > b.steer * 1.15) out.push("🎯 " + Tx(`A turns the wheel ${Math.round((a.steer / b.steer - 1) * 100)}% more than B and corrects it ${a.rev} times (B ${b.rev}). The car is sliding or you go in too fast. Smoother hands, a little less speed at the turn-in.`, `A gira el volante un ${Math.round((a.steer / b.steer - 1) * 100)} % más que B y lo corrige ${a.rev} veces (B ${b.rev}). El coche desliza o entras demasiado rápido. Manos más suaves y un poco menos de velocidad al girar.`, `A gira o volante ${Math.round((a.steer / b.steer - 1) * 100)}% mais que B e corrige ${a.rev} vezes (B ${b.rev}). O carro está escorregando ou você entra rápido demais. Mãos mais suaves, um pouco menos de velocidade na entrada.`));
    return out;
  }
  /* the name of a kind of tip, short (the plan's habit, the admin's Coach tab) */
  const KIND_NAMES = { brake_late_apex: ["Brakes later and loses the apex", "Frena más tarde y pierde el vértice", "Freia depois e perde o ápice"], brake_later: ["Brake later", "Frenar más tarde", "Frear depois"], brake_harder: ["Brake harder at first", "Pisar más fuerte al empezar", "Frear mais forte no início"], brake_earlier: ["Braked too late", "Frenó demasiado tarde", "Freou tarde demais"], trail: ["Trail braking", "Trail braking", "Trail braking"], brake_same: ["Same point, slower braking zone", "Mismo punto, frenada más lenta", "Mesmo ponto, frenagem mais lenta"], brake_generic: ["Brake later and harder", "Frenar más tarde y fuerte", "Frear depois e mais forte"], coast: ["Coasting before the apex", "Inercia antes del vértice", "Embalo antes do ápice"], entry_before: ["Time before the apex", "Tiempo antes del vértice", "Tempo antes do ápice"], entry_speed: ["More speed into the turn", "Más velocidad al entrar", "Mais velocidade na entrada"], apex_speed: ["More speed at the apex", "Más velocidad en el vértice", "Mais velocidade no ápice"], apex_longer: ["Slow for longer", "Lento durante más metros", "Lento por mais tempo"], apex_line: ["Rounder line", "Trazada más redonda", "Linha mais redonda"], throttle: ["Throttle earlier", "Acelerar antes", "Acelerar antes"], no_wait: ["Wait between brake and throttle", "Espera entre freno y acelerador", "Espera entre freio e acelerador"], exit_speed: ["Throttle early, slow apex", "Acelera pronto, vértice lento", "Acelera cedo, ápice lento"], full_throttle: ["Full throttle sooner", "A fondo antes", "Acelerador a fundo mais cedo"], gear_up: ["Higher gear", "Marcha más alta", "Marcha mais alta"], gear_down: ["Lower gear", "Marcha más baja", "Marcha mais baixa"], lifts: ["Throttle lifts on exit", "Levanta el gas a la salida", "Alívios do acelerador na saída"], throttle_slow: ["Slow to full throttle", "Tarda en ir a fondo", "Demora para acelerar a fundo"], throttle_rough: ["Throttle too abrupt", "Gas demasiado brusco", "Acelerador brusco demais"], steer: ["Steering corrections", "Correcciones de volante", "Correções de volante"], line_same_brake: ["Line · turn in from the outside", "Trazada · entrar desde fuera", "Linha · entre por fora"], line_turnin: ["Line · turn-in too inside", "Trazada · giro muy por dentro", "Linha · entrada por dentro demais"], line_apex: ["Line · away from the apex", "Trazada · lejos del vértice", "Linha · longe do ápice"], line_exit: ["Line · track unused on exit", "Trazada · pista sin usar a la salida", "Linha · pista sem usar na saída"] };
  function kindName(k, ctx) { const N = KIND_NAMES[k]; return N ? txOf(ctx)(N[0], N[1], N[2]) : k; }

  /* ---------- the braking points table ---------- */
  /* a corner's own tip without the line's, which coachCompare adds after the tip of the phase (". ", then lineTip): the
     table says what to do in the phase that loses the most; a line tip that replaced a generic one (kind line_*) stays */
  function tipMain(c) {
    const t = (c && c.tip) || [], lt = String((c && c.kind) || "").startsWith("line_") ? null : lineTip(c && c.line, c && c.dd != null && Math.abs(c.dd) <= 6);
    if (!lt) return t; const cut = (s, x) => s && x && s.endsWith(". " + x) ? s.slice(0, -(x.length + 2)) : s;
    return [cut(t[0], lt[0]), cut(t[1], lt[1]), cut(t[2], lt[3])];
  }
  /* a tip in a few words: without its figures in brackets (the columns carry them) and, of two sentences, the one that
     says what to do (the last, unless it is only the measurement and the first is not) */
  function tipShort(t) {
    const q = String(t || "").replace(/\s*\([^)]*\)/g, "").trim().split(/\.\s+/).map((x) => x.replace(/\.$/, "").trim()).filter(Boolean); if (q.length < 2) return q[0] || "";
    const last = q[q.length - 1], first = q[0], num = /\d/; return num.test(last) && !num.test(first) ? first : last;
  }
  /* what to do in a corner, in a few words in the context's language: the table's last column ("" when it loses no time) */
  function tipTodo(c, ctx) { if (!c || !(c.lost > .03) || !c.tip || !c.tip[0]) return ""; const t = tipMain(c); return tipShort(txOf(ctx)(t[0], t[1], t[2])); }

  /* ---------- the plan ---------- */
  /* what to work on first: the corners that cost the most (weighed by what the coach learnt of their tips and how hard the
     corner is for everyone), the phase that repeats, the straights, the corners taken differently every lap, how the lap is
     driven, and the driver's habit first */
  function coachPlan(A, R, LP, ctx) {
    const Tx = txOf(ctx), { spdU } = unitsOf(ctx), C = coachOf(ctx), tipWeight = C.weight, turns = turnsOf(ctx), cornerHint = hintOf(ctx), pn = (k) => phaseName(k, ctx);
    const cs = coachCompare(A, R, ctx), sa = lapSeries(A), sb = lapSeries(R), n = Math.min(sa.end, sb.end), lapD = A.time - R.time;
    const lost = cs.reduce((s, c) => s + Math.max(0, c.lost), 0), gained = cs.reduce((s, c) => s + Math.min(0, c.lost), 0), inCorners = cs.reduce((s, c) => s + c.lost, 0), straight = lapD - inCorners;
    // a corner whose phases swing more than a second each way is not the same corner on both laps: its phases are not counted
    const ph = { brake: 0, entry: 0, apex: 0, exit: 0 }, phN = { brake: 0, entry: 0, apex: 0, exit: 0 }; cs.forEach((c) => { if (Object.values(c.ph).some((v) => Math.abs(v) > 1)) return; Object.keys(ph).forEach((k) => { const v = c.ph[k] || 0; if (v > 0) { ph[k] += v; if (v > .02) phN[k]++; } }); });
    const secs = pairSecs(A, R, sa, sb, n).map(([a, b], k) => ({ n: k + 1, a, b, d: a - b }));
    const driving = lapDriving(sa, sb, n, ctx), cons = cornerConsistency((LP || []).filter((l) => l.valid !== false), R, turns) || [];
    // a corner weighs what the coach learnt of its tip (tipWeight) and how hard the corner is for everyone (the model's spread of
    // times there); a corner you take differently every lap hears about consistency first
    const dif = (c) => { const h = cornerHint(c.apex); return h && h.spread > 0 && h.spreadMax > 0 ? 0.9 + 0.3 * Math.min(1, h.spread / h.spreadMax) : 1; };
    cs.forEach((c) => { const cz = cons.find((x) => x.n === c.n); if (cz && cz.sd > .08 && cz.sd > 2 * c.lost && /^brake/.test(c.kind || "")) { c.kind = "cons"; c.tip = ["Same braking point every lap, before anything else", "El mismo punto de frenada cada vuelta, antes que nada", "O mesmo ponto de frenagem em toda volta, antes de qualquer outra coisa"]; } });
    const P = [], r2 = (v) => Math.round(v * 100) / 100;
    cs.filter((c) => c.lost > .05).sort((a, b) => b.lost * tipWeight(b) * dif(b) - a.lost * tipWeight(a) * dif(a)).slice(0, 3).forEach((c) => P.push({ k: "corner", turns: [c.n], gain: c.lost, w: tipWeight(c) * dif(c), t: `T${c.n} · ${Tx(c.tip[0], c.tip[1], c.tip[2])}`,
      why: Tx(`You lose ${r2(c.lost)} s here, mostly in the ${pn(c.phase || "brake").toLowerCase()} phase. Slowest point ${c.vmin == null ? "–" : Math.round(c.vmin)} vs ${Math.round(c.vminr)} ${spdU()}${c.dd != null && Math.abs(c.dd) >= 5 ? `, you brake ${Math.abs(Math.round(c.dd))} m ${c.dd > 0 ? "later" : "earlier"}` : ""}.`,
        `Pierdes ${r2(c.lost)} s aquí, sobre todo en la fase de ${pn(c.phase || "brake").toLowerCase()}. Punto más lento ${c.vmin == null ? "–" : Math.round(c.vmin)} frente a ${Math.round(c.vminr)} ${spdU()}${c.dd != null && Math.abs(c.dd) >= 5 ? `, frenas ${Math.abs(Math.round(c.dd))} m ${c.dd > 0 ? "más tarde" : "antes"}` : ""}.`,
        `Você perde ${r2(c.lost)} s aqui, principalmente na fase de ${pn(c.phase || "brake").toLowerCase()}. Ponto mais lento ${c.vmin == null ? "–" : Math.round(c.vmin)} contra ${Math.round(c.vminr)} ${spdU()}${c.dd != null && Math.abs(c.dd) >= 5 ? `, você freia ${Math.abs(Math.round(c.dd))} m ${c.dd > 0 ? "depois" : "antes"}` : ""}.`) }));
    const worst = Object.entries(ph).sort((a, b) => b[1] - a[1])[0];
    // the habit's advice follows the data: where you brake against the reference on average, how fast you reach the apex and when you pick up the throttle
    const avg = (a) => a.length ? a.reduce((q, v) => q + v, 0) / a.length : null, mdd = avg(cs.filter((c) => c.dd != null).map((c) => c.dd)), mdmin = avg(cs.filter((c) => c.vmin != null).map((c) => c.vmin - c.vminr)), mlate = avg(cs.filter((c) => c.late != null).map((c) => c.late));
    if (worst && worst[1] > .12 && phN[worst[0]] >= 3) {
      const HOW = {
        brake: mdd != null && mdd > 4 ? ["You go in deeper than the reference in most corners. Brake a touch earlier and harder, and release the brake into the apex. A later braking point is not buying time here.", "Entras más profundo que la referencia en casi todas las curvas. Frena un poco antes y más fuerte, y suelta el freno hasta el vértice. Frenar más tarde no te está dando tiempo.", "Você entra mais fundo que a referência em quase todas as curvas. Freie um pouco antes e mais forte, e solte o freio até o ápice. Frear mais tarde não está te dando tempo."]
          : mdd != null && mdd < -4 ? ["Pick a fixed braking marker in every corner and brake 5 m later each lap until the entry gets nervous. Press hard at first, then ease off.", "Elige una referencia fija de frenada en cada curva y frena 5 m más tarde cada vuelta hasta que la entrada se ponga nerviosa. Pisa fuerte al principio y luego afloja.", "Escolha uma referência fixa de frenagem em cada curva e freie 5 m mais tarde a cada volta até a entrada ficar nervosa. Pise forte no início e depois alivie."]
          : ["Your braking points match the reference, so the time goes in how you brake. Press hard at once, then release progressively as you turn in (trail braking).", "Tus puntos de frenada coinciden con la referencia, así que el tiempo se va en cómo frenas. Pisa fuerte de golpe y suelta progresivamente mientras giras (trail braking).", "Seus pontos de frenagem coincidem com os da referência, então o tempo se perde na forma de frear. Pise forte de uma vez e solte aos poucos enquanto entra na curva (trail braking)."],
        entry: ["Release the brake gradually as you turn in (trail braking) instead of letting go at once, and do not coast. Brake or throttle, never neither.", "Suelta el freno poco a poco mientras giras (trail braking) en vez de soltarlo de golpe, y no vayas en punto muerto. Freno o acelerador, nunca ninguno.", "Solte o freio aos poucos enquanto entra na curva (trail braking) em vez de soltar de uma vez, e não vá no embalo. Freio ou acelerador, nunca nenhum dos dois."],
        apex: mdmin != null && mdmin >= 0 ? ["You are as fast as the reference at the slowest point but slow for longer. Turn in later and put the apex later, so the slow part of the corner gets shorter.", "Vas tan rápido como la referencia en el punto más lento, pero lento durante más metros. Gira más tarde y retrasa el vértice para acortar la parte lenta de la curva.", "Você é tão rápido quanto a referência no ponto mais lento, mas lento por mais tempo. Entre mais tarde e atrase o ápice para encurtar a parte lenta da curva."]
          : ["Turn in a little later and look at the exit. A rounder line lets you keep more speed at the slowest point.", "Gira un poco más tarde y mira a la salida. Una trazada más redonda te deja más velocidad en el punto más lento.", "Entre na curva um pouco mais tarde e olhe para a saída. Uma linha mais redonda deixa você levar mais velocidade no ponto mais lento."],
        exit: mlate != null && mlate <= -5 && mdmin != null && mdmin < -1 ? ["You pick up the throttle earlier than the reference but leave the corners slower. The exit starts at the apex, carry the speed there and the throttle will follow.", "Aceleras antes que la referencia pero sales de las curvas más lento. La salida empieza en el vértice, conserva la velocidad ahí y el acelerador vendrá solo.", "Você acelera antes da referência, mas sai das curvas mais lento. A saída começa no ápice, leve a velocidade ali e o acelerador vem junto."]
          : ["Unwind the steering sooner and open the throttle progressively from the apex, and use all the track on the way out.", "Abre el volante antes y acelera progresivamente desde el vértice, y usa toda la pista a la salida.", "Desfaça o volante mais cedo e abra o acelerador aos poucos desde o ápice, e use toda a pista na saída."],
      };
      P.push({ k: "phase", gain: worst[1], t: Tx(`${pn(worst[0])} phase · ${r2(worst[1])} s over the lap`, `Fase de ${pn(worst[0]).toLowerCase()} · ${r2(worst[1])} s en la vuelta`, `Fase de ${pn(worst[0]).toLowerCase()} · ${r2(worst[1])} s na volta`), why: Tx(`It shows in ${phN[worst[0]]} corners, so it is a habit rather than one mistake.`, `Aparece en ${phN[worst[0]]} curvas, así que es un hábito más que un error puntual.`, `Aparece em ${phN[worst[0]]} curvas, então é mais um hábito do que um erro isolado.`), how: Tx(...HOW[worst[0]]) });
    }
    if (straight > .08) P.push({ k: "straight", gain: straight, t: Tx(`${r2(straight)} s outside the braking zones`, `${r2(straight)} s fuera de las zonas de frenada`, `${r2(straight)} s fora das zonas de frenagem`), why: Tx("Time lost on the straights comes from the corner exits before them (less speed at the apex and a later throttle) and from the gears.", "El tiempo que se pierde en las rectas viene de las salidas de las curvas anteriores (menos velocidad en el vértice y el acelerador más tarde) y de las marchas.", "O tempo perdido nas retas vem das saídas das curvas anteriores (menos velocidade no ápice e o acelerador mais tarde) e das marchas."), how: Tx("Finish each corner with the throttle fully open as early as you can and check you shift at the right revs.", "Termina cada curva con el acelerador a fondo lo antes posible y comprueba que cambias a las revoluciones correctas.", "Termine cada curva com o acelerador a fundo o quanto antes e confira se você troca de marcha na rotação certa.") });
    const wob = cons.filter((x) => x.sd > .08).slice(0, 2); wob.forEach((x) => P.push({ k: "cons", turns: [x.n], gain: x.sd * .6, t: Tx(`T${x.n} changes ±${r2(x.sd)} s from lap to lap`, `T${x.n} cambia ±${r2(x.sd)} s de una vuelta a otra`, `T${x.n} muda ±${r2(x.sd)} s de uma volta para outra`), why: Tx("Over the session you take this corner differently every lap. The time spread is the gap between your best and your usual lap.", "A lo largo de la sesión tomas esta curva distinto cada vuelta. La dispersión es la diferencia entre tu mejor vuelta y la habitual.", "Ao longo da sessão você faz esta curva de um jeito diferente a cada volta. A dispersão é a diferença entre sua melhor volta e a volta habitual."), how: Tx("Same braking marker, same turn-in point, same line, every lap. Consistency first, speed after.", "La misma referencia de frenada, el mismo punto de giro, la misma trazada, cada vuelta. Primero regularidad, luego velocidad.", "A mesma referência de frenagem, o mesmo ponto de entrada, a mesma linha, em toda volta. Primeiro regularidade, depois velocidade.") }));
    driving.forEach((d) => P.push({ k: "style", gain: 0, t: d.replace(/^\S+\s/, ""), why: "", how: "" }));
    P.sort((a, b) => b.gain * (b.w || 1) - a.gain * (a.w || 1)); // the plan's order weighs each tip by what the coach learnt from the drivers (tipWeight), never its text
    // the driver's habit first: a kind of tip that repeats on several of their tracks (coachMe), with the corners of this lap it shows in
    const H = C.habits[0]; if (H && H.tracks >= 3) {
      const inLap = cs.filter((c) => c.kind === H.kind && c.lost > .03), names = inLap.map((c) => "T" + c.n).join(", ");
      P.unshift({ k: "habit", turns: inLap.map((c) => c.n), gain: inLap.reduce((q, c) => q + c.lost, 0), t: Tx(`${kindName(H.kind, ctx)} · a habit of yours`, `${kindName(H.kind, ctx)} · un hábito tuyo`, `${kindName(H.kind, ctx)} · um hábito seu`), why: Tx(`It shows on ${H.tracks} tracks and ${H.sessions} sessions${names ? `. In this lap in ${names}` : ""}.`, `Lo arrastras en ${H.tracks} circuitos y ${H.sessions} sesiones${names ? `. En esta vuelta en ${names}` : ""}.`, `Aparece em ${H.tracks} pistas e ${H.sessions} sessões${names ? `. Nesta volta em ${names}` : ""}.`), how: "" });
    }
    const areas = [["brake", ph.brake], ["entry", ph.entry], ["apex", ph.apex], ["exit", ph.exit], ["straight", Math.max(0, straight)]];
    return { cs, lapD, lost, gained, straight, ph, phN, secs, driving, cons, plan: P, areas, focus: areas.slice().sort((a, b) => b[1] - a[1])[0] };
  }

  /* the step to the next level (the model's levelStep): the corners where the drivers at your pace lose to the driver just
     ahead, by the official turns, as the line under the Next level card (" · …"), or "" */
  function stepText(step, A, ctx) {
    if (!Array.isArray(step) || !step.length || !A) return "";
    const n = A.bins ? A.bins.length : 0, turns = turnsOf(ctx), names = step.map((x, k) => "T" + turnNo(turns, x.apex, n * BIN, k + 1)).join(", ");
    return " · " + txOf(ctx)(`the drivers at your pace make the step in ${names}`, `los pilotos de tu ritmo dan el salto en ${names}`, `os pilotos do seu ritmo dão o salto em ${names}`);
  }

  /* ---------- the lap analyzer's key facts ---------- */
  /* the gap, the corner that costs the most, where A falls furthest behind and where it gains most, and the corners against
     the straights; items are [class, value, text] */
  function analyzerFacts(A, B, ctx) {
    const Tx = txOf(ctx), sa = lapSeries(A), sb = lapSeries(B), n = Math.min(sa.end, sb.end), ad = A.time - B.time; let peak = 0, peakI = 0, gain = 0, gainI = 0;
    for (let i = 0; i < n; i++) { const a = sa.arr[i], b = sb.arr[i]; if (a && b) { const d = a[1] - b[1]; if (d > peak) { peak = d; peakI = i; } if (d < gain) { gain = d; gainI = i; } } }
    const all = coachCompare(A, B, ctx), cz = all.filter((c) => c.lost > .03).sort((x, y) => y.lost - x.lost), items = [];
    if (cz[0]) { const t = Tx(cz[0].tip[0], cz[0].tip[1], cz[0].tip[2]); items.push(["bad", "T" + cz[0].n, Tx(`Corner ${cz[0].n} costs the most (${sgn(cz[0].lost, 3)} s) · ${t}`, `La curva ${cz[0].n} es la que más cuesta (${sgn(cz[0].lost, 3)} s) · ${t}`, `A curva ${cz[0].n} é a que mais custa (${sgn(cz[0].lost, 3)} s) · ${t}`)]); }
    if (peak > .05) items.push(["warn", sgn(peak, 3) + " s", Tx(`A is furthest behind at ${Math.round(peakI * BIN)} m (${sgn(peak, 3)} s)`, `A va más atrás en ${Math.round(peakI * BIN)} m (${sgn(peak, 3)} s)`, `A fica mais atrás em ${Math.round(peakI * BIN)} m (${sgn(peak, 3)} s)`)]);
    if (gain < -.05) items.push(["good", sgn(gain, 3) + " s", Tx(`A gains most around ${Math.round(gainI * BIN)} m (${sgn(gain, 3)} s)`, `A gana más alrededor de ${Math.round(gainI * BIN)} m (${sgn(gain, 3)} s)`, `A ganha mais por volta de ${Math.round(gainI * BIN)} m (${sgn(gain, 3)} s)`)]);
    const inC = all.reduce((q, c) => q + c.lost, 0), straight = ad - inC, nL = all.filter((c) => c.lost > .02).length, nG = all.filter((c) => c.lost < -.02).length;
    if (all.length) items.push([Math.abs(straight) > .08 && straight > 0 ? "warn" : "muted", sgn(inC, 2) + " s", Tx(`Corners ${sgn(inC, 2)} s (A loses in ${nL}, gains in ${nG}) · straights ${sgn(straight, 2)} s`, `Curvas ${sgn(inC, 2)} s (A pierde en ${nL}, gana en ${nG}) · rectas ${sgn(straight, 2)} s`, `Curvas ${sgn(inC, 2)} s (A perde em ${nL}, ganha em ${nG}) · retas ${sgn(straight, 2)} s`)]);
    return { ad, items, corners: all };
  }

  /* ---------- everything at once, for the phones ---------- */
  /* the analyzer's and the coach's answers for lap A against lap B as plain JSON (a string with opts.json): the gap, every
     corner (tip in en, es and pt, text in ctx.lang), the coach's plan with its corners, phases, sectors and areas, and the
     analyzer's key facts */
  function analyse(A, B, ctx, opts) {
    ctx = ctx || {};
    const Tx = txOf(ctx), withText = (c) => ({ ...c, text: c.tip[0] ? Tx(c.tip[0], c.tip[1], c.tip[2]) : "", todo: tipTodo(c, ctx) });
    const facts = analyzerFacts(A, B, ctx), plan = coachPlan(A, B, Array.isArray(ctx.laps) ? ctx.laps : [], ctx);
    const out = { v: VERSION, gap: A.time - B.time, corners: facts.corners.map(withText), facts: { ad: facts.ad, items: facts.items }, coach: { ...plan, cs: plan.cs.map(withText) } };
    if (Array.isArray(ctx.step)) out.step = stepText(ctx.step, A, ctx); // the next level's step, when lap B is the next level
    return opts && opts.json ? JSON.stringify(out) : out;
  }

  const api = { VERSION, BIN, lapSeries, serOf, lapShape, sameFrame, lineOffsets, cornerLine, lineTip, brakeZones, PHASES, phaseName, turnNo, COACH_GEN, cornerClass, cornerZones,
    coachCompare, cornerConsistency, pairSecs, lapDriving, kindName, tipMain, tipShort, tipTodo, coachPlan, stepText, analyzerFacts, analyse };
  root.PW_ANALYSIS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
