/* The web's first screen for a visitor (not signed in): what Pitlane HQ does, as a short presentation with samples
   drawn from the invented data of pitwall-demo.js (a lap, two laps compared, the coach's corners, the live relative,
   a leaderboard, a race summary), before the sign-in ever shows. "Try the sample" opens the app itself on that
   sample data (a visitor only: nothing is uploaded, and the banner on every screen says so); the sign-in and the
   account are one click away all the time. Shown once per browser; "What Pitlane HQ does" on the sign-in screen
   opens it again. The web only (COMPANION): the PC app and the phones have their own first screens. */
(function () {
  if (typeof COMPANION === "undefined" || !COMPANION) return;
  const L = () => (typeof LANG === "string" && /^(es|pt)$/.test(LANG) ? LANG : "en");
  const t = (en, es, pt) => ({ en, es, pt })[L()] || en;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const D = () => window.PITLANE_DEMO;
  const fmt = (x) => { if (!(x > 0)) return "–"; const m = Math.floor(x / 60), s = x - m * 60; return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3); };
  const sgn = (x, d = 3) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(d);
  const css = () => getComputedStyle(document.documentElement);
  const col = (v, f) => (css().getPropertyValue(v) || "").trim() || f;

  // ---------- the sample laps: your best lap of the race at Spa (A) and the record of the car there (B) ----------
  let SMP = null;
  function sample() {
    if (SMP || !D()) return SMP;
    const a = D().get("/api/laps/demo:0:r:3"), b = D().get("/api/community/laps?id=comm:0:0"), race = (D().get("/api/races") || {}).races, board = (D().get("/api/community/laps?trackId=163&carId=169") || {}).laps;
    if (!a || !b) return null;
    const r = (race || []).slice().sort((p, q) => Math.abs(q.finish - q.start) - Math.abs(p.finish - p.start))[0];
    SMP = { a, b, race: r, board: board || [], track: a.track, car: a.car };
    return SMP;
  }
  // the corners of lap B: the dips of its speed (the slowest point of each), with where the braking starts
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
    const A = s.a.trace, B = s.b.trace, n = Math.min(A.d.length, B.d.length), cs = corners(B);
    return cs.map((c, k) => {
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

  // ---------- drawing ----------
  function canvas(box, h) {
    const c = document.createElement("canvas"), r = Math.min(2, devicePixelRatio || 1), w = box.clientWidth || 800;
    c.width = Math.round(w * r); c.height = Math.round(h * r); c.style.width = "100%"; c.style.height = h + "px";
    box.appendChild(c); const x = c.getContext("2d"); x.scale(r, r); return { c, x, w, h };
  }
  function road(x, tr, X, Y, W, H, marks) {
    const xs = tr.x, ys = tr.y, mx = Math.min(...xs), Mx = Math.max(...xs), my = Math.min(...ys), My = Math.max(...ys);
    const sc = Math.min((W - 24) / (Mx - mx || 1), (H - 24) / (My - my || 1)), ox = X + (W - (Mx - mx) * sc) / 2 - mx * sc, oy = Y + (H - (My - my) * sc) / 2 - my * sc;
    const P = (i) => [ox + xs[i] * sc, oy + ys[i] * sc];
    const path = () => { x.beginPath(); for (let i = 0; i < xs.length; i++) { const [a, b] = P(i); i ? x.lineTo(a, b) : x.moveTo(a, b); } x.closePath(); };
    x.lineCap = x.lineJoin = "round";
    path(); x.lineWidth = 11; x.strokeStyle = "rgba(0,0,0,.45)"; x.stroke();
    path(); x.lineWidth = 8; x.strokeStyle = "#3a4452"; x.stroke();
    path(); x.lineWidth = 5; x.strokeStyle = "#232b36"; x.stroke();
    const [sx, sy] = P(0), [nx, ny] = P(3), ang = Math.atan2(ny - sy, nx - sx);
    x.save(); x.translate(sx, sy); x.rotate(ang); x.fillStyle = "#e7ebf1"; x.fillRect(-1.5, -6, 3, 12); x.restore();
    (marks || []).forEach((m) => { const [a, b] = P(m.i); x.beginPath(); x.arc(a, b, 7, 0, 7); x.fillStyle = m.c || col("--accent", "#ffb02e"); x.fill(); x.fillStyle = "#11151b"; x.font = "700 9px 'JetBrains Mono',monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(m.t, a, b); });
    return P;
  }
  function trace(x, d, X, Y, W, H, pick, color, lw, vmax) {
    const n = d.length; x.beginPath(); x.lineWidth = lw; x.strokeStyle = color;
    for (let i = 0; i < n; i++) { const px = X + (i / (n - 1)) * W, py = Y + H - (pick(d[i]) / vmax) * H; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  function grid(x, X, Y, W, H) { x.strokeStyle = "rgba(138,151,169,.18)"; x.lineWidth = 1; for (let k = 0; k <= 4; k++) { const y = Y + (H * k) / 4; x.beginPath(); x.moveTo(X, y); x.lineTo(X + W, y); x.stroke(); } }
  function label(x, s, X, Y, c) { x.fillStyle = c || col("--muted", "#8a97a9"); x.font = "600 11px 'JetBrains Mono',ui-monospace,monospace"; x.textAlign = "left"; x.textBaseline = "top"; x.fillText(s, X, Y); }

  function drawLap(box) {
    const s = sample(); if (!s) return;
    const { x, w } = canvas(box, 250), d = s.a.trace.d, mapW = Math.min(230, w * 0.32), W = w - mapW - 36, X = 12, Y = 26, H = 150;
    grid(x, X, Y, W, H);
    // the braking zones, then the throttle and the speed
    const n = d.length; x.fillStyle = "rgba(255,99,99,.22)";
    for (let i = 0; i < n; i++) if (d[i][2] > 0.05) x.fillRect(X + (i / (n - 1)) * W, Y, Math.max(1, W / n + 0.5), H);
    trace(x, d, X, Y + H + 8, W, 46, (r) => r[1], col("--good", "#38c97c"), 1.2, 1);
    trace(x, d, X, Y + H + 8, W, 46, (r) => r[2], col("--bad", "#ff6363"), 1.2, 1);
    trace(x, d, X, Y, W, H, (r) => r[0] * 3.6, col("--accent", "#ffb02e"), 2, 290);
    label(x, t("SPEED km/h · the red bands are the braking", "VELOCIDAD km/h · las bandas rojas son las frenadas", "VELOCIDADE km/h · as faixas vermelhas são as frenagens"), X, 6);
    label(x, t("THROTTLE · BRAKE", "ACELERADOR · FRENO", "ACELERADOR · FREIO"), X, Y + H + 8 + 46 + 4);
    label(x, "290", X + W - 26, Y + 2); label(x, "0", X + W - 10, Y + H - 14);
    road(x, s.a.trace, w - mapW - 12, 10, mapW, 230);
    label(x, esc(s.track), w - mapW - 12, 232);
  }
  function drawCompare(box) {
    const s = sample(); if (!s) return;
    const { x, w } = canvas(box, 250), A = s.a.trace.d, B = s.b.trace.d, n = Math.min(A.length, B.length), X = 12, W = w - 24, Y = 26, H = 130;
    grid(x, X, Y, W, H);
    trace(x, A.slice(0, n), X, Y, W, H, (r) => r[0] * 3.6, col("--accent", "#ffb02e"), 2.2, 290);
    x.setLineDash([5, 4]); trace(x, B.slice(0, n), X, Y, W, H, (r) => r[0] * 3.6, col("--pb", "#b98cff"), 1.6, 290); x.setLineDash([]);
    label(x, t("SPEED · A your lap", "VELOCIDAD · A tu vuelta", "VELOCIDADE · A sua volta") + " " + fmt(s.a.time), X, 6, col("--accent", "#ffb02e"));
    label(x, "B " + s.b.alias + " " + fmt(s.b.time), X + W - 150, 6, col("--pb", "#b98cff"));
    // the gap along the lap: where A loses time to B
    const Y2 = Y + H + 26, H2 = 60, dl = []; let mx = 0.05;
    for (let i = 0; i < n; i++) { const v = A[i][5] - B[i][5]; dl.push(v); mx = Math.max(mx, Math.abs(v)); }
    grid(x, X, Y2, W, H2); x.beginPath(); x.moveTo(X, Y2 + H2 / 2); x.lineTo(X + W, Y2 + H2 / 2); x.strokeStyle = "rgba(231,235,241,.4)"; x.stroke();
    x.beginPath(); for (let i = 0; i < n; i++) { const px = X + (i / (n - 1)) * W, py = Y2 + H2 / 2 - (dl[i] / mx) * (H2 / 2); i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.lineWidth = 2; x.strokeStyle = dl[n - 1] > 0 ? col("--bad", "#ff6363") : col("--good", "#38c97c"); x.stroke();
    label(x, t("GAP A − B · above the line A is losing", "DIFERENCIA A − B · por encima de la línea A pierde", "DIFERENÇA A − B · acima da linha A perde") + " · " + sgn(dl[n - 1]) + " s", X, Y2 - 16);
  }
  function drawCoach(box) {
    const s = sample(); if (!s) return;
    const rows = coachRows(s).sort((p, q) => q.loss - p.loss).slice(0, 3), all = coachRows(s);
    const wrap = document.createElement("div"); wrap.className = "tr-coach"; box.appendChild(wrap);
    const mapBox = document.createElement("div"); mapBox.className = "tr-cmap"; wrap.appendChild(mapBox);
    const list = document.createElement("div"); list.className = "tr-clist"; wrap.appendChild(list);
    list.innerHTML = `<div class="tr-gap">${esc(t("Gap to the record", "Diferencia con el récord", "Diferença para o recorde"))} <b>${sgn(s.a.time - s.b.time)} s</b></div>` + rows.map((r) => `<div class="tr-crow"><span class="tr-cn">T${r.n}</span><span class="tr-cl">${sgn(r.loss, 2)} s</span><span class="tr-ct">${esc(r.tip)}</span><span class="tr-cv">${Math.round(r.av * 3.6)} / ${Math.round(r.bv * 3.6)} km/h</span></div>`).join("");
    const { x, w } = canvas(mapBox, 230);
    road(x, s.b.trace, 0, 0, w, 230, all.map((r) => ({ i: r.i, t: "T" + r.n, c: rows.includes(r) ? col("--bad", "#ff6363") : "#8a97a9" })));
  }
  function drawBoard(box) {
    const s = sample(); if (!s) return;
    const b = s.board.slice(0, 6), best = b[0] && b[0].time;
    box.innerHTML = `<div class="tr-board"><div class="tr-bh"><span>${esc(s.car)}</span><span class="tr-bt">${esc(s.track)}</span></div><div class="tr-scroll"><table><thead><tr><th>#</th><th>${esc(t("Driver", "Piloto", "Piloto"))}</th><th>${esc(t("Time", "Tiempo", "Tempo"))}</th><th>${esc(t("Gap", "Dif.", "Dif."))}</th></tr></thead><tbody>${b.map((l, i) => `<tr${i === 0 ? ' class="rec"' : ""}><td>${i + 1}</td><td>${esc(l.alias)}${i === 0 ? ' <span class="tr-pill">★ ' + esc(t("Record", "Récord", "Recorde")) + "</span>" : ""}</td><td class="t">${fmt(l.time)}</td><td class="g">${i ? "+" + (l.time - best).toFixed(3) : ""}</td></tr>`).join("")}</tbody></table></div><p class="tr-note">${esc(t("Oval · Sports Car · Formula Car · Dirt Oval · Dirt Road. Your fastest lap of each car and track goes up by itself, under your name or as Anonymous.", "Óvalo · Sports Car · Fórmula · Óvalo de tierra · Tierra. Tu vuelta más rápida de cada coche y circuito sube sola, con tu nombre o como Anónimo.", "Oval · Sports Car · Fórmula · Oval de terra · Terra. Sua volta mais rápida de cada carro e pista sobe sozinha, com seu nome ou como Anônimo."))}</p></div>`;
  }
  function drawRace(box) {
    const s = sample(); if (!s || !s.race) return;
    const r = s.race, chg = r.irChange || 0;
    const wrap = document.createElement("div"); wrap.className = "tr-race"; box.appendChild(wrap);
    wrap.innerHTML = `<div class="tr-rh"><b>${esc(r.track)}</b><span>${esc(r.car)}</span></div><div class="tr-rk">
      <div><i>${esc(t("Start → finish", "Salida → llegada", "Largada → chegada"))}</i><b>P${r.start} → P${r.finish}</b><s>${r.field} ${esc(t("cars", "coches", "carros"))}</s></div>
      <div><i>iRating</i><b class="${chg >= 0 ? "up" : "dn"}">${sgn(chg, 0)}</b><s>${r.ir}</s></div>
      <div><i>${esc(t("Incidents", "Incidentes", "Incidentes"))}</i><b>${r.inc}x</b><s>${esc(t("per lap in the summary", "por vuelta en el resumen", "por volta no resumo"))}</s></div>
      <div><i>${esc(t("Best lap", "Mejor vuelta", "Melhor volta"))}</i><b>${fmt(r.best)}</b><s>${esc(t("field", "pelotón", "pelotão"))} ${fmt(r.fieldBest)}</s></div></div><div class="tr-rc"></div>`;
    const cb = wrap.querySelector(".tr-rc"), { x, w } = canvas(cb, 90), laps = r.laps || [], n = laps.length, X = 12, W = w - 24, Y = 14, H = 60;
    grid(x, X, Y, W, H);
    x.beginPath(); laps.forEach((l, i) => { const px = X + (i / Math.max(1, n - 1)) * W, py = Y + ((l.p - 1) / Math.max(1, r.field - 1)) * H; i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.lineWidth = 2; x.strokeStyle = col("--accent", "#ffb02e"); x.stroke();
    laps.forEach((l, i) => { if (!l.i) return; const px = X + (i / Math.max(1, n - 1)) * W, py = Y + ((l.p - 1) / Math.max(1, r.field - 1)) * H; x.beginPath(); x.arc(px, py, 4, 0, 7); x.fillStyle = col("--bad", "#ff6363"); x.fill(); });
    label(x, t("POSITION LAP BY LAP · red: an incident", "POSICIÓN VUELTA A VUELTA · rojo: un incidente", "POSIÇÃO VOLTA A VOLTA · vermelho: um incidente"), X, 0);
  }
  // the live relative and the delta bar, moving: the invented race of the demo, you are car 13
  function drawLive(box, state) {
    if (!D() || !D().liveFrame) return;
    const names = [...(D().liveSession() || "").matchAll(/UserName: (.+)/g)].map((m) => m[1].trim());
    const wrap = document.createElement("div"); wrap.className = "tr-live"; box.appendChild(wrap);
    wrap.innerHTML = `<div class="tr-delta"><i></i><b></b></div><div class="tr-rel"></div><p class="tr-note">${esc(t("The relative, the delta bar, the radar, the standings, fuel, tyres, the map… drawn by the agent over iRacing, and the same on your phone while you drive.", "El relativo, la barra de delta, el radar, la clasificación, combustible, neumáticos, el mapa… dibujados por el agente sobre iRacing, y lo mismo en tu móvil mientras conduces.", "O relativo, a barra de delta, o radar, a classificação, combustível, pneus, o mapa… desenhados pelo agente sobre o iRacing, e o mesmo no seu celular enquanto você pilota."))}</p>`;
    const rel = wrap.querySelector(".tr-rel"), dI = wrap.querySelector(".tr-delta i"), dB = wrap.querySelector(".tr-delta b"), t0 = performance.now();
    const tick = () => {
      if (!state.on) return;
      const T = D().liveFrame((performance.now() - t0) / 1000 + 40), me = T.PlayerCarIdx, N = names.length;
      const rows = Array.from({ length: N }, (_, i) => ({ i, pos: T.CarIdxPosition[i], gap: T.CarIdxF2Time[i] - T.CarIdxF2Time[me], lap: T.CarIdxLap[i] })).sort((a, b) => a.pos - b.pos);
      const k = rows.findIndex((r) => r.i === me), seg = rows.slice(Math.max(0, k - 3), k + 4);
      rel.innerHTML = seg.map((r) => `<div class="tr-rr${r.i === me ? " me" : ""}"><span>${r.pos}</span><span class="n">#${10 + r.i}</span><span class="nm">${esc(names[r.i] || "")}</span><span class="g">${r.i === me ? "" : sgn(-r.gap, 1)}</span></div>`).join("");
      const d = T.LapDeltaToBestLap || 0; dI.style.width = Math.min(100, Math.abs(d) / 0.5 * 50) + "%"; dI.style.left = d < 0 ? 50 - Math.min(50, Math.abs(d) / 0.5 * 50) + "%" : "50%"; dI.style.background = d < 0 ? col("--good", "#38c97c") : col("--bad", "#ff6363"); dB.textContent = sgn(d, 2);
      state.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  // ---------- the slides ----------
  const SL = () => [
    { k: "hero" },
    { k: "lap", h: t("Every lap, recorded", "Cada vuelta, grabada", "Cada volta, gravada"), p: t("Pitlane HQ Agent runs next to iRacing on your PC and saves speed, throttle, brake, gear and steering of every lap, with nothing to set up. The laps go to your account: open them later on the web or on your phone.", "Pitlane HQ Agent funciona junto a iRacing en tu PC y guarda velocidad, acelerador, freno, marcha y volante de cada vuelta, sin configurar nada. Las vueltas van a tu cuenta: ábrelas luego en la web o en el móvil.", "O Pitlane HQ Agent roda junto ao iRacing no seu PC e guarda velocidade, acelerador, freio, marcha e volante de cada volta, sem configurar nada. As voltas vão para sua conta: abra-as depois na web ou no celular."), draw: drawLap },
    { k: "cmp", h: t("Compare two laps", "Compara dos vueltas", "Compare duas voltas"), p: t("Your lap against your best, against another session or against the record of the leaderboard: the speed along the lap and where the time goes, metre by metre.", "Tu vuelta frente a tu mejor, frente a otra sesión o frente al récord de la clasificación: la velocidad a lo largo de la vuelta y dónde se va el tiempo, metro a metro.", "Sua volta contra a sua melhor, contra outra sessão ou contra o recorde da classificação: a velocidade ao longo da volta e onde o tempo vai, metro a metro."), draw: drawCompare },
    { k: "coach", h: t("A coach that uses real laps", "Un coach con vueltas reales", "Um coach com voltas reais"), p: t("For each car and track Pitlane HQ learns from real laps of real drivers. The coach measures your lap against the record and the driver just ahead of you, and tells you which corners cost the most and what to change.", "Para cada coche y circuito, Pitlane HQ aprende de vueltas reales de pilotos reales. El coach mide tu vuelta frente al récord y al piloto que va justo por delante, y te dice qué curvas te cuestan más y qué cambiar.", "Para cada carro e pista, o Pitlane HQ aprende com voltas reais de pilotos reais. O coach mede sua volta contra o recorde e o piloto logo à frente, e diz quais curvas custam mais e o que mudar."), draw: drawCoach },
    { k: "live", h: t("Live telemetry and overlays", "Telemetría en vivo y overlays", "Telemetria ao vivo e overlays"), p: t("While you drive, the overlays show the race over the game, and your phone or a browser shows the same telemetry live. Share a code and a friend or your engineer can watch too.", "Mientras conduces, los overlays muestran la carrera sobre el juego, y tu móvil o un navegador muestra la misma telemetría en vivo. Comparte un código y un amigo o tu ingeniero también puede verla.", "Enquanto você pilota, os overlays mostram a corrida sobre o jogo, e seu celular ou um navegador mostra a mesma telemetria ao vivo. Compartilhe um código e um amigo ou seu engenheiro também pode ver."), draw: drawLive, live: true },
    { k: "board", h: t("Leaderboards and records", "Clasificaciones y récords", "Classificações e recordes"), p: t("The fastest lap of every driver on each car and track, by discipline, and the newest records. Any lap on the board opens as lap B to compare with yours.", "La vuelta más rápida de cada piloto en cada coche y circuito, por disciplina, y los récords más recientes. Cualquier vuelta de la tabla se abre como vuelta B para compararla con la tuya.", "A volta mais rápida de cada piloto em cada carro e pista, por disciplina, e os recordes mais recentes. Qualquer volta da tabela abre como volta B para comparar com a sua."), draw: drawBoard },
    { k: "race", h: t("Race summaries", "Resúmenes de carrera", "Resumos de corrida"), p: t("After each race: your result, your laps, your incidents, the iRating change and how you compared with the drivers around you. Mark the drivers you meet with your own notes.", "Después de cada carrera: tu resultado, tus vueltas, tus incidentes, el cambio de iRating y cómo te fue frente a los pilotos de alrededor. Marca a los pilotos que te encuentras con tus propias notas.", "Depois de cada corrida: seu resultado, suas voltas, seus incidentes, a mudança de iRating e como você se saiu contra os pilotos ao redor. Marque os pilotos que encontra com suas próprias notas."), draw: drawRace },
    { k: "end" },
  ];

  const S = { i: 0, auto: null, live: { on: false, raf: 0 }, el: null };
  const btns = (first) => `<div class="tr-cta">${first ? `<button type="button" class="btn primary" data-tr="next">${esc(t("See how it works", "Ver cómo funciona", "Ver como funciona"))}</button>` : ""}<button type="button" class="btn${first ? "" : " primary"}" data-tr="sample">${esc(t("Try it with sample data", "Pruébalo con datos de muestra", "Experimente com dados de exemplo"))}</button><button type="button" class="btn" data-tr="signin">${esc(t("Sign in", "Iniciar sesión", "Entrar"))}</button><button type="button" class="btn" data-tr="create">${esc(t("Create account", "Crear cuenta", "Criar conta"))}</button><a class="btn" href="/dl/PitlaneHQ-Setup.exe">${esc(t("Download for Windows", "Descargar para Windows", "Baixar para Windows"))}</a></div>`;
  function render() {
    const sl = SL(), s = sl[S.i], box = S.el.querySelector(".tr-body"), n = sl.length;
    if (S.live.on) { S.live.on = false; cancelAnimationFrame(S.live.raf); }
    if (s.k === "hero") box.innerHTML = `<div class="tr-hero"><img src="icon-192.png" alt="" width="72" height="72"><h1>Pitlane HQ</h1><p class="tr-lead">${esc(t("iRacing telemetry, a coach for your laps and overlays. Free, on Windows, Android and the web.", "Telemetría para iRacing, un coach para tus vueltas y overlays. Gratis, en Windows, Android y la web.", "Telemetria para iRacing, um coach para suas voltas e overlays. Grátis, no Windows, Android e na web."))}</p>${btns(true)}</div>`;
    else if (s.k === "end") box.innerHTML = `<div class="tr-hero"><h1>${esc(t("Free. One account for the PC, the web and your phone.", "Gratis. Una cuenta para el PC, la web y tu móvil.", "Grátis. Uma conta para o PC, a web e o seu celular."))}</h1><p class="tr-lead">${esc(t("Your laps and your account are encrypted; the leaderboards show only your public name, or Anonymous. Look around with sample data, or create your account now.", "Tus vueltas y tu cuenta van cifradas; las clasificaciones muestran solo tu nombre público, o Anónimo. Echa un vistazo con datos de muestra, o crea tu cuenta ahora.", "Suas voltas e sua conta são criptografadas; as classificações mostram só seu nome público, ou Anônimo. Dê uma olhada com dados de exemplo, ou crie sua conta agora."))}</p>${btns(false)}</div>`;
    else {
      box.innerHTML = `<div class="tr-slide"><h2>${esc(s.h)}</h2><p>${esc(s.p)}</p><div class="tr-vis"></div><div class="tr-tag">${esc(t("Sample data", "Datos de muestra", "Dados de exemplo"))} · ${esc(t("drawn from invented laps", "de vueltas inventadas", "de voltas inventadas"))}</div></div>`;
      const vis = box.querySelector(".tr-vis");
      try { if (s.live) { S.live.on = true; s.draw(vis, S.live); } else s.draw(vis); } catch (e) { vis.innerHTML = `<p class="note">${esc(String(e && e.message || e))}</p>`; }
    }
    S.el.querySelector(".tr-dots").innerHTML = sl.map((_, i) => `<button type="button" class="tr-dot${i === S.i ? " on" : ""}" data-tr="go" data-i="${i}" aria-label="${i + 1}/${n}"></button>`).join("");
    S.el.querySelector("[data-tr=prev]").disabled = S.i === 0; S.el.querySelector("[data-tr=next]").disabled = S.i === n - 1;
    S.el.querySelector(".tr-n").textContent = (S.i + 1) + " / " + n;
    S.el.querySelector(".tr-x").textContent = t("Skip", "Saltar", "Pular") + " ×";
  }
  function go(i) { const n = SL().length; S.i = Math.max(0, Math.min(n - 1, i)); render(); }
  // the slides move on by themselves until you touch them; never on the first and the last
  function autoplay(on) { clearInterval(S.auto); S.auto = on ? setInterval(() => { if (S.i > 0 && S.i < SL().length - 1) go(S.i + 1); }, 7000) : null; }
  function close(seen) {
    if (!S.el) return;
    if (S.live.on) { S.live.on = false; cancelAnimationFrame(S.live.raf); }
    autoplay(false); clearInterval(S.langT); S.el.remove(); S.el = null; document.documentElement.classList.remove("tour");
    if (seen) { try { localStorage.setItem("pw.tourSeen", "1"); } catch (e) {} }
  }
  function open() {
    if (S.el) return;
    const el = document.createElement("div"); el.id = "tour"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Pitlane HQ");
    el.innerHTML = `<div class="tr-top"><span class="tr-brand">PITLANE HQ</span><span class="tr-n"></span><button type="button" class="tr-x" data-tr="close" aria-label="${esc(t("Skip", "Saltar", "Pular"))}">${esc(t("Skip", "Saltar", "Pular"))} ×</button></div><div class="tr-body"></div><div class="tr-nav"><button type="button" class="tr-arr" data-tr="prev" aria-label="‹">‹</button><div class="tr-dots"></div><button type="button" class="tr-arr" data-tr="next" aria-label="›">›</button></div>`;
    document.body.appendChild(el); S.el = el; document.documentElement.classList.add("tour"); S.i = 0; render(); autoplay(true);
    // the language window sits over this one: once chosen, the slides say it in that language
    S.lang = L(); S.langT = setInterval(() => { if (!S.el) { clearInterval(S.langT); return; } if (L() !== S.lang) { S.lang = L(); render(); } }, 400);
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tr]"); if (!b) return;
      const a = b.dataset.tr; autoplay(false);
      if (a === "next") go(S.i + 1); else if (a === "prev") go(S.i - 1); else if (a === "go") go(+b.dataset.i);
      else if (a === "close" || a === "signin" || a === "create") { close(true); try { show("me"); if (a === "create") setTimeout(() => { const f = document.querySelector("#meBody [name=display],#meBody #mrName,#meBody input[autocomplete=nickname]"); if (f) f.focus(); }, 300); } catch (e) {} }
      else if (a === "sample") { close(true); try { localStorage.setItem("pw.sample", "1"); } catch (e) {} try { signWall(); show("home"); demoBanner(); } catch (e) {} }
    });
    // keys and swipes
    el.tabIndex = -1; el.focus();
    el.addEventListener("keydown", (ev) => { if (ev.key === "ArrowRight") { autoplay(false); go(S.i + 1); } else if (ev.key === "ArrowLeft") { autoplay(false); go(S.i - 1); } else if (ev.key === "Escape") { close(true); try { show("me"); } catch (e) {} } });
    let sx = null; el.addEventListener("pointerdown", (ev) => { sx = ev.clientX; }, { passive: true });
    el.addEventListener("pointerup", (ev) => { if (sx == null) return; const dx = ev.clientX - sx; sx = null; if (Math.abs(dx) > 60) { autoplay(false); go(S.i + (dx < 0 ? 1 : -1)); } }, { passive: true });
  }
  // the small button on the sign-in screen, while the sign wall is up
  function button(on) {
    let b = document.getElementById("tourBtn");
    if (!on) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement("button"); b.id = "tourBtn"; b.type = "button"; b.className = "btn"; b.textContent = "▶ " + t("What Pitlane HQ does", "Qué hace Pitlane HQ", "O que o Pitlane HQ faz");
    b.onclick = () => open(); document.body.appendChild(b);
  }
  /** Called by the sign wall (index.html) each time it changes: the first visit opens the presentation. */
  function maybeOpen(wallOn) {
    button(wallOn && !S.el);
    if (!wallOn) { close(false); return; }
    let seen = false; try { seen = localStorage.getItem("pw.tourSeen") === "1"; } catch (e) {}
    if (seen || S.el) return;
    // the language is chosen first (its window), then the presentation, in that language
    open();
  }

  const st = document.createElement("style");
  st.textContent = `#tour{position:fixed;inset:0;z-index:55;background:radial-gradient(1200px 600px at 50% -10%,rgba(255,176,46,.14),transparent 60%),var(--bg);color:var(--fg);display:flex;flex-direction:column;overflow:auto;outline:none}
#tour .tr-top{display:flex;align-items:center;gap:14px;padding:14px 18px;font:700 15px/1 var(--f-display);letter-spacing:.08em}#tour .tr-top .tr-n{color:var(--muted);font:600 12px/1 var(--f-data);margin-left:auto}
#tour .tr-x{background:none;border:1px solid var(--line);color:var(--muted);border-radius:8px;padding:7px 10px;font:600 13px/1 var(--f-body);cursor:pointer}#tour .tr-x:hover{color:var(--fg);border-color:var(--accent)}
#tour .tr-body{flex:1;display:flex;align-items:center;justify-content:center;padding:8px 18px}
#tour .tr-hero{text-align:center;max-width:720px}#tour .tr-hero img{border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.4)}#tour h1{font:700 44px/1.05 var(--f-display);letter-spacing:.02em;margin:14px 0 10px}
#tour .tr-lead{font-size:18px;color:var(--muted);margin:0 auto 22px;max-width:620px}
#tour .tr-cta{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}#tour .tr-cta .btn{text-decoration:none}
#tour .tr-slide{width:min(960px,100%)}#tour h2{font:700 34px/1.1 var(--f-display);letter-spacing:.02em;margin:0 0 8px}#tour .tr-slide>p{color:var(--muted);font-size:16px;margin:0 0 14px;max-width:820px}
#tour .tr-vis{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;min-height:120px;box-shadow:0 12px 40px rgba(0,0,0,.35)}#tour .tr-tag{color:var(--muted);font:600 11px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase;margin-top:8px}
#tour .tr-nav{display:flex;align-items:center;justify-content:center;gap:14px;padding:12px 18px 22px}#tour .tr-arr{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--fg);font-size:22px;cursor:pointer}#tour .tr-arr:disabled{opacity:.3;cursor:default}
#tour .tr-dots{display:flex;gap:8px}#tour .tr-dot{width:9px;height:9px;border-radius:50%;border:0;background:var(--line);padding:0;cursor:pointer}#tour .tr-dot.on{background:var(--accent);width:22px;border-radius:5px}
#tour .tr-coach{display:grid;grid-template-columns:minmax(200px,1fr) 1.4fr;gap:14px;align-items:center}#tour .tr-gap{font:600 14px/1.4 var(--f-body);color:var(--muted);margin-bottom:8px}#tour .tr-gap b{color:var(--bad);font-family:var(--f-data)}
#tour .tr-crow{display:grid;grid-template-columns:44px 72px 1fr auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:10px;margin:6px 0;background:var(--surface2)}#tour .tr-cn{font:700 16px/1 var(--f-display);color:var(--accent)}#tour .tr-cl{font:600 13px/1 var(--f-data);color:var(--bad)}#tour .tr-ct{font-size:14px}#tour .tr-cv{font:500 11px/1 var(--f-data);color:var(--muted)}
#tour .tr-scroll{overflow:auto;max-width:100%}#tour .tr-board table{width:100%;border-collapse:collapse;font-size:14px}#tour .tr-board td.t,#tour .tr-board td.g{white-space:nowrap}#tour .tr-board th{text-align:left;color:var(--muted);font:600 11px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line)}#tour .tr-board td{padding:8px;border-bottom:1px solid var(--line)}#tour .tr-board td.t{font-family:var(--f-data);color:var(--accent)}#tour .tr-board td.g{font-family:var(--f-data);color:var(--muted)}#tour .tr-board tr.rec td.t{font-weight:700}
#tour .tr-bh{display:flex;justify-content:space-between;gap:10px;font:700 18px/1.2 var(--f-display);margin:2px 4px 8px}#tour .tr-bh .tr-bt{color:var(--muted);font-weight:600}#tour .tr-pill{display:inline-block;background:var(--pb);color:#11151b;font:700 10px/1 var(--f-data);padding:3px 6px;border-radius:10px;margin-left:6px;vertical-align:middle}
#tour .tr-note{color:var(--muted);font-size:13px;margin:10px 4px 0}
#tour .tr-rh{display:flex;justify-content:space-between;gap:10px;font:700 18px/1.2 var(--f-display);margin:2px 4px 10px}#tour .tr-rh span{color:var(--muted);font-weight:600}
#tour .tr-rk{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:10px}#tour .tr-rk>div{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:3px}#tour .tr-rk i{font:600 10px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-style:normal}#tour .tr-rk b{font:700 22px/1.1 var(--f-display)}#tour .tr-rk b.up{color:var(--good)}#tour .tr-rk b.dn{color:var(--bad)}#tour .tr-rk s{text-decoration:none;color:var(--muted);font-size:12px}
#tour .tr-live{display:grid;gap:10px}#tour .tr-delta{position:relative;height:28px;border-radius:14px;background:var(--surface2);border:1px solid var(--line);overflow:hidden}#tour .tr-delta i{position:absolute;top:0;bottom:0;left:50%;width:0;opacity:.85}#tour .tr-delta b{position:absolute;inset:0;display:grid;place-items:center;font:700 14px/1 var(--f-data)}
#tour .tr-rel{display:grid;gap:4px}#tour .tr-rr{display:grid;grid-template-columns:28px 44px 1fr 70px;gap:8px;align-items:center;padding:6px 10px;border-radius:8px;background:var(--surface2);font:500 14px/1.2 var(--f-body)}#tour .tr-rr.me{background:rgba(255,176,46,.18);border:1px solid var(--accent)}#tour .tr-rr .n{font-family:var(--f-data);color:var(--muted)}#tour .tr-rr .g{text-align:right;font-family:var(--f-data);color:var(--muted)}
#tourBtn{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.4)}
html.tour{overflow:hidden}
@media(max-width:700px){#tour h1{font-size:32px}#tour h2{font-size:26px}#tour .tr-lead{font-size:15px}#tour .tr-coach{grid-template-columns:1fr}#tour .tr-crow{grid-template-columns:40px 60px 1fr}#tour .tr-cv{grid-column:2/4}#tour .tr-body{align-items:flex-start;padding-top:4px}#tour .tr-cta .btn{flex:1 1 45%}#tour .tr-board td,#tour .tr-board th{padding:6px 5px;font-size:13px}#tour .tr-vis{padding:10px 8px}}`;
  document.head.appendChild(st);
  window.PITLANE_TOUR = { open, close, maybeOpen };
})();
