/* The web's landing for a visitor (not signed in): the sign-in stays at the top of the page (the "me" view, as it
   is), and under it one page like a product site (RaceLab, Track Titan…) that says what Pitlane HQ does: a tagline,
   then every feature as a section with a sample that draws itself as you scroll down to it, "And also" cards and
   the calls to action. The samples are real laps from the leaderboards (the record of the most driven car and track
   and the lap behind it, with their traces, as the public pages show them: nicknames or Anonymous); only when the
   server has none they come from the invented data of pitwall-demo.js, and the live relative and the race summary
   are always a sample (there is no public race). The calls to action create the account and download the apps
   (no way into the app on invented data). The web only (COMPANION):
   the PC app and the phones have their own first screens. */
(function () {
  if (typeof COMPANION === "undefined" || !COMPANION) return;
  const L = () => (typeof LANG === "string" && /^(es|pt)$/.test(LANG) ? LANG : "en");
  const t = (en, es, pt) => ({ en, es, pt })[L()] || en;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const D = () => window.PITLANE_DEMO;
  const fmt = (x) => { if (!(x > 0)) return "–"; const m = Math.floor(x / 60), s = x - m * 60; return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3); };
  const sgn = (x, d = 3) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(d);
  const col = (v, f) => (getComputedStyle(document.documentElement).getPropertyValue(v) || "").trim() || f;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anon = () => t("Anonymous", "Anónimo", "Anônimo");
  const who = (l) => (l.you ? t("You", "Tú", "Você") : l.alias || anon());
  const idOK = (id) => /^[\w.:-]{1,64}$/.test(String(id));

  // ---------- the sample: real laps from the leaderboards, the invented ones when the server has none ----------
  function invented() {
    if (!D()) return null;
    const a = D().get("/api/laps/demo:0:r:3"), b = D().get("/api/community/laps?id=comm:0:0"), board = (D().get("/api/community/laps?trackId=163&carId=169") || {}).laps || [];
    if (!a || !b) return null;
    return { real: false, a: { you: true, time: a.time, trace: a.trace }, b: { alias: b.alias, time: b.time, trace: b.trace }, board, car: a.car, track: a.track, layout: null };
  }
  async function loadReal(srv) {
    const j = async (p) => { const r = await fetch(srv + p, { cache: "no-store" }); if (!r.ok) throw new Error(p); return r.json(); };
    const recs = ((await j("/community/records?limit=60")).records || []).filter((r) => r.n >= 2).sort((p, q) => q.n - p.n);
    for (const rec of recs.slice(0, 8)) try { // a car and track whose laps cannot be read: the next one
      const board = ((await j(`/community/laps?trackId=${rec.trackId}&carId=${rec.carId}`)).laps || []).slice().sort((p, q) => p.time - q.time);
      const bRow = board.find((l) => l.id === rec.id && l.hasTrace) || board.find((l) => l.hasTrace);
      const aRow = bRow && board.find((l) => l.id !== bRow.id && l.hasTrace && l.time >= bRow.time);
      if (!bRow || !aRow || !idOK(bRow.id) || !idOK(aRow.id)) continue;
      const [b, a] = await Promise.all([j("/community/laps/" + bRow.id), j("/community/laps/" + aRow.id)]);
      const ok = (l) => l && l.trace && l.trace.d && l.trace.d.length > 50;
      if (!ok(a) || !ok(b)) continue;
      let layout = null;
      if (!(b.trace.x && b.trace.x.length) && !(a.trace.x && a.trace.x.length)) { try { const tp = await j("/community/track?trackId=" + rec.trackId); if (tp.layout && tp.layout.x) layout = tp.layout; } catch (e) {} }
      return { real: true, a: { alias: a.alias || anon(), time: a.time, trace: a.trace }, b: { alias: b.alias || anon(), time: b.time, trace: b.trace }, board, car: rec.car, track: rec.track, layout };
    } catch (e) { /* the next one */ }
    return null;
  }
  // a lap's trace with at most n points (every channel the same way): enough for the samples, light to keep
  function thin(tr, n) {
    const d = tr && tr.d; if (!d || d.length <= n) return tr;
    const st = d.length / n, o = {};
    for (const k of Object.keys(tr)) { const v = tr[k]; if (Array.isArray(v) && v.length === d.length) { const w = []; for (let i = 0; i < n; i++) w.push(v[Math.floor(i * st)]); w[n - 1] = v[v.length - 1]; o[k] = w; } else o[k] = v; }
    return o;
  }
  // the real laps of the last visit, kept in this browser for a day: the page shows them at once next time
  const CACHE = "pw.tourReal", DAY = 864e5;
  function cached() { try { const c = JSON.parse(localStorage.getItem(CACHE) || "null"); return c && c.real && Date.now() - c.at < DAY ? c : null; } catch (e) { return null; } }
  function keep(d) { try { const c = Object.assign({}, d, { at: Date.now(), a: Object.assign({}, d.a, { trace: thin(d.a.trace, 700) }), b: Object.assign({}, d.b, { trace: thin(d.b.trace, 700) }) }); localStorage.setItem(CACHE, JSON.stringify(c)); return c; } catch (e) { return d; } }
  async function loadData() {
    try { if (typeof cpReady !== "undefined") await cpReady; } catch (e) {}
    const srv = (typeof CP !== "undefined" && CP.server) || "";
    let real = null;
    if (srv) { try { real = await loadReal(srv); } catch (e) { real = null; } }
    return real ? keep(real) : null;
  }
  // the race: a sample always (there is no public race)
  const sampleRace = () => { const r = (D() && (D().get("/api/races") || {}).races) || []; return r.slice().sort((p, q) => Math.abs(q.finish - q.start) - Math.abs(p.finish - p.start))[0]; };
  // the track's shape for the maps: B's own path, else A's, else the community's layout
  const shape = (s) => (s.b.trace.x && s.b.trace.x.length ? s.b.trace : s.a.trace.x && s.a.trace.x.length ? s.a.trace : s.layout && s.layout.x ? s.layout : null);
  // B's rows resampled over A's points (two laps of the same track, maybe other bins)
  function pair(s) {
    const A = s.a.trace.d, B = s.b.trace.d, nA = A.length, nB = B.length;
    return { A, B: Array.from({ length: nA }, (_, i) => B[Math.min(nB - 1, Math.round((i / (nA - 1)) * (nB - 1)))]), n: nA };
  }
  // the corners of a lap: the dips of its speed (the slowest point of each) and where its braking starts
  function corners(d) {
    const n = d.length, w = Math.max(6, Math.round(n / 60)), out = [];
    for (let i = w; i < n - w; i++) {
      let min = true;
      for (let k = i - w; k <= i + w; k++) if (d[k][0] < d[i][0]) { min = false; break; }
      if (!min || (out.length && i - out[out.length - 1].i < 2 * w)) continue;
      let b = i; while (b > 0 && d[b - 1][2] > 0.05 && i - b < 4 * w) b--;
      out.push({ i, b, v: d[i][0] });
    }
    const vmax = Math.max(...d.map((r) => r[0]));
    return out.filter((c) => c.v < vmax * 0.8).slice(0, 14);
  }
  // what the coach says of each corner: where the time went between A and B, and the plainest reason
  function coachRows(s) {
    const { A, B, n } = pair(s), w = Math.max(6, Math.round(n / 60));
    return corners(B).map((c, k) => {
      const e = Math.min(n - 1, c.i + 2 * w), i0 = Math.max(0, c.b - w);
      const loss = (A[e][5] - A[i0][5]) - (B[e][5] - B[i0][5]);
      let ab = c.i; while (ab > 0 && A[ab - 1][2] > 0.05 && c.i - ab < 4 * w) ab--;
      const hw = Math.ceil(w / 2); let av = A[c.i][0]; for (let j = Math.max(0, c.i - hw); j < Math.min(n, c.i + hw); j++) av = Math.min(av, A[j][0]);
      const later = ab > c.b + 2, slower = av < c.v - 0.2;
      const tip = later && slower ? t("Brake a little earlier and carry the speed", "Frena un poco antes y lleva la velocidad", "Freie um pouco antes e leve a velocidade")
        : slower ? t("Carry more speed through the apex", "Lleva más velocidad en el vértice", "Leve mais velocidade no vértice")
        : loss > 0.03 ? t("Pick up the throttle earlier on the exit", "Acelera antes en la salida", "Acelere antes na saída") : t("Same as the reference", "Igual que la referencia", "Igual à referência");
      return { n: k + 1, i: c.i, loss, tip, av, bv: c.v };
    });
  }

  // ---------- drawing (each sample draws itself up to a fraction f of the lap, so it grows as it comes into view) ----------
  function cv(box, h) {
    let c = box.querySelector("canvas");
    const r = Math.min(2, devicePixelRatio || 1), w = box.clientWidth || 800;
    if (!c) { c = document.createElement("canvas"); box.appendChild(c); }
    if (c.width !== Math.round(w * r) || c.height !== Math.round(h * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); c.style.width = "100%"; c.style.height = h + "px"; }
    const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
    return { x, w, h };
  }
  function road(x, tr, X, Y, W, H, marks, f) {
    const xs = tr.x, ys = tr.y, n = xs.length, m = Math.max(2, Math.round(n * f)), mx = Math.min(...xs), Mx = Math.max(...xs), my = Math.min(...ys), My = Math.max(...ys);
    const sc = Math.min((W - 24) / (Mx - mx || 1), (H - 24) / (My - my || 1)), ox = X + (W - (Mx - mx) * sc) / 2 - mx * sc, oy = Y + (H - (My - my) * sc) / 2 - my * sc;
    const P = (i) => [ox + xs[i] * sc, oy + ys[i] * sc];
    const path = () => { x.beginPath(); for (let i = 0; i < m; i++) { const [a, b] = P(i); i ? x.lineTo(a, b) : x.moveTo(a, b); } if (f >= 1) x.closePath(); };
    x.lineCap = x.lineJoin = "round";
    path(); x.lineWidth = 11; x.strokeStyle = "rgba(0,0,0,.45)"; x.stroke();
    path(); x.lineWidth = 8; x.strokeStyle = "#3a4452"; x.stroke();
    path(); x.lineWidth = 5; x.strokeStyle = "#232b36"; x.stroke();
    const [sx, sy] = P(0), [nx, ny] = P(Math.min(n - 1, 3)), ang = Math.atan2(ny - sy, nx - sx);
    x.save(); x.translate(sx, sy); x.rotate(ang); x.fillStyle = "#e7ebf1"; x.fillRect(-1.5, -6, 3, 12); x.restore();
    (marks || []).forEach((k) => { const i = Math.min(n - 1, Math.round(k.at * (n - 1))); if (i > m) return; const [a, b] = P(i); x.beginPath(); x.arc(a, b, 7, 0, 7); x.fillStyle = k.c || col("--accent", "#ffb02e"); x.fill(); x.fillStyle = "#11151b"; x.font = "700 9px 'JetBrains Mono',monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(k.t, a, b); });
  }
  function trace(x, d, X, Y, W, H, pick, color, lw, vmax, f) {
    const n = d.length, m = Math.max(2, Math.round(n * f)); x.beginPath(); x.lineWidth = lw; x.strokeStyle = color;
    for (let i = 0; i < m; i++) { const px = X + (i / (n - 1)) * W, py = Y + H - (pick(d[i]) / vmax) * H; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  function grid(x, X, Y, W, H) { x.strokeStyle = "rgba(138,151,169,.18)"; x.lineWidth = 1; for (let k = 0; k <= 4; k++) { const y = Y + (H * k) / 4; x.beginPath(); x.moveTo(X, y); x.lineTo(X + W, y); x.stroke(); } }
  function label(x, s, X, Y, c, align) { x.fillStyle = c || col("--muted", "#8a97a9"); x.font = "600 11px 'JetBrains Mono',ui-monospace,monospace"; x.textAlign = align || "left"; x.textBaseline = "top"; x.fillText(s, X, Y); }
  const vtop = (d) => Math.ceil(Math.max(...d.map((r) => r[0])) * 3.6 / 10) * 10 + 10;

  function drawLap(box, f) {
    const s = S.data; if (!s) return;
    const d = s.a.trace.d, n = d.length, sh = shape(s), narrow = (box.clientWidth || 800) < 620, vmax = vtop(d);
    const { x, w } = cv(box, sh ? (narrow ? 420 : 250) : 240), mapW = !sh ? 0 : narrow ? w - 24 : Math.min(230, w * 0.32), W = narrow || !sh ? w - 24 : w - mapW - 36, X = 12, Y = 26, H = narrow ? 120 : 150;
    grid(x, X, Y, W, H);
    const m = Math.round(n * f); x.fillStyle = "rgba(255,99,99,.13)";
    for (let i = 0; i < m; i++) if (d[i][2] > 0.05) x.fillRect(X + (i / (n - 1)) * W, Y, Math.max(1, W / n + 0.5), H);
    trace(x, d, X, Y + H + 8, W, 44, (r) => Math.max(0, Math.min(1, r[1])), col("--good", "#38c97c"), 1.2, 1, f);
    trace(x, d, X, Y + H + 8, W, 44, (r) => Math.max(0, Math.min(1, r[2])), col("--bad", "#ff6363"), 1.2, 1, f);
    trace(x, d, X, Y, W, H, (r) => r[0] * 3.6, col("--accent", "#ffb02e"), 2, vmax, f);
    label(x, (narrow ? t("SPEED km/h · red: braking", "VELOCIDAD km/h · rojo: frenadas", "VELOCIDADE km/h · vermelho: frenagens") : t("SPEED km/h · the red bands are the braking", "VELOCIDAD km/h · las bandas rojas son las frenadas", "VELOCIDADE km/h · as faixas vermelhas são as frenagens")) + " · " + who(s.a) + " " + fmt(s.a.time), X, 6);
    label(x, t("THROTTLE · BRAKE", "ACELERADOR · FRENO", "ACELERADOR · FREIO"), X, Y + H + 8 + 44 + 4);
    label(x, String(vmax), X + W, Y + 2, null, "right"); label(x, "0", X + W, Y + H - 14, null, "right");
    if (!sh) return;
    if (narrow) { road(x, sh, 12, Y + H + 76, mapW, 190, null, f); label(x, s.track, w / 2, 402, null, "center"); }
    else { road(x, sh, w - mapW - 12, 10, mapW, 230, null, f); label(x, s.track, w - mapW - 12, 232); }
  }
  function drawCompare(box, f) {
    const s = S.data; if (!s) return;
    const { A, B, n } = pair(s), { x, w } = cv(box, 250), X = 12, W = w - 24, Y = 26, H = 130, vmax = Math.max(vtop(A), vtop(B));
    grid(x, X, Y, W, H);
    trace(x, A, X, Y, W, H, (r) => r[0] * 3.6, col("--accent", "#ffb02e"), 2.2, vmax, f);
    x.setLineDash([5, 4]); trace(x, B, X, Y, W, H, (r) => r[0] * 3.6, col("--pb", "#b98cff"), 1.6, vmax, f); x.setLineDash([]);
    label(x, "A · " + who(s.a) + " " + fmt(s.a.time), X, 6, col("--accent", "#ffb02e"));
    label(x, "B · " + who(s.b) + " " + fmt(s.b.time) + " ★", X + W, 6, col("--pb", "#b98cff"), "right");
    const Y2 = Y + H + 26, H2 = 60, dl = []; let mx = 0.05;
    for (let i = 0; i < n; i++) { const v = A[i][5] - B[i][5]; dl.push(v); mx = Math.max(mx, Math.abs(v)); }
    grid(x, X, Y2, W, H2); x.beginPath(); x.moveTo(X, Y2 + H2 / 2); x.lineTo(X + W, Y2 + H2 / 2); x.strokeStyle = "rgba(231,235,241,.4)"; x.stroke();
    const m = Math.max(2, Math.round(n * f)); x.beginPath(); for (let i = 0; i < m; i++) { const px = X + (i / (n - 1)) * W, py = Y2 + H2 / 2 - (dl[i] / mx) * (H2 / 2); i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.lineWidth = 2; x.strokeStyle = dl[m - 1] > 0 ? col("--bad", "#ff6363") : col("--good", "#38c97c"); x.stroke();
    label(x, t("GAP A − B · above the line A is losing", "DIFERENCIA A − B · por encima de la línea A pierde", "DIFERENÇA A − B · acima da linha A perde") + " · " + sgn(dl[m - 1]) + " s", X, Y2 - 16);
  }
  function coachHTML(s) {
    const all = coachRows(s), top = all.slice().sort((p, q) => q.loss - p.loss).slice(0, 3);
    return `<div class="tr-coach${shape(s) ? "" : " nomap"}"><div class="tr-cmap"></div><div class="tr-clist"><div class="tr-gap">${esc(who(s.a))} ${esc(t("against the record", "frente al récord", "contra o recorde"))} <b>${sgn(s.a.time - s.b.time)} s</b></div>${top.map((r, k) => `<div class="tr-crow tr-rv" style="transition-delay:${300 + k * 160}ms"><span class="tr-cn">T${r.n}</span><span class="tr-cl">${sgn(r.loss, 2)} s</span><span class="tr-ct">${esc(r.tip)}</span><span class="tr-cv">${Math.round(r.av * 3.6)} / ${Math.round(r.bv * 3.6)} km/h</span></div>`).join("")}</div></div>`;
  }
  function drawCoach(box, f) {
    const s = S.data; if (!s) return;
    if (!box.firstChild) box.innerHTML = coachHTML(s);
    const sh = shape(s); if (!sh) return;
    const all = coachRows(s), top = all.slice().sort((p, q) => q.loss - p.loss).slice(0, 3), n = pair(s).n, mapBox = box.querySelector(".tr-cmap"), { x, w } = cv(mapBox, 230);
    road(x, sh, 0, 0, w, 230, all.map((r) => ({ at: r.i / (n - 1), t: "T" + r.n, c: top.includes(r) ? col("--bad", "#ff6363") : "#8a97a9" })), f);
  }
  function boardHTML(s) {
    const b = s.board.slice(0, 6), best = b[0] && b[0].time;
    return `<div class="tr-board"><div class="tr-bh"><span>${esc(s.car)}</span><span class="tr-bt">${esc(s.track)}</span></div><div class="tr-scroll"><table><thead><tr><th>#</th><th>${esc(t("Driver", "Piloto", "Piloto"))}</th><th>${esc(t("Time", "Tiempo", "Tempo"))}</th><th>${esc(t("Gap", "Dif.", "Dif."))}</th></tr></thead><tbody>${b.map((l, i) => `<tr class="tr-rv${i === 0 ? " rec" : ""}" style="transition-delay:${150 + i * 110}ms"><td>${i + 1}</td><td>${esc(l.alias || anon())}${i === 0 ? ' <span class="tr-pill">★ ' + esc(t("Record", "Récord", "Recorde")) + "</span>" : ""}</td><td class="t">${fmt(l.time)}</td><td class="g">${i ? "+" + (l.time - best).toFixed(3) : ""}</td></tr>`).join("")}</tbody></table></div><p class="tr-note">${esc(t("Oval · Sports Car · Formula Car · Dirt Oval · Dirt Road. Your fastest lap of each car and track goes up by itself, under your name or as Anonymous.", "Óvalo · Sports Car · Fórmula · Óvalo de tierra · Tierra. Tu vuelta más rápida de cada coche y circuito sube sola, con tu nombre o como Anónimo.", "Oval · Sports Car · Fórmula · Oval de terra · Terra. Sua volta mais rápida de cada carro e pista sobe sozinha, com seu nome ou como Anônimo."))}</p></div>`;
  }
  function raceHTML(r) {
    const chg = r.irChange || 0;
    return `<div class="tr-race"><div class="tr-rh"><b>${esc(r.track)}</b><span>${esc(r.car)}</span></div><div class="tr-rk">
      <div class="tr-rv" style="transition-delay:150ms"><i>${esc(t("Start → finish", "Salida → llegada", "Largada → chegada"))}</i><b>P${r.start} → P${r.finish}</b><s>${r.field} ${esc(t("cars", "coches", "carros"))}</s></div>
      <div class="tr-rv" style="transition-delay:260ms"><i>iRating</i><b class="${chg >= 0 ? "up" : "dn"}">${sgn(chg, 0)}</b><s>${r.ir}</s></div>
      <div class="tr-rv" style="transition-delay:370ms"><i>${esc(t("Incidents", "Incidentes", "Incidentes"))}</i><b>${r.inc}x</b><s>${esc(t("per lap in the summary", "por vuelta en el resumen", "por volta no resumo"))}</s></div>
      <div class="tr-rv" style="transition-delay:480ms"><i>${esc(t("Best lap", "Mejor vuelta", "Melhor volta"))}</i><b>${fmt(r.best)}</b><s>${esc(t("field", "pelotón", "pelotão"))} ${fmt(r.fieldBest)}</s></div></div><div class="tr-rc"></div></div>`;
  }
  function drawRace(box, f) {
    const r = sampleRace(); if (!r) return;
    if (!box.firstChild) box.innerHTML = raceHTML(r);
    const cb = box.querySelector(".tr-rc"), { x, w } = cv(cb, 90), laps = r.laps || [], n = laps.length, m = Math.max(2, Math.round(n * f)), X = 12, W = w - 24, Y = 14, H = 60;
    grid(x, X, Y, W, H);
    const P = (i) => [X + (i / Math.max(1, n - 1)) * W, Y + ((laps[i].p - 1) / Math.max(1, r.field - 1)) * H];
    x.beginPath(); for (let i = 0; i < m; i++) { const [px, py] = P(i); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.lineWidth = 2; x.strokeStyle = col("--accent", "#ffb02e"); x.stroke();
    for (let i = 0; i < m; i++) { if (!laps[i].i) continue; const [px, py] = P(i); x.beginPath(); x.arc(px, py, 4, 0, 7); x.fillStyle = col("--bad", "#ff6363"); x.fill(); }
    label(x, t("POSITION LAP BY LAP · red: an incident", "POSICIÓN VUELTA A VUELTA · rojo: un incidente", "POSIÇÃO VOLTA A VOLTA · vermelho: um incidente"), X, 0);
  }
  // the live relative and the delta bar, moving while they are on the screen: a sample race, you are car 13
  function liveStart(box, st) {
    if (!D() || !D().liveFrame || st.on) return;
    if (!box.firstChild) box.innerHTML = `<div class="tr-delta"><i></i><b></b></div><div class="tr-rel"></div><p class="tr-note">${esc(t("The relative, the delta bar, the radar, the standings, fuel, tyres, the map… drawn by the agent over iRacing, and the same on your phone while you drive.", "El relativo, la barra de delta, el radar, la clasificación, combustible, neumáticos, el mapa… dibujados por el agente sobre iRacing, y lo mismo en tu móvil mientras conduces.", "O relativo, a barra de delta, o radar, a classificação, combustível, pneus, o mapa… desenhados pelo agente sobre o iRacing, e o mesmo no seu celular enquanto você pilota."))}</p>`;
    const names = [...(D().liveSession() || "").matchAll(/UserName: (.+)/g)].map((m) => m[1].trim());
    const rel = box.querySelector(".tr-rel"), dI = box.querySelector(".tr-delta i"), dB = box.querySelector(".tr-delta b"), t0 = performance.now();
    st.on = true;
    const tick = () => {
      if (!st.on) return;
      const T = D().liveFrame((performance.now() - t0) / 1000 + 40), me = T.PlayerCarIdx, N = names.length;
      const rows = Array.from({ length: N }, (_, i) => ({ i, pos: T.CarIdxPosition[i], gap: T.CarIdxF2Time[i] - T.CarIdxF2Time[me] })).sort((a, b) => a.pos - b.pos);
      const k = rows.findIndex((r) => r.i === me), seg = rows.slice(Math.max(0, k - 3), k + 4);
      rel.innerHTML = seg.map((r) => `<div class="tr-rr${r.i === me ? " me" : ""}"><span>${r.pos}</span><span class="n">#${10 + r.i}</span><span class="nm">${esc(names[r.i] || "")}</span><span class="g">${r.i === me ? "" : sgn(-r.gap, 1)}</span></div>`).join("");
      const d = T.LapDeltaToBestLap || 0; dI.style.width = Math.min(50, Math.abs(d) / 0.5 * 50) + "%"; dI.style.left = d < 0 ? 50 - Math.min(50, Math.abs(d) / 0.5 * 50) + "%" : "50%"; dI.style.background = d < 0 ? col("--good", "#38c97c") : col("--bad", "#ff6363"); dB.textContent = sgn(d, 2);
      st.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  const liveStop = (st) => { st.on = false; cancelAnimationFrame(st.raf); };

  // ---------- the page ----------
  const SECTIONS = () => [
    { k: "lap", eyebrow: t("01 · Telemetry", "01 · Telemetría", "01 · Telemetria"), h: t("Every lap, recorded", "Cada vuelta, grabada", "Cada volta, gravada"), p: t("Pitlane HQ Agent runs next to iRacing on your PC and saves speed, throttle, brake, gear and steering of every lap, with nothing to set up. The laps go to your account: open them later on the web or on your phone.", "Pitlane HQ Agent funciona junto a iRacing en tu PC y guarda velocidad, acelerador, freno, marcha y volante de cada vuelta, sin configurar nada. Las vueltas van a tu cuenta: ábrelas luego en la web o en el móvil.", "O Pitlane HQ Agent roda junto ao iRacing no seu PC e guarda velocidade, acelerador, freio, marcha e volante de cada volta, sem configurar nada. As voltas vão para sua conta: abra-as depois na web ou no celular."), draw: drawLap, laps: true },
    { k: "cmp", eyebrow: t("02 · Analysis", "02 · Análisis", "02 · Análise"), h: t("Compare two laps", "Compara dos vueltas", "Compare duas voltas"), p: t("Your lap against your best, against another session or against the record of the leaderboard: the speed along the lap and where the time goes, metre by metre, with the braking points and the track map.", "Tu vuelta frente a tu mejor, frente a otra sesión o frente al récord de la clasificación: la velocidad a lo largo de la vuelta y dónde se va el tiempo, metro a metro, con los puntos de frenada y el mapa del circuito.", "Sua volta contra a sua melhor, contra outra sessão ou contra o recorde da classificação: a velocidade ao longo da volta e onde o tempo vai, metro a metro, com os pontos de frenagem e o mapa da pista."), draw: drawCompare, laps: true },
    { k: "coach", eyebrow: t("03 · Coach", "03 · Coach", "03 · Coach"), h: t("A coach that uses real laps", "Un coach con vueltas reales", "Um coach com voltas reais"), p: t("For each car and track Pitlane HQ learns from real laps of real drivers. The coach measures your lap against the record and the driver just ahead of you, and tells you which corners cost the most and what to change.", "Para cada coche y circuito, Pitlane HQ aprende de vueltas reales de pilotos reales. El coach mide tu vuelta frente al récord y al piloto que va justo por delante, y te dice qué curvas te cuestan más y qué cambiar.", "Para cada carro e pista, o Pitlane HQ aprende com voltas reais de pilotos reais. O coach mede sua volta contra o recorde e o piloto logo à frente, e diz quais curvas custam mais e o que mudar."), draw: drawCoach, laps: true },
    { k: "live", eyebrow: t("04 · Live", "04 · En vivo", "04 · Ao vivo"), h: t("Live telemetry and overlays", "Telemetría en vivo y overlays", "Telemetria ao vivo e overlays"), p: t("While you drive, the overlays show the race over the game, and your phone or a browser shows the same telemetry live. Share a code and a friend can watch too.", "Mientras conduces, los overlays muestran la carrera sobre el juego, y tu móvil o un navegador muestra la misma telemetría en vivo. Comparte un código y un amigo también puede verla.", "Enquanto você pilota, os overlays mostram a corrida sobre o jogo, e seu celular ou um navegador mostra a mesma telemetria ao vivo. Compartilhe um código e um amigo também pode ver."), live: true },
    { k: "board", eyebrow: t("05 · Community", "05 · Comunidad", "05 · Comunidade"), h: t("Leaderboards and records", "Clasificaciones y récords", "Classificações e recordes"), p: t("The fastest lap of every driver on each car and track, by discipline, and the newest records. Any lap on the board opens as lap B to compare with yours.", "La vuelta más rápida de cada piloto en cada coche y circuito, por disciplina, y los récords más recientes. Cualquier vuelta de la tabla se abre como vuelta B para compararla con la tuya.", "A volta mais rápida de cada piloto em cada carro e pista, por disciplina, e os recordes mais recentes. Qualquer volta da tabela abre como volta B para comparar com a sua."), html: boardHTML, laps: true },
    { k: "race", eyebrow: t("06 · Races", "06 · Carreras", "06 · Corridas"), h: t("Race summaries", "Resúmenes de carrera", "Resumos de corrida"), p: t("After each race: your result, your laps, your incidents, the iRating change and how you compared with the drivers around you. Mark the drivers you meet with your own notes.", "Después de cada carrera: tu resultado, tus vueltas, tus incidentes, el cambio de iRating y cómo te fue frente a los pilotos de alrededor. Marca a los pilotos que te encuentras con tus propias notas.", "Depois de cada corrida: seu resultado, suas voltas, seus incidentes, a mudança de iRating e como você se saiu contra os pilotos ao redor. Marque os pilotos que encontra com suas próprias notas."), draw: drawRace },
  ];
  const MORE = () => [
    [t("Driver notes", "Notas de pilotos", "Notas de pilotos"), t("Mark the drivers you meet: dangerous, careful, clean, friend. The icon shows in the relative, the standings and the race summary.", "Marca a los pilotos que te encuentras: peligroso, cuidado, limpio, amigo. El icono sale en el relativo, la clasificación y el resumen de carrera.", "Marque os pilotos que encontra: perigoso, cuidado, limpo, amigo. O ícone aparece no relativo, na classificação e no resumo da corrida.")],
    [t("Rev beeps", "Pitidos de revoluciones", "Bipes de giros"), t("A beep to change up at the revs you choose, for each car: the same RPM for every gear or one for each, or at the game's shift lights; a moment early for your reaction time.", "Un pitido para subir de marcha a las revoluciones que tú elijas, para cada coche: las mismas RPM en todas las marchas o unas para cada una, o en las luces de cambio del juego; un instante antes para tu tiempo de reacción.", "Um bipe para subir de marcha nos giros que você escolher, para cada carro: os mesmos giros em todas as marchas ou um para cada, ou nas luzes de troca do jogo; um instante antes pelo seu tempo de reação.")],
    [t("Overlays in VR", "Overlays en VR", "Overlays em VR"), t("Every open overlay also shows in the headset through SteamVR, where it sits on your screen.", "Cada overlay abierto se ve también en las gafas a través de SteamVR, donde está en tu pantalla.", "Cada overlay aberto também aparece no headset pelo SteamVR, onde está na sua tela.")],
  ];
  const btns = (end) => `<div class="tr-cta"><button type="button" class="btn primary" data-tr="create">${esc(t("Create account", "Crear cuenta", "Criar conta"))}</button><a class="btn" href="/dl/PitlaneHQ-Setup.exe">${esc(t("Download for Windows", "Descargar para Windows", "Baixar para Windows"))}</a>${end ? `<a class="btn" href="/dl/PitlaneHQ-Android.apk">${esc(t("Download for Android", "Descargar para Android", "Baixar para Android"))}</a>` : ""}</div>`;
  const tag = (sec) => {
    const s = S.data;
    if (sec.laps && s && s.real) return t("Real laps from the leaderboards", "Vueltas reales de la clasificación", "Voltas reais da classificação") + " · " + esc(s.car) + " · " + esc(s.track);
    if (sec.laps && s) return t("Sample data", "Datos de muestra", "Dados de exemplo") + " · " + t("invented laps", "vueltas inventadas", "voltas inventadas");
    if (sec.laps) return t("Loading the laps…", "Cargando las vueltas…", "Carregando as voltas…");
    return t("Sample race", "Carrera de muestra", "Corrida de exemplo") + " · " + t("invented", "inventada", "inventada");
  };

  const S = { el: null, data: null, loading: null, live: { on: false, raf: 0 }, obs: null, anims: new Map() };
  function pageHTML() {
    const secs = SECTIONS().map((s, i) => `<section class="tr-sec${i % 2 ? " flip" : ""}" data-k="${s.k}"><div class="tr-txt tr-rv"><div class="tr-eye">${esc(s.eyebrow)}</div><h2>${esc(s.h)}</h2><p>${esc(s.p)}</p></div><div class="tr-vis tr-rv" style="transition-delay:120ms"><div class="tr-visin"></div><div class="tr-tag">${tag(s)}</div></div></section>`).join("");
    const more = MORE().map(([h, p], i) => `<div class="tr-card tr-rv" style="transition-delay:${i * 100}ms"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("");
    return `<header class="tr-hero"><div class="tr-eye tr-rv">${esc(t("What Pitlane HQ does", "Qué hace Pitlane HQ", "O que o Pitlane HQ faz"))}</div><h1 class="tr-rv" style="transition-delay:80ms">${esc(t("iRacing telemetry, a coach for your laps and overlays", "Telemetría para iRacing, un coach para tus vueltas y overlays", "Telemetria para iRacing, um coach para suas voltas e overlays"))}</h1><p class="tr-lead tr-rv" style="transition-delay:160ms">${esc(t("Pitlane HQ records every lap you drive, shows where you lose time against your best lap, the record and the driver just ahead of you, and draws the race over the game. Free, on Windows, Android and the web.", "Pitlane HQ graba cada vuelta que das, te enseña dónde pierdes tiempo frente a tu mejor vuelta, el récord y el piloto que va justo por delante, y dibuja la carrera sobre el juego. Gratis, en Windows, Android y la web.", "O Pitlane HQ grava cada volta que você dá, mostra onde você perde tempo contra a sua melhor volta, o recorde e o piloto logo à frente, e desenha a corrida sobre o jogo. Grátis, no Windows, Android e na web."))}</p><div class="tr-rv" style="transition-delay:240ms">${btns(false)}</div><p class="tr-comp tr-rv" style="transition-delay:300ms">${esc(t("Or use the companion on your phone to look at your laps and compare them:", "O usa el companion en tu móvil para ver tus vueltas y compararlas:", "Ou use o companion no seu celular para ver suas voltas e compará-las:"))} <a href="/dl/PitlaneHQ-Android.apk">${esc(t("Download for Android", "Descargar para Android", "Baixar para Android"))}</a> · ${esc(t("on iPhone, add this web to the home screen", "en iPhone, añade esta web a la pantalla de inicio", "no iPhone, adicione esta web à tela inicial"))}</p></header>
<main>${secs}<section class="tr-more"><h2 class="tr-rv">${esc(t("And also", "Y además", "E também"))}</h2><div class="tr-grid">${more}</div></section>
<section class="tr-end"><h2 class="tr-rv">${esc(t("Ready when you are", "Cuando quieras", "Quando quiser"))}</h2><p class="tr-lead tr-rv" style="transition-delay:80ms">${esc(t("Create your account: Pitlane HQ Agent on your racing PC records the laps; this web and your phone show them.", "Crea tu cuenta: Pitlane HQ Agent en tu PC de carreras graba las vueltas; esta web y tu móvil las muestran.", "Crie sua conta: o Pitlane HQ Agent no seu PC de corrida grava as voltas; esta web e seu celular as mostram."))}</p><div class="tr-rv" style="transition-delay:160ms">${btns(true)}</div></section></main>
<footer class="tr-foot">Pitlane HQ · <a href="/downloads">${esc(t("Downloads", "Descargas", "Downloads"))}</a> · <a href="/records">${esc(t("Records", "Récords", "Recordes"))}</a> · <a href="/changelog">${esc(t("What's new", "Novedades", "Novidades"))}</a> · <a href="mailto:support@pitlanehq.app">support@pitlanehq.app</a></footer>`;
  }
  // a sample draws itself over 1.4 s once its section is on the screen (at once when motion is reduced)
  function animate(k, vis, draw) {
    if (S.anims.has(k)) return;
    const t0 = performance.now(), dur = reduced() ? 0 : 1400, st = { raf: 0 };
    S.anims.set(k, st);
    const step = () => {
      const f = dur ? Math.min(1, (performance.now() - t0) / dur) : 1, e = 1 - Math.pow(1 - f, 3);
      try { draw(vis, e); } catch (err) { vis.innerHTML = `<p class="note">${esc(String(err && err.message || err))}</p>`; return; }
      if (f < 1) st.raf = requestAnimationFrame(step);
    };
    step();
  }
  function showSection(el) {
    const s = SECTIONS().find((q) => q.k === el.dataset.k), vis = el.querySelector(".tr-visin");
    el.querySelectorAll(".tr-txt.tr-rv, .tr-vis.tr-rv").forEach((r) => r.classList.add("in"));
    if (s.live) { liveStart(vis, S.live); return; }
    if (s.laps && !S.data) return; // the laps are still on their way: drawn when they arrive (dataReady)
    if (s.html) { if (!vis.firstChild) vis.innerHTML = s.html(S.data); requestAnimationFrame(() => vis.querySelectorAll(".tr-rv").forEach((r) => r.classList.add("in"))); }
    else animate(s.k, vis, s.draw);
    if (s.draw === drawCoach || s.draw === drawRace) setTimeout(() => vis.querySelectorAll(".tr-rv").forEach((r) => r.classList.add("in")), 50);
  }
  function observe() {
    if (S.obs) S.obs.disconnect();
    S.obs = new IntersectionObserver((es) => {
      es.forEach((e) => {
        const el = e.target;
        if (el.classList.contains("tr-sec")) { if (e.isIntersecting) showSection(el); else if (el.dataset.k === "live") liveStop(S.live); }
        else if (e.isIntersecting) el.querySelectorAll(".tr-rv").forEach((r) => r.classList.add("in"));
      });
    }, { threshold: 0.18 });
    S.el.querySelectorAll(".tr-sec, .tr-more, .tr-end").forEach((el) => S.obs.observe(el));
    requestAnimationFrame(() => S.el.querySelectorAll(".tr-hero .tr-rv").forEach((r) => r.classList.add("in")));
  }
  // the laps arrived: the tags say where they come from, and the sections already on the screen draw now
  function dataReady() {
    if (!S.el) return;
    S.el.querySelectorAll(".tr-sec").forEach((el) => { const s = SECTIONS().find((q) => q.k === el.dataset.k); el.querySelector(".tr-tag").innerHTML = tag(s); if (s.laps && el.querySelector(".tr-txt.in")) showSection(el); });
  }
  function render() {
    S.el.innerHTML = pageHTML();
    S.anims.forEach((st) => cancelAnimationFrame(st.raf)); S.anims.clear(); liveStop(S.live);
    observe();
    if (!S.data) S.data = cached(); // the real laps of the last visit, at once
    if (S.data) dataReady();
    // the first visit: the laps come from the leaderboards; if they take more than a moment the invented sample
    // shows meanwhile and the real laps take its place when they arrive
    const wait = S.data ? null : setTimeout(() => { if (!S.data) { S.data = invented(); dataReady(); } }, 900);
    if (!S.loading) S.loading = loadData().then((d) => {
      clearTimeout(wait);
      if (!d) { if (!S.data) { S.data = invented(); dataReady(); } return; }
      const was = S.data; S.data = d;
      if (!was) dataReady(); else if (!was.real) redrawLaps();
    }).catch(() => { clearTimeout(wait); if (!S.data) { S.data = invented(); dataReady(); } });
  }
  // the real laps arrived after the sample: the sections that show laps draw again with them
  function redrawLaps() {
    if (!S.el) return;
    S.el.querySelectorAll(".tr-sec").forEach((el) => {
      const s = SECTIONS().find((q) => q.k === el.dataset.k); if (!s || !s.laps) return;
      const st = S.anims.get(s.k); if (st) cancelAnimationFrame(st.raf); S.anims.delete(s.k);
      el.querySelector(".tr-visin").innerHTML = ""; el.querySelector(".tr-tag").innerHTML = tag(s);
      if (el.querySelector(".tr-txt.in")) showSection(el);
    });
  }
  function unmount() {
    if (!S.el) return;
    liveStop(S.live); S.anims.forEach((st) => cancelAnimationFrame(st.raf)); S.anims.clear();
    if (S.obs) S.obs.disconnect(); clearInterval(S.langT); S.el.remove(); S.el = null;
  }
  function mount() {
    if (S.el) return;
    const me = document.getElementById("meBody"); if (!me) return;
    const el = document.createElement("div"); el.id = "tour";
    me.insertAdjacentElement("afterend", el); S.el = el; render();
    // the language window sits over the page: once chosen, the page says it in that language
    S.lang = L(); S.langT = setInterval(() => { if (!S.el) { clearInterval(S.langT); return; } if (L() !== S.lang) { S.lang = L(); render(); } }, 400);
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tr]"); if (!b) return;
      const a = b.dataset.tr;
      if (a === "create") {
        scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => { const btn = [...me.querySelectorAll("button, a")].find((x) => /crear|create|criar/i.test(x.textContent || "")); if (btn) btn.click(); const f = me.querySelector("input"); if (f) f.focus({ preventScroll: true }); }, 450);
      }
    });
    let rw = 0; addEventListener("resize", () => { if (!S.el) return; clearTimeout(rw); rw = setTimeout(() => { S.anims.clear(); S.el.querySelectorAll(".tr-sec").forEach((sec) => { const s = SECTIONS().find((q) => q.k === sec.dataset.k); if (s && s.draw && sec.querySelector(".tr-txt.in") && (!s.laps || S.data)) try { s.draw(sec.querySelector(".tr-visin"), 1); } catch (e) {} }); }, 150); });
  }
  /** Called by the sign wall (index.html) each time it changes: the page sits under the sign-in while it is up. */
  function maybeOpen(wallOn) { if (wallOn) mount(); else unmount(); }

  const st = document.createElement("style");
  st.textContent = `#tour{margin-top:34px;color:var(--fg)}
#tour .tr-hero{max-width:900px;margin:0 auto;padding:30px 0 22px;text-align:center;border-top:1px solid var(--line)}
#tour h1{font:700 42px/1.05 var(--f-display);letter-spacing:.02em;margin:10px 0 12px}#tour .tr-lead{font-size:17px;color:var(--muted);margin:0 auto 20px;max-width:680px}
#tour .tr-cta{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}#tour .tr-comp{color:var(--muted);font-size:14px;margin:16px auto 0;max-width:640px}#tour .tr-comp a{color:var(--accent);font-weight:600}#tour .tr-cta .btn{text-decoration:none}
#tour main{max-width:1080px;margin:0 auto}
#tour .tr-sec{display:grid;grid-template-columns:1fr 1.3fr;gap:30px;align-items:center;padding:34px 0;border-top:1px solid var(--line)}#tour .tr-sec.flip .tr-txt{order:2}
#tour .tr-eye{color:var(--accent);font:700 11px/1 var(--f-data);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px}#tour h2{font:700 32px/1.1 var(--f-display);letter-spacing:.02em;margin:0 0 10px}#tour .tr-txt p{color:var(--muted);font-size:16px;margin:0;line-height:1.55}
#tour .tr-vis{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.35)}#tour .tr-visin{min-height:90px}#tour .tr-tag{color:var(--muted);font:600 10px/1.4 var(--f-data);letter-spacing:.06em;text-transform:uppercase;margin-top:10px}
#tour .tr-rv{opacity:0;transform:translateY(16px);transition:opacity .55s ease,transform .55s ease}#tour .tr-rv.in{opacity:1;transform:none}
#tour .tr-more{padding:34px 0 10px;border-top:1px solid var(--line)}#tour .tr-more h2{text-align:center;margin-bottom:16px}#tour .tr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}#tour .tr-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}#tour .tr-card h3{font:700 18px/1.2 var(--f-display);margin:0 0 6px}#tour .tr-card p{color:var(--muted);font-size:14px;margin:0;line-height:1.5}
#tour .tr-end{text-align:center;padding:44px 0 30px;border-top:1px solid var(--line);margin-top:24px}#tour .tr-end h2{font-size:38px}
#tour .tr-foot{border-top:1px solid var(--line);padding:20px 0 8px;text-align:center;color:var(--muted);font-size:13px}#tour .tr-foot a{color:var(--accent);text-decoration:none}
#tour .tr-coach{display:grid;grid-template-columns:minmax(180px,1fr) 1.4fr;gap:14px;align-items:center}#tour .tr-coach.nomap{grid-template-columns:1fr}#tour .tr-coach.nomap .tr-cmap{display:none}#tour .tr-gap{font:600 14px/1.4 var(--f-body);color:var(--muted);margin-bottom:8px}#tour .tr-gap b{color:var(--bad);font-family:var(--f-data)}
#tour .tr-crow{display:grid;grid-template-columns:44px 72px 1fr;gap:4px 10px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:10px;margin:6px 0;background:var(--surface2)}#tour .tr-cn{font:700 16px/1 var(--f-display);color:var(--accent)}#tour .tr-cl{font:600 13px/1 var(--f-data);color:var(--bad)}#tour .tr-ct{font-size:14px}#tour .tr-cv{font:500 11px/1 var(--f-data);color:var(--muted);grid-column:2/4}
#tour .tr-scroll{overflow:auto;max-width:100%}#tour .tr-board table{width:100%;border-collapse:collapse;font-size:14px}#tour .tr-board td.t,#tour .tr-board td.g{white-space:nowrap}#tour .tr-board th{text-align:left;color:var(--muted);font:600 11px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line)}#tour .tr-board td{padding:8px;border-bottom:1px solid var(--line)}#tour .tr-board td.t{font-family:var(--f-data);color:var(--accent)}#tour .tr-board td.g{font-family:var(--f-data);color:var(--muted)}#tour .tr-board tr.rec td.t{font-weight:700}
#tour .tr-bh{display:flex;justify-content:space-between;gap:10px;font:700 18px/1.2 var(--f-display);margin:2px 4px 8px}#tour .tr-bh .tr-bt{color:var(--muted);font-weight:600}#tour .tr-pill{display:inline-block;background:var(--pb);color:#11151b;font:700 10px/1 var(--f-data);padding:3px 6px;border-radius:10px;margin-left:6px;vertical-align:middle}
#tour .tr-note{color:var(--muted);font-size:13px;margin:10px 4px 0}
#tour .tr-rh{display:flex;justify-content:space-between;gap:10px;font:700 18px/1.2 var(--f-display);margin:2px 4px 10px}#tour .tr-rh span{color:var(--muted);font-weight:600}
#tour .tr-rk{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px}#tour .tr-rk>div{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:3px}#tour .tr-rk i{font:600 10px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-style:normal}#tour .tr-rk b{font:700 22px/1.1 var(--f-display)}#tour .tr-rk b.up{color:var(--good)}#tour .tr-rk b.dn{color:var(--bad)}#tour .tr-rk s{text-decoration:none;color:var(--muted);font-size:12px}
#tour .tr-delta{position:relative;height:28px;border-radius:14px;background:var(--surface2);border:1px solid var(--line);overflow:hidden;margin-bottom:10px}#tour .tr-delta i{position:absolute;top:0;bottom:0;left:50%;width:0;opacity:.85}#tour .tr-delta b{position:absolute;inset:0;display:grid;place-items:center;font:700 14px/1 var(--f-data)}
#tour .tr-rel{display:grid;gap:4px}#tour .tr-rr{display:grid;grid-template-columns:28px 44px 1fr 70px;gap:8px;align-items:center;padding:6px 10px;border-radius:8px;background:var(--surface2);font:500 14px/1.2 var(--f-body)}#tour .tr-rr.me{background:rgba(255,176,46,.18);border:1px solid var(--accent)}#tour .tr-rr .n{font-family:var(--f-data);color:var(--muted)}#tour .tr-rr .g{text-align:right;font-family:var(--f-data);color:var(--muted)}
@media(max-width:760px){#tour h1{font-size:30px}#tour .tr-lead{font-size:15px}#tour h2{font-size:26px}#tour .tr-end h2{font-size:30px}
#tour .tr-sec{grid-template-columns:1fr;gap:16px;padding:26px 0}#tour .tr-sec.flip .tr-txt{order:0}#tour .tr-vis{padding:10px 8px}#tour .tr-cta .btn{flex:1 1 45%}
#tour .tr-coach{grid-template-columns:1fr}#tour .tr-crow{grid-template-columns:40px 60px 1fr}#tour .tr-board td,#tour .tr-board th{padding:6px 5px;font-size:13px}}`;
  document.head.appendChild(st);
  window.PITLANE_TOUR = { mount, unmount, maybeOpen };
})();
