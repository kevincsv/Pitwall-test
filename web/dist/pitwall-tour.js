/* The web's first screen for a visitor (not signed in): one page that says what Pitlane HQ does, like a product
   site (RaceLab, Track Titan…): a hero, then every feature as a section with a live sample drawn from the invented
   data of pitwall-demo.js (a lap, two laps compared, the coach's corners, the live relative, a leaderboard, a race
   summary), each one drawing itself as you scroll down to it; then what else there is, and the calls to action.
   "Try it with sample data" opens the app itself on that sample data (a visitor only: nothing is uploaded, and the
   banner on every screen says so); Sign in, Create account and the download stay one click away at the top and the
   bottom. Shown once per browser; "What Pitlane HQ does" on the sign-in screen opens it again. The web only
   (COMPANION): the PC app and the phones have their own first screens. */
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

  // ---------- the sample: your best lap of the race at Spa (A), the record of the car there (B), a race, a board ----------
  let SMP = null;
  function sample() {
    if (SMP || !D()) return SMP;
    const a = D().get("/api/laps/demo:0:r:3"), b = D().get("/api/community/laps?id=comm:0:0"), races = (D().get("/api/races") || {}).races || [], board = (D().get("/api/community/laps?trackId=163&carId=169") || {}).laps;
    if (!a || !b) return null;
    const race = races.slice().sort((p, q) => Math.abs(q.finish - q.start) - Math.abs(p.finish - p.start))[0];
    SMP = { a, b, race, board: board || [], track: a.track, car: a.car };
    return SMP;
  }
  // the corners of lap B: the dips of its speed (the slowest point of each) and where its braking starts
  function corners(tr) {
    const d = tr.d, n = d.length, out = [];
    for (let i = 12; i < n - 12; i++) {
      let min = true;
      for (let k = i - 12; k <= i + 12; k++) if (d[k][0] < d[i][0]) { min = false; break; }
      if (!min || (out.length && i - out[out.length - 1].i < 25)) continue;
      let b = i; while (b > 0 && d[b - 1][2] > 0.05) b--;
      out.push({ i, b, v: d[i][0] });
    }
    return out.filter((c) => c.v < 50).slice(0, 12);
  }
  // what the coach says of each corner: where the time went between A and B, and the plainest reason
  function coachRows(s) {
    const A = s.a.trace, B = s.b.trace, n = Math.min(A.d.length, B.d.length);
    return corners(B).map((c, k) => {
      const e = Math.min(n - 1, c.i + 20), i0 = Math.max(0, c.b - 10);
      const loss = (A.d[e][5] - A.d[i0][5]) - (B.d[e][5] - B.d[i0][5]);
      let ab = c.i; while (ab > 0 && A.d[ab - 1][2] > 0.05) ab--;
      let av = A.d[c.i][0]; for (let j = Math.max(0, c.i - 6); j < Math.min(n, c.i + 6); j++) av = Math.min(av, A.d[j][0]);
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
    const [sx, sy] = P(0), [nx, ny] = P(3), ang = Math.atan2(ny - sy, nx - sx);
    x.save(); x.translate(sx, sy); x.rotate(ang); x.fillStyle = "#e7ebf1"; x.fillRect(-1.5, -6, 3, 12); x.restore();
    (marks || []).forEach((k) => { if (k.i > m) return; const [a, b] = P(k.i); x.beginPath(); x.arc(a, b, 7, 0, 7); x.fillStyle = k.c || col("--accent", "#ffb02e"); x.fill(); x.fillStyle = "#11151b"; x.font = "700 9px 'JetBrains Mono',monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(k.t, a, b); });
  }
  function trace(x, d, X, Y, W, H, pick, color, lw, vmax, f) {
    const n = d.length, m = Math.max(2, Math.round(n * f)); x.beginPath(); x.lineWidth = lw; x.strokeStyle = color;
    for (let i = 0; i < m; i++) { const px = X + (i / (n - 1)) * W, py = Y + H - (pick(d[i]) / vmax) * H; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  function grid(x, X, Y, W, H) { x.strokeStyle = "rgba(138,151,169,.18)"; x.lineWidth = 1; for (let k = 0; k <= 4; k++) { const y = Y + (H * k) / 4; x.beginPath(); x.moveTo(X, y); x.lineTo(X + W, y); x.stroke(); } }
  function label(x, s, X, Y, c, align) { x.fillStyle = c || col("--muted", "#8a97a9"); x.font = "600 11px 'JetBrains Mono',ui-monospace,monospace"; x.textAlign = align || "left"; x.textBaseline = "top"; x.fillText(s, X, Y); }

  function drawLap(box, f) {
    const s = sample(); if (!s) return;
    const d = s.a.trace.d, n = d.length, narrow = (box.clientWidth || 800) < 620;
    const { x, w } = cv(box, narrow ? 420 : 250), mapW = narrow ? w - 24 : Math.min(230, w * 0.32), W = narrow ? w - 24 : w - mapW - 36, X = 12, Y = 26, H = narrow ? 120 : 150;
    grid(x, X, Y, W, H);
    const m = Math.round(n * f); x.fillStyle = "rgba(255,99,99,.13)";
    for (let i = 0; i < m; i++) if (d[i][2] > 0.05) x.fillRect(X + (i / (n - 1)) * W, Y, Math.max(1, W / n + 0.5), H);
    trace(x, d, X, Y + H + 8, W, 44, (r) => r[1], col("--good", "#38c97c"), 1.2, 1, f);
    trace(x, d, X, Y + H + 8, W, 44, (r) => r[2], col("--bad", "#ff6363"), 1.2, 1, f);
    trace(x, d, X, Y, W, H, (r) => r[0] * 3.6, col("--accent", "#ffb02e"), 2, 290, f);
    label(x, narrow ? t("SPEED km/h · red: braking", "VELOCIDAD km/h · rojo: frenadas", "VELOCIDADE km/h · vermelho: frenagens") : t("SPEED km/h · the red bands are the braking", "VELOCIDAD km/h · las bandas rojas son las frenadas", "VELOCIDADE km/h · as faixas vermelhas são as frenagens"), X, 6);
    label(x, t("THROTTLE · BRAKE", "ACELERADOR · FRENO", "ACELERADOR · FREIO"), X, Y + H + 8 + 44 + 4);
    label(x, "290", X + W, Y + 2, null, "right"); label(x, "0", X + W, Y + H - 14, null, "right");
    if (narrow) { road(x, s.a.trace, 12, Y + H + 76, mapW, 190, null, f); label(x, s.track, w / 2, 402, null, "center"); }
    else { road(x, s.a.trace, w - mapW - 12, 10, mapW, 230, null, f); label(x, s.track, w - mapW - 12, 232); }
  }
  function drawCompare(box, f) {
    const s = sample(); if (!s) return;
    const { x, w } = cv(box, 250), A = s.a.trace.d, B = s.b.trace.d, n = Math.min(A.length, B.length), X = 12, W = w - 24, Y = 26, H = 130;
    grid(x, X, Y, W, H);
    trace(x, A.slice(0, n), X, Y, W, H, (r) => r[0] * 3.6, col("--accent", "#ffb02e"), 2.2, 290, f);
    x.setLineDash([5, 4]); trace(x, B.slice(0, n), X, Y, W, H, (r) => r[0] * 3.6, col("--pb", "#b98cff"), 1.6, 290, f); x.setLineDash([]);
    label(x, t("A · your lap", "A · tu vuelta", "A · sua volta") + " " + fmt(s.a.time), X, 6, col("--accent", "#ffb02e"));
    label(x, "B · " + s.b.alias + " " + fmt(s.b.time), X + W, 6, col("--pb", "#b98cff"), "right");
    const Y2 = Y + H + 26, H2 = 60, dl = []; let mx = 0.05;
    for (let i = 0; i < n; i++) { const v = A[i][5] - B[i][5]; dl.push(v); mx = Math.max(mx, Math.abs(v)); }
    grid(x, X, Y2, W, H2); x.beginPath(); x.moveTo(X, Y2 + H2 / 2); x.lineTo(X + W, Y2 + H2 / 2); x.strokeStyle = "rgba(231,235,241,.4)"; x.stroke();
    const m = Math.max(2, Math.round(n * f)); x.beginPath(); for (let i = 0; i < m; i++) { const px = X + (i / (n - 1)) * W, py = Y2 + H2 / 2 - (dl[i] / mx) * (H2 / 2); i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.lineWidth = 2; x.strokeStyle = dl[m - 1] > 0 ? col("--bad", "#ff6363") : col("--good", "#38c97c"); x.stroke();
    label(x, t("GAP A − B · above the line A is losing", "DIFERENCIA A − B · por encima de la línea A pierde", "DIFERENÇA A − B · acima da linha A perde") + " · " + sgn(dl[m - 1]) + " s", X, Y2 - 16);
  }
  function coachHTML(s) {
    const all = coachRows(s), top = all.slice().sort((p, q) => q.loss - p.loss).slice(0, 3);
    return `<div class="tr-coach"><div class="tr-cmap"></div><div class="tr-clist"><div class="tr-gap">${esc(t("Gap to the record", "Diferencia con el récord", "Diferença para o recorde"))} <b>${sgn(s.a.time - s.b.time)} s</b></div>${top.map((r, k) => `<div class="tr-crow tr-rv" style="transition-delay:${300 + k * 160}ms"><span class="tr-cn">T${r.n}</span><span class="tr-cl">${sgn(r.loss, 2)} s</span><span class="tr-ct">${esc(r.tip)}</span><span class="tr-cv">${Math.round(r.av * 3.6)} / ${Math.round(r.bv * 3.6)} km/h</span></div>`).join("")}</div></div>`;
  }
  function drawCoach(box, f) {
    const s = sample(); if (!s) return;
    if (!box.firstChild) box.innerHTML = coachHTML(s);
    const all = coachRows(s), top = all.slice().sort((p, q) => q.loss - p.loss).slice(0, 3), mapBox = box.querySelector(".tr-cmap"), { x, w } = cv(mapBox, 230);
    road(x, s.b.trace, 0, 0, w, 230, all.map((r) => ({ i: r.i, t: "T" + r.n, c: top.includes(r) ? col("--bad", "#ff6363") : "#8a97a9" })), f);
  }
  function boardHTML(s) {
    const b = s.board.slice(0, 6), best = b[0] && b[0].time;
    return `<div class="tr-board"><div class="tr-bh"><span>${esc(s.car)}</span><span class="tr-bt">${esc(s.track)}</span></div><div class="tr-scroll"><table><thead><tr><th>#</th><th>${esc(t("Driver", "Piloto", "Piloto"))}</th><th>${esc(t("Time", "Tiempo", "Tempo"))}</th><th>${esc(t("Gap", "Dif.", "Dif."))}</th></tr></thead><tbody>${b.map((l, i) => `<tr class="tr-rv${i === 0 ? " rec" : ""}" style="transition-delay:${150 + i * 110}ms"><td>${i + 1}</td><td>${esc(l.alias)}${i === 0 ? ' <span class="tr-pill">★ ' + esc(t("Record", "Récord", "Recorde")) + "</span>" : ""}</td><td class="t">${fmt(l.time)}</td><td class="g">${i ? "+" + (l.time - best).toFixed(3) : ""}</td></tr>`).join("")}</tbody></table></div><p class="tr-note">${esc(t("Oval · Sports Car · Formula Car · Dirt Oval · Dirt Road. Your fastest lap of each car and track goes up by itself, under your name or as Anonymous.", "Óvalo · Sports Car · Fórmula · Óvalo de tierra · Tierra. Tu vuelta más rápida de cada coche y circuito sube sola, con tu nombre o como Anónimo.", "Oval · Sports Car · Fórmula · Oval de terra · Terra. Sua volta mais rápida de cada carro e pista sobe sozinha, com seu nome ou como Anônimo."))}</p></div>`;
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
    const s = sample(); if (!s || !s.race) return;
    const r = s.race; if (!box.firstChild) box.innerHTML = raceHTML(r);
    const cb = box.querySelector(".tr-rc"), { x, w } = cv(cb, 90), laps = r.laps || [], n = laps.length, m = Math.max(2, Math.round(n * f)), X = 12, W = w - 24, Y = 14, H = 60;
    grid(x, X, Y, W, H);
    const P = (i) => [X + (i / Math.max(1, n - 1)) * W, Y + ((laps[i].p - 1) / Math.max(1, r.field - 1)) * H];
    x.beginPath(); for (let i = 0; i < m; i++) { const [px, py] = P(i); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.lineWidth = 2; x.strokeStyle = col("--accent", "#ffb02e"); x.stroke();
    for (let i = 0; i < m; i++) { if (!laps[i].i) continue; const [px, py] = P(i); x.beginPath(); x.arc(px, py, 4, 0, 7); x.fillStyle = col("--bad", "#ff6363"); x.fill(); }
    label(x, t("POSITION LAP BY LAP · red: an incident", "POSICIÓN VUELTA A VUELTA · rojo: un incidente", "POSIÇÃO VOLTA A VOLTA · vermelho: um incidente"), X, 0);
  }
  // the live relative and the delta bar, moving while they are on the screen: the invented race, you are car 13
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
    { k: "lap", eyebrow: t("01 · Telemetry", "01 · Telemetría", "01 · Telemetria"), h: t("Every lap, recorded", "Cada vuelta, grabada", "Cada volta, gravada"), p: t("Pitlane HQ Agent runs next to iRacing on your PC and saves speed, throttle, brake, gear and steering of every lap, with nothing to set up. The laps go to your account: open them later on the web or on your phone.", "Pitlane HQ Agent funciona junto a iRacing en tu PC y guarda velocidad, acelerador, freno, marcha y volante de cada vuelta, sin configurar nada. Las vueltas van a tu cuenta: ábrelas luego en la web o en el móvil.", "O Pitlane HQ Agent roda junto ao iRacing no seu PC e guarda velocidade, acelerador, freio, marcha e volante de cada volta, sem configurar nada. As voltas vão para sua conta: abra-as depois na web ou no celular."), draw: drawLap },
    { k: "cmp", eyebrow: t("02 · Analysis", "02 · Análisis", "02 · Análise"), h: t("Compare two laps", "Compara dos vueltas", "Compare duas voltas"), p: t("Your lap against your best, against another session or against the record of the leaderboard: the speed along the lap and where the time goes, metre by metre, with the braking points and the track map.", "Tu vuelta frente a tu mejor, frente a otra sesión o frente al récord de la clasificación: la velocidad a lo largo de la vuelta y dónde se va el tiempo, metro a metro, con los puntos de frenada y el mapa del circuito.", "Sua volta contra a sua melhor, contra outra sessão ou contra o recorde da classificação: a velocidade ao longo da volta e onde o tempo vai, metro a metro, com os pontos de frenagem e o mapa da pista."), draw: drawCompare },
    { k: "coach", eyebrow: t("03 · Coach", "03 · Coach", "03 · Coach"), h: t("A coach that uses real laps", "Un coach con vueltas reales", "Um coach com voltas reais"), p: t("For each car and track Pitlane HQ learns from real laps of real drivers. The coach measures your lap against the record and the driver just ahead of you, and tells you which corners cost the most and what to change.", "Para cada coche y circuito, Pitlane HQ aprende de vueltas reales de pilotos reales. El coach mide tu vuelta frente al récord y al piloto que va justo por delante, y te dice qué curvas te cuestan más y qué cambiar.", "Para cada carro e pista, o Pitlane HQ aprende com voltas reais de pilotos reais. O coach mede sua volta contra o recorde e o piloto logo à frente, e diz quais curvas custam mais e o que mudar."), draw: drawCoach },
    { k: "live", eyebrow: t("04 · Live", "04 · En vivo", "04 · Ao vivo"), h: t("Live telemetry and overlays", "Telemetría en vivo y overlays", "Telemetria ao vivo e overlays"), p: t("While you drive, the overlays show the race over the game, and your phone or a browser shows the same telemetry live. Share a code and a friend or your engineer can watch too.", "Mientras conduces, los overlays muestran la carrera sobre el juego, y tu móvil o un navegador muestra la misma telemetría en vivo. Comparte un código y un amigo o tu ingeniero también puede verla.", "Enquanto você pilota, os overlays mostram a corrida sobre o jogo, e seu celular ou um navegador mostra a mesma telemetria ao vivo. Compartilhe um código e um amigo ou seu engenheiro também pode ver."), live: true },
    { k: "board", eyebrow: t("05 · Community", "05 · Comunidad", "05 · Comunidade"), h: t("Leaderboards and records", "Clasificaciones y récords", "Classificações e recordes"), p: t("The fastest lap of every driver on each car and track, by discipline, and the newest records. Any lap on the board opens as lap B to compare with yours.", "La vuelta más rápida de cada piloto en cada coche y circuito, por disciplina, y los récords más recientes. Cualquier vuelta de la tabla se abre como vuelta B para compararla con la tuya.", "A volta mais rápida de cada piloto em cada carro e pista, por disciplina, e os recordes mais recentes. Qualquer volta da tabela abre como volta B para comparar com a sua."), html: (s) => boardHTML(s) },
    { k: "race", eyebrow: t("06 · Races", "06 · Carreras", "06 · Corridas"), h: t("Race summaries", "Resúmenes de carrera", "Resumos de corrida"), p: t("After each race: your result, your laps, your incidents, the iRating change and how you compared with the drivers around you. Mark the drivers you meet with your own notes.", "Después de cada carrera: tu resultado, tus vueltas, tus incidentes, el cambio de iRating y cómo te fue frente a los pilotos de alrededor. Marca a los pilotos que te encuentras con tus propias notas.", "Depois de cada corrida: seu resultado, suas voltas, seus incidentes, a mudança de iRating e como você se saiu contra os pilotos ao redor. Marque os pilotos que encontra com suas próprias notas."), draw: drawRace },
  ];
  const MORE = () => [
    [t("Driver notes", "Notas de pilotos", "Notas de pilotos"), t("Mark the drivers you meet: dangerous, careful, clean, friend. The icon shows in the relative, the standings and the race summary; the engineer warns you when one is close.", "Marca a los pilotos que te encuentras: peligroso, cuidado, limpio, amigo. El icono sale en el relativo, la clasificación y el resumen de carrera; el ingeniero te avisa cuando uno está cerca.", "Marque os pilotos que encontra: perigoso, cuidado, limpo, amigo. O ícone aparece no relativo, na classificação e no resumo da corrida; o engenheiro avisa quando um está perto.")],
    [t("Braking beeps", "Pitidos de frenada", "Bipes de frenagem"), t("One or three beeps before each braking point, from the fastest laps the model knows, earlier when a car is close ahead.", "Uno o tres pitidos antes de cada punto de frenada, según las vueltas más rápidas que conoce el modelo, antes si hay un coche cerca por delante.", "Um ou três bipes antes de cada ponto de frenagem, das voltas mais rápidas que o modelo conhece, antes quando há um carro perto à frente.")],
    [t("Overlays in VR", "Overlays en VR", "Overlays em VR"), t("Every open overlay also shows in the headset through SteamVR, where it sits on your screen.", "Cada overlay abierto se ve también en las gafas a través de SteamVR, donde está en tu pantalla.", "Cada overlay aberto também aparece no headset pelo SteamVR, onde está na sua tela.")],
    [t("One account everywhere", "Una cuenta en todas partes", "Uma conta em todo lugar"), t("The PC, this web and the Android app: your races, laps, analysis and live telemetry, in sync by themselves.", "El PC, esta web y la app de Android: tus carreras, vueltas, análisis y telemetría en vivo, sincronizados solos.", "O PC, esta web e o app Android: suas corridas, voltas, análises e telemetria ao vivo, sincronizados sozinhos.")],
  ];
  const btns = () => `<div class="tr-cta"><button type="button" class="btn primary" data-tr="sample">${esc(t("Try it with sample data", "Pruébalo con datos de muestra", "Experimente com dados de exemplo"))}</button><button type="button" class="btn" data-tr="create">${esc(t("Create account", "Crear cuenta", "Criar conta"))}</button><button type="button" class="btn" data-tr="signin">${esc(t("Sign in", "Iniciar sesión", "Entrar"))}</button><a class="btn" href="/dl/PitlaneHQ-Setup.exe">${esc(t("Download for Windows", "Descargar para Windows", "Baixar para Windows"))}</a></div>`;

  const S = { el: null, live: { on: false, raf: 0 }, obs: null, anims: new Map() };
  function pageHTML() {
    const secs = SECTIONS().map((s, i) => `<section class="tr-sec${i % 2 ? " flip" : ""}" data-k="${s.k}"><div class="tr-txt tr-rv"><div class="tr-eye">${esc(s.eyebrow)}</div><h2>${esc(s.h)}</h2><p>${esc(s.p)}</p></div><div class="tr-vis tr-rv" style="transition-delay:120ms"><div class="tr-visin"></div><div class="tr-tag">${esc(t("Sample data", "Datos de muestra", "Dados de exemplo"))} · ${esc(t("drawn from invented laps", "de vueltas inventadas", "de voltas inventadas"))}</div></div></section>`).join("");
    const more = MORE().map(([h, p], i) => `<div class="tr-card tr-rv" style="transition-delay:${i * 100}ms"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("");
    return `<div class="tr-top"><span class="tr-brand"><img src="icon-192.png" alt="" width="26" height="26">PITLANE HQ</span><span class="tr-sp"></span><button type="button" class="btn tr-sm" data-tr="signin">${esc(t("Sign in", "Iniciar sesión", "Entrar"))}</button><button type="button" class="btn primary tr-sm tr-hp" data-tr="create">${esc(t("Create account", "Crear cuenta", "Criar conta"))}</button><button type="button" class="tr-x" data-tr="close" aria-label="${esc(t("Close", "Cerrar", "Fechar"))}">×</button></div>
<header class="tr-hero"><img class="tr-rv" src="icon-192.png" alt="" width="84" height="84"><h1 class="tr-rv" style="transition-delay:80ms">${esc(t("iRacing telemetry, a coach for your laps and overlays", "Telemetría para iRacing, un coach para tus vueltas y overlays", "Telemetria para iRacing, um coach para suas voltas e overlays"))}</h1><p class="tr-lead tr-rv" style="transition-delay:160ms">${esc(t("Pitlane HQ records every lap you drive, shows where you lose time against your best lap, the record and the driver just ahead of you, and draws the race over the game. Free, on Windows, Android and the web.", "Pitlane HQ graba cada vuelta que das, te enseña dónde pierdes tiempo frente a tu mejor vuelta, el récord y el piloto que va justo por delante, y dibuja la carrera sobre el juego. Gratis, en Windows, Android y la web.", "O Pitlane HQ grava cada volta que você dá, mostra onde você perde tempo contra a sua melhor volta, o recorde e o piloto logo à frente, e desenha a corrida sobre o jogo. Grátis, no Windows, Android e na web."))}</p><div class="tr-rv" style="transition-delay:240ms">${btns()}</div><p class="tr-free tr-rv" style="transition-delay:320ms">${esc(t("Free · one account for the PC, the web and your phone", "Gratis · una cuenta para el PC, la web y tu móvil", "Grátis · uma conta para o PC, a web e o seu celular"))}</p></header>
<main>${secs}<section class="tr-more"><h2 class="tr-rv">${esc(t("And also", "Y además", "E também"))}</h2><div class="tr-grid">${more}</div></section>
<section class="tr-end"><h2 class="tr-rv">${esc(t("Ready when you are", "Cuando quieras", "Quando quiser"))}</h2><p class="tr-lead tr-rv" style="transition-delay:80ms">${esc(t("Look around with sample data, or create your account: Pitlane HQ Agent on your racing PC records the laps; this web and your phone show them.", "Echa un vistazo con datos de muestra, o crea tu cuenta: Pitlane HQ Agent en tu PC de carreras graba las vueltas; esta web y tu móvil las muestran.", "Dê uma olhada com dados de exemplo, ou crie sua conta: o Pitlane HQ Agent no seu PC de corrida grava as voltas; esta web e seu celular as mostram."))}</p><div class="tr-rv" style="transition-delay:160ms">${btns()}</div></section></main>
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
  function observe() {
    const secs = SECTIONS();
    S.obs = new IntersectionObserver((es) => {
      es.forEach((e) => {
        const el = e.target;
        if (el.classList.contains("tr-sec")) {
          const s = secs.find((q) => q.k === el.dataset.k), vis = el.querySelector(".tr-visin");
          if (e.isIntersecting) {
            el.querySelectorAll(".tr-rv").forEach((r) => r.classList.add("in"));
            if (s.live) liveStart(vis, S.live);
            else if (s.html) { if (!vis.firstChild) { vis.innerHTML = s.html(sample() || { board: [], car: "", track: "" }); } requestAnimationFrame(() => vis.querySelectorAll(".tr-rv").forEach((r) => r.classList.add("in"))); }
            else animate(s.k, vis, s.draw);
            if (s.draw === drawCoach || s.draw === drawRace) setTimeout(() => vis.querySelectorAll(".tr-rv").forEach((r) => r.classList.add("in")), 50);
          } else if (s.live) liveStop(S.live);
        } else if (e.isIntersecting) el.querySelectorAll(".tr-rv").forEach((r) => r.classList.add("in"));
      });
    }, { root: S.el, threshold: 0.18 });
    S.el.querySelectorAll(".tr-sec, .tr-more, .tr-end").forEach((el) => S.obs.observe(el));
    requestAnimationFrame(() => S.el.querySelectorAll(".tr-hero .tr-rv").forEach((r) => r.classList.add("in")));
  }
  function render() {
    S.el.innerHTML = pageHTML();
    if (S.obs) S.obs.disconnect();
    S.anims.forEach((st) => cancelAnimationFrame(st.raf)); S.anims.clear(); liveStop(S.live);
    observe();
  }
  function close(seen) {
    if (!S.el) return;
    liveStop(S.live); S.anims.forEach((st) => cancelAnimationFrame(st.raf)); S.anims.clear();
    if (S.obs) S.obs.disconnect(); clearInterval(S.langT); S.el.remove(); S.el = null; document.documentElement.classList.remove("tour");
    if (seen) { try { localStorage.setItem("pw.tourSeen", "1"); } catch (e) {} }
  }
  function open() {
    if (S.el) return;
    const el = document.createElement("div"); el.id = "tour"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Pitlane HQ");
    document.body.appendChild(el); S.el = el; document.documentElement.classList.add("tour"); render();
    // the language window sits over this one: once chosen, the page says it in that language
    S.lang = L(); S.langT = setInterval(() => { if (!S.el) { clearInterval(S.langT); return; } if (L() !== S.lang) { S.lang = L(); render(); } }, 400);
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tr]"); if (!b) return;
      const a = b.dataset.tr;
      if (a === "close" || a === "signin" || a === "create") { close(true); try { show("me"); if (a === "create") setTimeout(() => { const f = document.querySelector("#meBody [name=display],#meBody #mrName,#meBody input[autocomplete=nickname]"); if (f) f.focus(); }, 300); } catch (e) {} }
      else if (a === "sample") { close(true); try { localStorage.setItem("pw.sample", "1"); } catch (e) {} try { signWall(); show("home"); demoBanner(); } catch (e) {} }
    });
    el.tabIndex = -1; el.focus();
    el.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { close(true); try { show("me"); } catch (e) {} } });
    let rw = 0; addEventListener("resize", () => { if (!S.el) return; clearTimeout(rw); rw = setTimeout(() => { S.anims.clear(); S.el.querySelectorAll(".tr-sec").forEach((sec) => { const s = SECTIONS().find((q) => q.k === sec.dataset.k); if (s && s.draw && sec.classList.contains("tr-sec") && sec.querySelector(".tr-rv.in")) try { s.draw(sec.querySelector(".tr-visin"), 1); } catch (e) {} }); }, 150); });
  }
  // the small button on the sign-in screen, while the sign wall is up
  function button(on) {
    let b = document.getElementById("tourBtn");
    if (!on) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement("button"); b.id = "tourBtn"; b.type = "button"; b.className = "btn"; b.textContent = "▶ " + t("What Pitlane HQ does", "Qué hace Pitlane HQ", "O que o Pitlane HQ faz");
    b.onclick = () => open(); document.body.appendChild(b);
  }
  /** Called by the sign wall (index.html) each time it changes: the first visit opens the page. */
  function maybeOpen(wallOn) {
    button(wallOn && !S.el);
    if (!wallOn) { close(false); return; }
    let seen = false; try { seen = localStorage.getItem("pw.tourSeen") === "1"; } catch (e) {}
    if (seen || S.el) return;
    open();
  }

  const st = document.createElement("style");
  st.textContent = `#tour{position:fixed;inset:0;z-index:55;overflow:auto;overscroll-behavior:contain;background:var(--bg);color:var(--fg);outline:none;-webkit-overflow-scrolling:touch}
#tour .tr-top{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:10px 16px;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
#tour .tr-brand{display:flex;align-items:center;gap:9px;font:700 15px/1 var(--f-display);letter-spacing:.08em}#tour .tr-brand img{border-radius:7px}#tour .tr-sp{flex:1}
#tour .tr-sm{padding:8px 12px;font-size:12px}#tour .tr-x{background:none;border:1px solid var(--line);color:var(--muted);border-radius:8px;width:34px;height:34px;font:600 18px/1 var(--f-body);cursor:pointer}#tour .tr-x:hover{color:var(--fg);border-color:var(--accent)}
#tour .tr-hero{max-width:900px;margin:0 auto;padding:64px 18px 36px;text-align:center;background:radial-gradient(900px 420px at 50% -20%,rgba(255,176,46,.16),transparent 65%)}#tour .tr-hero img{border-radius:20px;box-shadow:0 12px 36px rgba(0,0,0,.45)}
#tour h1{font:700 50px/1.05 var(--f-display);letter-spacing:.02em;margin:18px 0 12px}#tour .tr-lead{font-size:18px;color:var(--muted);margin:0 auto 22px;max-width:680px}#tour .tr-free{color:var(--muted);font:600 12px/1.5 var(--f-data);letter-spacing:.04em;margin:18px 0 0}
#tour .tr-cta{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}#tour .tr-cta .btn{text-decoration:none}
#tour main{max-width:1080px;margin:0 auto;padding:0 18px 20px}
#tour .tr-sec{display:grid;grid-template-columns:1fr 1.3fr;gap:30px;align-items:center;padding:34px 0;border-top:1px solid var(--line)}#tour .tr-sec.flip .tr-txt{order:2}
#tour .tr-eye{color:var(--accent);font:700 11px/1 var(--f-data);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px}#tour h2{font:700 32px/1.1 var(--f-display);letter-spacing:.02em;margin:0 0 10px}#tour .tr-txt p{color:var(--muted);font-size:16px;margin:0;line-height:1.55}
#tour .tr-vis{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.35)}#tour .tr-visin{min-height:90px}#tour .tr-tag{color:var(--muted);font:600 10px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase;margin-top:10px}
#tour .tr-rv{opacity:0;transform:translateY(16px);transition:opacity .55s ease,transform .55s ease}#tour .tr-rv.in{opacity:1;transform:none}
#tour .tr-more{padding:34px 0 10px;border-top:1px solid var(--line)}#tour .tr-more h2{text-align:center;margin-bottom:16px}#tour .tr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}#tour .tr-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}#tour .tr-card h3{font:700 18px/1.2 var(--f-display);margin:0 0 6px}#tour .tr-card p{color:var(--muted);font-size:14px;margin:0;line-height:1.5}
#tour .tr-end{text-align:center;padding:44px 0 30px;border-top:1px solid var(--line);margin-top:24px}#tour .tr-end h2{font-size:38px}
#tour .tr-foot{border-top:1px solid var(--line);padding:20px 18px 28px;text-align:center;color:var(--muted);font-size:13px}#tour .tr-foot a{color:var(--accent);text-decoration:none}
#tour .tr-coach{display:grid;grid-template-columns:minmax(180px,1fr) 1.4fr;gap:14px;align-items:center}#tour .tr-gap{font:600 14px/1.4 var(--f-body);color:var(--muted);margin-bottom:8px}#tour .tr-gap b{color:var(--bad);font-family:var(--f-data)}
#tour .tr-crow{display:grid;grid-template-columns:44px 72px 1fr;gap:4px 10px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:10px;margin:6px 0;background:var(--surface2)}#tour .tr-cn{font:700 16px/1 var(--f-display);color:var(--accent)}#tour .tr-cl{font:600 13px/1 var(--f-data);color:var(--bad)}#tour .tr-ct{font-size:14px}#tour .tr-cv{font:500 11px/1 var(--f-data);color:var(--muted);grid-column:2/4}
#tour .tr-scroll{overflow:auto;max-width:100%}#tour .tr-board table{width:100%;border-collapse:collapse;font-size:14px}#tour .tr-board td.t,#tour .tr-board td.g{white-space:nowrap}#tour .tr-board th{text-align:left;color:var(--muted);font:600 11px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line)}#tour .tr-board td{padding:8px;border-bottom:1px solid var(--line)}#tour .tr-board td.t{font-family:var(--f-data);color:var(--accent)}#tour .tr-board td.g{font-family:var(--f-data);color:var(--muted)}#tour .tr-board tr.rec td.t{font-weight:700}
#tour .tr-bh{display:flex;justify-content:space-between;gap:10px;font:700 18px/1.2 var(--f-display);margin:2px 4px 8px}#tour .tr-bh .tr-bt{color:var(--muted);font-weight:600}#tour .tr-pill{display:inline-block;background:var(--pb);color:#11151b;font:700 10px/1 var(--f-data);padding:3px 6px;border-radius:10px;margin-left:6px;vertical-align:middle}
#tour .tr-note{color:var(--muted);font-size:13px;margin:10px 4px 0}
#tour .tr-rh{display:flex;justify-content:space-between;gap:10px;font:700 18px/1.2 var(--f-display);margin:2px 4px 10px}#tour .tr-rh span{color:var(--muted);font-weight:600}
#tour .tr-rk{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px}#tour .tr-rk>div{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:3px}#tour .tr-rk i{font:600 10px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-style:normal}#tour .tr-rk b{font:700 22px/1.1 var(--f-display)}#tour .tr-rk b.up{color:var(--good)}#tour .tr-rk b.dn{color:var(--bad)}#tour .tr-rk s{text-decoration:none;color:var(--muted);font-size:12px}
#tour .tr-delta{position:relative;height:28px;border-radius:14px;background:var(--surface2);border:1px solid var(--line);overflow:hidden;margin-bottom:10px}#tour .tr-delta i{position:absolute;top:0;bottom:0;left:50%;width:0;opacity:.85}#tour .tr-delta b{position:absolute;inset:0;display:grid;place-items:center;font:700 14px/1 var(--f-data)}
#tour .tr-rel{display:grid;gap:4px}#tour .tr-rr{display:grid;grid-template-columns:28px 44px 1fr 70px;gap:8px;align-items:center;padding:6px 10px;border-radius:8px;background:var(--surface2);font:500 14px/1.2 var(--f-body)}#tour .tr-rr.me{background:rgba(255,176,46,.18);border:1px solid var(--accent)}#tour .tr-rr .n{font-family:var(--f-data);color:var(--muted)}#tour .tr-rr .g{text-align:right;font-family:var(--f-data);color:var(--muted)}
#tourBtn{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.4)}
html.tour{overflow:hidden}
@media(max-width:760px){#tour .tr-hp{display:none}#tour .tr-hero{padding:40px 16px 28px}#tour .tr-hero img{width:64px;height:64px}#tour h1{font-size:32px}#tour .tr-lead{font-size:15px}#tour h2{font-size:26px}#tour .tr-end h2{font-size:30px}
#tour .tr-sec{grid-template-columns:1fr;gap:16px;padding:26px 0}#tour .tr-sec.flip .tr-txt{order:0}#tour .tr-vis{padding:10px 8px}#tour .tr-cta .btn{flex:1 1 45%}
#tour .tr-coach{grid-template-columns:1fr}#tour .tr-crow{grid-template-columns:40px 60px 1fr}#tour .tr-board td,#tour .tr-board th{padding:6px 5px;font-size:13px}}`;
  document.head.appendChild(st);
  window.PITLANE_TOUR = { open, close, maybeOpen };
})();
