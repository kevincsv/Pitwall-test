/* The web's landing for a visitor (not signed in), the "clean data" design: the sign-in stays at the top of the page
   (the "me" view, as it is), and under it one page like a product site that says what Pitlane HQ does: a tagline with
   the app in a Windows window, then every feature as a row (its text and a screenshot of the app), the overlays
   moving over a dark scene with a lap played in a loop (relative, delta bar, the agent's radar, dash, pedals, map,
   fuel) and the overlays as the agent draws them, the phone app, "And also" and the calls to action. The pictures
   are the app itself with its demo data (landing/*.jpg; the overlays from the agent's own drawing, landing/ov-*.png;
   the phones from the apps' screenshot job, landing/m-*.png). No way into the app on invented data: "Create
   account" goes to the form at the top. The web only (COMPANION): the PC app and the phones have their own first
   screens. */
(function () {
  if (typeof COMPANION === "undefined" || !COMPANION) return;
  const L = () => (typeof LANG === "string" && /^(es|pt)$/.test(LANG) ? LANG : "en");
  const t = (en, es, pt) => ({ en, es, pt })[L()] || en;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IMG = () => "landing/" + L() + "/"; // the pictures in the page's language

  const CAPS = `<i><svg viewBox="0 0 10 10"><path d="M0 5.5h10"/></svg></i><i><svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.2"/></svg></i><i><svg viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9"/></svg></i>`;
  // ---------- a screenshot in a Windows 11 window (the app's icon and name, minimise, maximise, close) ----------
  const win = (img, alt) => `<figure class="tr-win"><div class="tr-wbar"><img src="icon-192.png" alt=""><span>Pitlane HQ</span>${CAPS}</div><img class="tr-shot" src="${IMG()}${img}" alt="${esc(alt)}" loading="lazy" decoding="async"></figure>`;
  const phone = (img, cap) => `<figure class="tr-phone"><div><img src="${IMG()}${img}" alt="${esc(cap)}" loading="lazy" decoding="async"></div><figcaption>${esc(cap)}</figcaption></figure>`;

  // ---------- the overlays, live: one lap played in a loop, drawn as the agent draws them ----------
  const LAP = 66, CORN = [0.08, 0.2, 0.31, 0.47, 0.58, 0.7, 0.83];
  const TRK = (() => { const n = 120, p = []; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; p.push([300 * Math.cos(a) + 80 * Math.cos(3 * a), 180 * Math.sin(a) + 40 * Math.sin(2 * a)]); }
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), mx = Math.min(...xs), my = Math.min(...ys), s = Math.min(184 / (Math.max(...xs) - mx), 104 / (Math.max(...ys) - my));
    return p.map(([x, y]) => [+((x - mx) * s + 8).toFixed(1), +((y - my) * s + 8).toFixed(1)]); })();
  const near = (s) => Math.min(...CORN.map((c) => { let x = c - s; if (x < 0) x += 1; return x; }));
  const after = (s) => Math.min(...CORN.map((c) => { let x = s - c; if (x < 0) x += 1; return x; }));
  const spdAt = (s) => 300 - 190 * Math.exp(-Math.pow(Math.min(near(s), after(s) * 1.6) / 0.03, 2));
  const brkAt = (s) => { const a = near(s); return a < 0.035 && a > 0.004 ? Math.min(1, (0.035 - a) / 0.012) * (a > 0.012 ? 1 : a / 0.012) : 0; };
  const thrAt = (s) => { const b = after(s); return brkAt(s) > 0 ? 0 : b < 0.03 ? Math.max(0.15, b / 0.03) : 1; };
  const CARS = [["#12", "T. Nakamura", 2.6, "#5aa9ff"], ["#44", "A. Ruiz", 0.9, "#5aa9ff"], ["#7", null, 0, ""], ["#31", "J. Smith", -0.5, "#5aa9ff"], ["#88", "L. Becker", -2.2, "#5aa9ff"], ["#3", "M. Rossi", 4.8, "#b98cff"], ["#21", "S. Ivanova", -4.1, "#5aa9ff"]];

  function frame(T) {
    const ph = (T % LAP) / LAP, lap = 7 + Math.floor(T / LAP), v = spdAt(ph), thr = thrAt(ph), brk = brkAt(ph);
    const G = [0, 95, 135, 170, 205, 240, 275, 330], gear = Math.max(1, G.findIndex((g) => v < g)) || 7, rpm = Math.round(3800 + ((v - G[gear - 1]) / (G[gear] - G[gear - 1])) * 4300), lit = Math.round(((rpm - 4500) / 3600) * 12);
    const delta = 0.18 * Math.sin(T / 9) - 0.06 * Math.sin(T / 3.1), fuel = Math.max(4, 48.2 - (T * 2.41) / LAP);
    const cars = CARS.map(([n, name, base, c], k) => ({ n, name, c, k, me: !name, gap: name ? base + 0.35 * Math.sin(T / (5 + k) + k) : 0, up: Math.cos(T / (5 + k) + k) > 0 })).sort((a, b) => b.gap - a.gap);
    // the agent's radar (drawRadarOv): 20 m, your car's outline, grey far, amber under 10 m, red beside you or
    // closing within a second, the red side bar, a trail behind a car coming fast, the nearest distance in your line
    const cyc = T % 16, dA = -24 + cyc * 3.2, vA = 3.2, dB = 11 + 3 * Math.sin(T / 3), vB = Math.cos(T / 3);
    const latA = Math.abs(dA) <= 4.6 ? -1 : dA > 4.6 ? -Math.max(0, 1 - (dA - 4.6) / 7) : 0;
    return { ph, lap, v, thr, brk, gear, rpm, lit, delta, fuel, cars, radar: [[dA, vA, latA], [dB, vB, 0]], side: Math.abs(dA) <= 4.6 };
  }
  const P = {
    delta: (f) => { const w = Math.min(50, (Math.abs(f.delta) / 0.4) * 50), c = f.delta > 0 ? "#ff5a5a" : "#4fe09a";
      return `<div class="lv-dt"><i style="left:${f.delta > 0 ? 50 : 50 - w}%;width:${w}%;background:${c}"></i><b></b></div><div class="lv-dr"><span style="background:${c}">${f.delta > 0 ? "+" : "−"}${Math.abs(f.delta).toFixed(3)}</span><em>${esc(t("Predicted", "Predicción", "Previsão"))} 2:${(18.04 + f.delta).toFixed(3).padStart(6, "0")}</em></div>`; },
    rel: (f) => `<div class="lv-h"><span>RELATIVE</span><span>${esc(t("RACE", "CARRERA", "CORRIDA"))} · ${20 - f.lap} ${esc(t("LAPS", "VUELTAS", "VOLTAS"))}</span></div>` + f.cars.map((o, i) => `<div class="lv-r${o.me ? " me" : ""}"><span>P${i + 3}</span><span style="color:${o.me ? "inherit" : o.c}">${o.n}</span><span class="nm">${esc(o.me ? t("You", "Tú", "Você") : o.name)}</span><b style="color:${o.me ? "inherit" : o.gap > 0 ? "#4fe09a" : "#ff8a8a"}">${o.me ? "" : (o.gap > 0 ? "+" : "−") + Math.abs(o.gap).toFixed(1)}</b><i style="color:${o.up ? "#ff8a8a" : "#4fe09a"}">${o.me ? "" : o.up ? "▲" : "▼"}</i></div>`).join(""),
    radar: (f) => { const ppm = 3.35, car = (dm, v, lat) => { const d = Math.abs(dm); if (d > 23) return ""; const closing = dm < 0 ? v : -v;
        let c = "#c9d1da"; if (Math.abs(lat) >= 0.5 || d < 5.52 || (closing > 3 && d / closing < 1.2)) c = "#ff4d4f"; else if (d < 10) c = "#ffb02e";
        const a = Math.abs(lat) < 0.5 ? Math.max(0.35, 1 - (d / 23) * 0.65) : 1, X = 75 + lat * 2.7 * ppm, Y = 75 - dm * ppm, tl = closing > 2 ? Math.min(30.8, closing * 0.35 * ppm) : 0;
        return (tl ? `<rect x="${(X - 1.6).toFixed(1)}" y="${(dm > 0 ? Y - 7.7 - tl : Y + 7.7).toFixed(1)}" width="3.2" height="${tl.toFixed(1)}" fill="${c}" opacity="${(0.3 * a).toFixed(2)}"/>` : "")
          + `<rect x="${(X - 4.7).toFixed(1)}" y="${(Y - 7.7).toFixed(1)}" width="9.4" height="17.4" rx="2.6" fill="#000" opacity="${(0.35 * a).toFixed(2)}"/><rect x="${(X - 3.2).toFixed(1)}" y="${(Y - 7.7).toFixed(1)}" width="6.4" height="15.4" rx="2.2" fill="${c}" opacity="${a.toFixed(2)}" stroke="#000" stroke-opacity=".55" stroke-width="1.2"/>`; };
      const line = f.radar.filter(([d, , l]) => Math.abs(l) < 0.5 && Math.abs(d) <= 20).sort((x, y) => Math.abs(x[0]) - Math.abs(y[0]))[0];
      const ty = line ? (line[0] > 0 ? 75 - line[0] * ppm - 13.7 : 75 - line[0] * ppm + 20.7) : -50;
      return `<svg viewBox="0 0 150 150" aria-hidden="true"><rect x="${(75 - (2.7 * ppm + 1.9 * ppm * 1.1) - 1.2).toFixed(1)}" y="55" width="2.4" height="40" fill="url(#lvbar)" opacity="${f.side ? 1 : 0}"/>${f.radar.map((r) => car(...r)).join("")}<rect x="71.8" y="67.3" width="6.4" height="15.4" rx="2.2" fill="#fff" fill-opacity=".12" stroke="#fff" stroke-opacity=".9" stroke-width="2"/>${line ? `<text x="75" y="${ty.toFixed(1)}" text-anchor="middle" fill="${Math.abs(line[0]) < 10 ? "#ffb02e" : "#e7ebf1"}">${Math.abs(line[0]).toFixed(1)} m</text>` : ""}</svg>`; },
    dash: (f) => `<div class="lv-sl">${Array.from({ length: 12 }, (_, i) => `<i style="background:${i < f.lit ? (i < 6 ? "#4fe09a" : i < 10 ? "#ffb02e" : "#ff5a5a") : "#1b222c"}"></i>`).join("")}</div><div class="lv-dd"><div><small>${esc(t("GEAR", "MARCHA", "MARCHA"))}</small><b class="g" style="color:${f.lit >= 11 ? "#ff5a5a" : "inherit"}">${f.gear}</b></div><div><small>${esc(t("SPEED", "VELOCIDAD", "VELOCIDADE"))}</small><b class="s">${Math.round(f.v)}<em> km/h</em></b></div><span></span><div class="r"><small>${esc(t("LAP", "VUELTA", "VOLTA"))}</small><b>${f.lap}/20</b><em>${f.rpm} rpm</em></div></div>`,
    pedals: (f) => { const h = Array.from({ length: 120 }, (_, i) => (f.ph - (119 - i) * 0.00125 + 1) % 1), pts = (fn) => h.map((s, i) => ((i * 200) / 119).toFixed(1) + "," + (58 - fn(s) * 54).toFixed(1)).join(" ");
      return `<div class="lv-h"><span>${esc(t("PEDALS", "PEDALES", "PEDAIS"))}</span></div><div class="lv-pd"><svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts(thrAt)}" fill="none" stroke="#4fe09a" stroke-width="2" vector-effect="non-scaling-stroke"/><polyline points="${pts(brkAt)}" fill="none" stroke="#ff5a5a" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><s><i style="height:${Math.round(f.brk * 100)}%;background:#ff5a5a"></i></s><s><i style="height:${Math.round(f.thr * 100)}%;background:#4fe09a"></i></s></div>`; },
    map: (f) => { const at = (s) => TRK[Math.floor(s * TRK.length) % TRK.length], pl = TRK.map((p) => p.join(",")).join(" ");
      const dots = [[f.ph, "#ffb02e", 5], ...f.cars.filter((o) => !o.me).map((o) => [(f.ph + o.gap / LAP + 1) % 1, o.c, 3.6])];
      return `<svg viewBox="0 0 200 120" aria-hidden="true"><polygon points="${pl}" fill="none" stroke="#3a4352" stroke-width="9" stroke-linejoin="round"/><polygon points="${pl}" fill="none" stroke="#1b222c" stroke-width="6" stroke-linejoin="round"/>${dots.map(([s, c, r]) => { const [x, y] = at(s); return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#0d1116" stroke-width="1.5"/>`; }).join("")}</svg>`; },
    fuel: (f) => `<div class="lv-h"><span>${esc(t("FUEL", "COMBUSTIBLE", "COMBUSTÍVEL"))}</span></div><div class="lv-fu"><div><b>${f.fuel.toFixed(1)}<em> L</em></b><small>${esc(t("in the tank", "en el depósito", "no tanque"))}</small></div><div><b>${(f.fuel / 2.41).toFixed(1)}</b><small>${esc(t("laps left", "vueltas posibles", "voltas possíveis"))}</small></div><div><b>2.41</b><small>${esc(t("per lap", "por vuelta", "por volta"))}</small></div></div><p>${esc(t("You make the finish", "Llegas al final", "Você chega ao fim"))}</p>`,
  };
  const ORDER = ["delta", "rel", "radar", "map", "fuel", "dash", "pedals"];
  function liveHTML() {
    return `<div class="lv"><svg width="0" height="0" style="position:absolute"><defs><linearGradient id="lvbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d4f" stop-opacity="0"/><stop offset=".5" stop-color="#ff4d4f" stop-opacity=".9"/><stop offset="1" stop-color="#ff4d4f" stop-opacity="0"/></linearGradient></defs></svg>
      <span class="lv-tag">● ${esc(t("LIVE", "EN VIVO", "AO VIVO"))}</span>${ORDER.map((k) => `<div class="lv-p lv-${k}" data-lv="${k}"></div>`).join("")}</div>`;
  }
  // each frame writes only the overlays' own boxes (and only when what they show changed): smooth at the screen's rate
  function liveStart(box, st) {
    if (st.on) return; st.on = true;
    const els = Object.fromEntries([...box.querySelectorAll("[data-lv]")].map((e) => [e.dataset.lv, e])), last = {}, t0 = performance.now() - 20000;
    const tick = (now) => {
      if (!st.on) return;
      const f = frame((now - t0) / 1000);
      for (const k of ORDER) { const h = P[k](f); if (last[k] !== h) { els[k].innerHTML = h; last[k] = h; } }
      if (!reduced()) st.raf = requestAnimationFrame(tick);
    };
    tick(performance.now());
  }
  const liveStop = (st) => { st.on = false; cancelAnimationFrame(st.raf); };

  // ---------- the page ----------
  const FEATS = () => [
    ["laps.jpg", t("Every lap, recorded", "Cada vuelta, grabada", "Cada volta, gravada"), t("Pitlane HQ Agent records every lap of iRacing with its sectors and sends it to your account.", "Pitlane HQ Agent graba cada vuelta de iRacing con sus sectores y la sube a tu cuenta.", "O Pitlane HQ Agent grava cada volta do iRacing com seus setores e a envia para sua conta.")],
    ["compare.jpg", t("Compare two laps", "Compara dos vueltas", "Compare duas voltas"), t("Speed, pedals and the gap metre by metre against your best lap or another driver's.", "Velocidad, pedales y diferencia metro a metro contra tu mejor vuelta o la de otro piloto.", "Velocidade, pedais e a diferença metro a metro contra sua melhor volta ou a de outro piloto.")],
    ["coach.jpg", t("A coach that uses real laps", "Un coach con vueltas reales", "Um coach com voltas reais"), t("It tells you which corners cost you time and what to change, against laps someone really drove.", "Te dice en qué curvas pierdes tiempo y qué cambiar, contra vueltas que alguien condujo de verdad.", "Diz em quais curvas você perde tempo e o que mudar, contra voltas que alguém pilotou de verdade.")],
    ["live.jpg", t("Live telemetry and overlays", "Telemetría en vivo y overlays", "Telemetria ao vivo e overlays"), t("Relative, delta, radar, fuel and more over the game, and your telemetry on your phone.", "Relative, delta, radar, combustible y más sobre el juego, y tu telemetría en el móvil.", "Relative, delta, radar, combustível e mais sobre o jogo, e sua telemetria no celular.")],
    ["board.jpg", t("Leaderboards and records", "Clasificaciones y récords", "Classificações e recordes"), t("Your best lap of each car and track goes by itself to the leaderboard of its discipline.", "Tu mejor vuelta de cada coche y circuito entra sola en la clasificación de su disciplina.", "Sua melhor volta de cada carro e pista entra sozinha na classificação da sua disciplina.")],
    ["race.jpg", t("Race summaries", "Resúmenes de carrera", "Resumos de corrida"), t("Your place lap by lap, the incidents and the iRating of every race.", "Tu posición vuelta a vuelta, los incidentes y el iRating de cada carrera.", "Sua posição volta a volta, os incidentes e o iRating de cada corrida.")],
  ];
  const OVS = () => [["l-brakes", t("Braking markers", "Marcas de frenada", "Marcas de frenagem")], ["s-sectors", t("Mini-sectors", "Minisectores", "Minissetores")], ["g-inputs", t("Pedals", "Pedales", "Pedais")], ["g-timing", t("Sector times", "Tiempos por sector", "Tempos por setor")], ["l-coach", t("Coach on track", "Coach en pista", "Coach na pista")], ["trackbar", t("Track position bar", "Barra de posiciones", "Barra de posições")], ["weather", t("Weather and track", "Tiempo y pista", "Clima e pista")], ["g-tyres", t("Tyres", "Neumáticos", "Pneus")]];
  const PHONES = () => [["m-race.png", t("Race summary", "Resumen de carrera", "Resumo da corrida")], ["m-analysis-0.png", t("Laps", "Vueltas", "Voltas")], ["m-analysis-1.png", "Coach"], ["m-live.png", t("Telemetry", "Telemetría", "Telemetria")]];
  const MORE = () => [
    [t("Driver notes", "Notas de pilotos", "Notas de pilotos"), t("Mark the dangerous or clean drivers and see it in the relative.", "Marca a los pilotos peligrosos o limpios y velo en el relative.", "Marque os pilotos perigosos ou limpos e veja no relative.")],
    [t("Rev beeps", "Pitidos de revoluciones", "Bipes de giros"), t("A beep to change up at the revs you choose, for each car.", "Un pitido para cambiar de marcha a las revoluciones que elijas, por coche.", "Um bipe para trocar de marcha nos giros que você escolher, por carro.")],
    [t("Overlays in VR", "Overlays en VR", "Overlays em VR"), t("Every open overlay also shows in the headset through SteamVR.", "Cada overlay abierto también se ve en el casco con SteamVR.", "Cada overlay aberto também aparece no headset pelo SteamVR.")],
  ];
  const btns = () => `<div class="tr-cta"><button type="button" class="btn primary" data-tr="create">${esc(t("Create account", "Crear cuenta", "Criar conta"))}</button><a class="btn" href="/dl/PitlaneHQ-Setup.exe">${esc(t("Download for Windows", "Descargar para Windows", "Baixar para Windows"))}</a><a class="btn" href="/dl/PitlaneHQ-Android.apk">${esc(t("Download for Android", "Descargar para Android", "Baixar para Android"))}</a></div>`;

  const LEAGP = () => ({ es: "/es/ligas-iracing", pt: "/pt/ligas-iracing" })[L()] || "/iracing-leagues";
  const DISC = { oval: ["Oval", "Óvalo", "Oval"], sports_car: ["Sports Car", "Sports Car", "Sports Car"], formula_car: ["Formula Car", "Fórmula", "Fórmula"], dirt_oval: ["Dirt Oval", "Óvalo de tierra", "Oval de terra"], dirt_road: ["Dirt Road", "Tierra", "Terra"] };
  // the most active leagues (the same list as Community → Leagues), read from the server: the section shows once they are there
  async function leagues() {
    const sec = S.el && S.el.querySelector(".tr-leag"); if (!sec) return;
    let F = null; try { const r = await fetch("/community/leagues/found"); if (r.ok) F = await r.json(); } catch (e) {}
    const list = ((F && F.leagues) || []).slice(0, 6); if (!list.length || !S.el || !S.el.contains(sec)) return;
    const num = (n) => Number(n || 0).toLocaleString(L() === "en" ? "en" : L());
    sec.querySelector(".tr-lgrid").innerHTML = list.map((x) => `<article class="tr-lg tr-rv">${x.icon ? `<img src="${esc(x.icon)}" alt="" width="44" height="44" loading="lazy">` : `<span class="tr-lgi" aria-hidden="true">${esc((x.name || "?").slice(0, 1))}</span>`}<div class="tr-lgt"><b>${esc(x.name)}</b><small>${esc((x.cats || []).map((c) => t(...(DISC[c] || [c, c, c]))).join(" · ") || t("iRacing league", "Liga de iRacing", "Liga de iRacing"))}</small></div><div class="tr-lgn"><span><b class="on">${num(x.online)}</b> ${esc(t("online", "conectados", "online"))}</span><span><b>${num(x.members)}</b> ${esc(t("members", "miembros", "membros"))}</span></div><a class="btn small" href="${esc(x.invite)}" target="_blank" rel="noopener">${esc(t("Join the Discord", "Unirse al Discord", "Entrar no Discord"))}</a></article>`).join("");
    sec.hidden = false; if (S.obs) S.obs.observe(sec);
  }
  const S = { el: null, live: { on: false, raf: 0 }, obs: null, phones: false };
  function pageHTML() {
    const feats = FEATS().map(([img, h, p]) => `<section class="tr-row"><div class="tr-txt tr-rv"><h3>${esc(h)}</h3><p>${esc(p)}</p></div><div class="tr-rv" style="transition-delay:120ms">${win(img, h)}</div></section>`).join("");
    const ovs = OVS().map(([n, c]) => `<figure class="tr-ov tr-rv"><div><img src="${IMG()}ov-${n}.png" alt="${esc(c)}" loading="lazy" decoding="async"></div><figcaption>${esc(c)}</figcaption></figure>`).join("");
    const more = MORE().map(([h, p]) => `<div class="tr-more-i tr-rv"><b>${esc(h)}</b><p>${esc(p)}</p></div>`).join("");
    return `<header class="tr-hero"><div class="tr-htop"><div><h1 class="tr-rv">${esc(t("iRacing telemetry, a coach for your laps and overlays", "Telemetría para iRacing, un coach para tus vueltas y overlays", "Telemetria para iRacing, um coach para suas voltas e overlays"))}</h1><div class="tr-rv" style="transition-delay:100ms">${btns()}<p class="tr-org">${esc(t("Run an iRacing league?", "¿Organizas una liga de iRacing?", "Organiza uma liga de iRacing?"))} <button type="button" data-tr="league">${esc(t("Post it for free", "Publícala gratis", "Publique de graça"))} →</button></p></div></div><div class="tr-auth"></div></div><div class="tr-rv tr-hshot" style="transition-delay:200ms">${win("coach.jpg", "Coach")}</div></header>
<main><h2 class="tr-kick">${esc(t("What Pitlane HQ does", "Qué hace Pitlane HQ", "O que o Pitlane HQ faz"))}</h2>${feats}
<section class="tr-blk" data-live="1"><h2 class="tr-rv">${esc(t("Overlays over iRacing", "Overlays sobre iRacing", "Overlays sobre o iRacing"))}</h2><p class="tr-sub tr-rv">${esc(t("This is how they look on your screen, drawn by Pitlane HQ Agent.", "Así se ven en tu pantalla, dibujados por Pitlane HQ Agent.", "É assim que aparecem na sua tela, desenhados pelo Pitlane HQ Agent."))}</p><div class="tr-live">${liveHTML()}</div><div class="tr-ovs">${ovs}</div></section>
<section class="tr-blk tr-leag" hidden><h2 class="tr-rv">${esc(t("Find your league", "Encuentra tu liga", "Encontre sua liga"))}</h2><p class="tr-sub tr-rv">${esc(t("The most active iRacing leagues, with who is on their Discord right now.", "Las ligas de iRacing más activas, con quién está en su Discord ahora mismo.", "As ligas de iRacing mais ativas, com quem está no Discord delas agora."))}</p><div class="tr-lgrid"></div><div class="tr-cta tr-rv"><a class="btn" href="${LEAGP()}">${esc(t("See every league", "Ver todas las ligas", "Ver todas as ligas"))}</a><button type="button" class="btn primary" data-tr="league">${esc(t("Post your league for free", "Publica tu liga gratis", "Publique sua liga de graça"))}</button></div></section>
<section class="tr-blk tr-phones" hidden><h2 class="tr-rv">${esc(t("Also on your phone", "También en el móvil", "Também no celular"))}</h2><div class="tr-pgrid">${PHONES().map(([i, c]) => phone(i, c)).join("")}</div></section>
<section class="tr-blk"><h2 class="tr-small tr-rv">${esc(t("And also", "Y además", "E também"))}</h2><div class="tr-more">${more}</div></section>
<section class="tr-blk tr-end"><h2 class="tr-rv">${esc(t("Start in two minutes", "Empieza en dos minutos", "Comece em dois minutos"))}</h2><div class="tr-rv">${btns()}</div></section></main>
<footer class="tr-foot">Pitlane HQ · <a href="/downloads">${esc(t("Downloads", "Descargas", "Downloads"))}</a> · <a href="/records">${esc(t("Records", "Récords", "Recordes"))}</a> · <a href="/changelog">${esc(t("What's new", "Novedades", "Novidades"))}</a> · <a href="mailto:support@pitlanehq.app">support@pitlanehq.app</a></footer>`;
  }
  function observe() {
    if (S.obs) S.obs.disconnect();
    S.obs = new IntersectionObserver((es) => es.forEach((e) => {
      const el = e.target;
      if (el.dataset.live) { if (e.isIntersecting) liveStart(el.querySelector(".tr-live"), S.live); else liveStop(S.live); }
      if (e.isIntersecting) el.querySelectorAll(".tr-rv").forEach((r) => r.classList.add("in"));
    }), { threshold: 0.12 });
    S.el.querySelectorAll(".tr-row, .tr-blk").forEach((el) => S.obs.observe(el));
    requestAnimationFrame(() => S.el.querySelectorAll(".tr-hero .tr-rv").forEach((r) => r.classList.add("in")));
  }
  // the phone app's pictures come from its screenshot job: the section shows once they are there
  function phones() {
    const sec = S.el && S.el.querySelector(".tr-phones"); if (!sec) return;
    const imgs = [...sec.querySelectorAll("img")]; let ok = 0;
    imgs.forEach((im) => { const done = () => { if (++ok === imgs.length && imgs.every((i) => i.naturalWidth)) { sec.hidden = false; S.obs && S.obs.observe(sec); } }; if (im.complete) done(); else { im.addEventListener("load", done); im.addEventListener("error", () => {}); } im.loading = "eager"; });
  }
  // the app header carries the design's top bar: Downloads, Records and the language
  function topNav() {
    const h = document.querySelector("header.top"); if (!h) return;
    let n = h.querySelector(".tr-nav"); if (!n) { n = document.createElement("div"); n.className = "tr-nav"; h.appendChild(n); }
    n.innerHTML = `<a href="/downloads">${esc(t("Downloads", "Descargas", "Downloads"))}</a><a href="/records">${esc(t("Records", "Récords", "Recordes"))}</a><button type="button" data-tr="lang">${L().toUpperCase()} ▾</button>`;
    n.querySelector("[data-tr=lang]").onclick = () => { try { chooseLanguage(); } catch (e) {} };
  }
  // the sign-in (or create account) panel of the "me" view sits in the hero, beside the tagline, as in the design
  function auth() {
    const me = document.getElementById("meBody"), slot = S.el && S.el.querySelector(".tr-auth"), pn = me && me.querySelector(".me-auth");
    if (slot && pn) { slot.querySelectorAll(".me-auth").forEach((x) => x !== pn && x.remove()); slot.appendChild(pn); }
    const reg = document.getElementById("meToReg"); if (reg) reg.textContent = t("Create account", "Crear cuenta", "Criar conta");
  }
  function render() {
    liveStop(S.live);
    // the sign-in panel lives in the hero: take it back to the "me" view before the page is drawn again, or it goes with it
    const me = document.getElementById("meBody"), pn = S.el.querySelector(".tr-auth .me-auth"); if (me && pn) me.appendChild(pn);
    S.el.innerHTML = pageHTML();
    observe(); phones(); leagues(); auth(); topNav();
  }
  function unmount() {
    if (!S.el) return;
    document.documentElement.classList.remove("tour-on"); document.querySelectorAll("header.top .tr-nav").forEach((x) => x.remove()); if (S.mo) S.mo.disconnect(); const me = document.getElementById("meBody"), pn = S.el.querySelector(".tr-auth .me-auth"); if (me && pn) me.appendChild(pn);
    liveStop(S.live); if (S.obs) S.obs.disconnect(); clearInterval(S.langT); S.el.remove(); S.el = null;
    try { if (sessionStorage.getItem("pw.goLeagues")) { sessionStorage.removeItem("pw.goLeagues"); setTimeout(() => { try { LEAG.tab = "post"; show("leagues"); } catch (e) {} }, 1500); } } catch (e) {}
  }
  function mount() {
    if (S.el) return;
    const me = document.getElementById("meBody"); if (!me) { setTimeout(() => { if (document.documentElement.classList.contains("signwall")) mount(); }, 200); return; }
    const el = document.createElement("div"); el.id = "tour";
    me.insertAdjacentElement("afterend", el); S.el = el; render();
    document.documentElement.classList.add("tour-on");
    S.mo = new MutationObserver(auth); S.mo.observe(me, { childList: true }); auth();
    // the language window sits over the page: once chosen, the page says it in that language
    S.lang = L(); S.langT = setInterval(() => { if (!S.el) { clearInterval(S.langT); return; } if (L() !== S.lang) { S.lang = L(); render(); } }, 400);
    // from the public leagues page ("Post your league for free"): the form to create an account, then the hub
    if (new URLSearchParams(location.search).has("league-post")) setTimeout(() => { const b = el.querySelector("[data-tr=league]"); if (b) b.click(); }, 600);
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tr]"); if (!b) return;
      // posting a league needs an account: the form to create it, then the leagues hub once signed in
      if (b.dataset.tr === "league") { try { sessionStorage.setItem("pw.goLeagues", "1"); } catch (e) {} b.dataset.tr = "create"; b.click(); b.dataset.tr = "league"; return; }
      if (b.dataset.tr === "create") {
        scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => { const btn = document.getElementById("meToReg"); if (btn) btn.click(); setTimeout(() => { const f = document.querySelector(".tr-auth input"); if (f) f.focus({ preventScroll: true }); }, 80); }, 450);
      }
    });
  }
  /** Called by the sign wall (index.html) each time it changes: the page sits under the sign-in while it is up. */
  function maybeOpen(wallOn) { if (wallOn) mount(); else unmount(); }

  const st = document.createElement("style");
  st.textContent = `#tour{margin-top:34px;color:var(--fg)}
#tour .tr-hero{max-width:1120px;margin:0 auto;padding:34px 0 10px}
html.tour-on header.top .iconbtn,html.tour-on header.top .conn{display:none!important}
header.top .tr-nav{margin-left:auto;display:flex;align-items:center;gap:20px;font:400 13px var(--f-body)}header.top .tr-nav a{color:var(--accent);text-decoration:none}header.top .tr-nav a:hover{text-decoration:underline}header.top .tr-nav button{background:none;border:0;color:var(--muted);font:inherit;cursor:pointer;padding:4px}
#tour .tr-cta .btn,#tour .tr-auth .btn{font:700 14px/1.2 var(--f-body);letter-spacing:0;text-transform:none;border-radius:8px;padding:11px 18px}
#tour .tr-auth .me-auth{display:grid;grid-template-columns:1fr 1fr;column-gap:10px;padding:24px;border-radius:0;background:transparent;border:1px solid var(--line)}
#tour .tr-auth .me-auth>h2{grid-column:1/-1;font:600 18px var(--f-body);letter-spacing:0;text-transform:none;margin:0 0 14px;color:var(--fg)}
#tour .tr-auth .me-form{display:contents}#tour .tr-auth .me-form>*{grid-column:1/-1}
#tour .tr-auth label{display:block;margin-bottom:10px}#tour .tr-auth .label{font:400 12px var(--f-body);letter-spacing:0;text-transform:none;color:var(--muted)}#tour .tr-auth input{margin-top:4px;border-radius:8px}
#tour .tr-auth .me-form>button[type=submit]{grid-column:1;order:5;margin-top:6px}
#tour .tr-auth .me-switch{display:contents}#tour .tr-auth .me-switch>span{display:none}#tour .tr-auth .me-switch>.btn{grid-column:2;order:5;margin-top:6px}
#tour .tr-auth .me-form>.note{order:6;margin-top:12px!important;font-size:12px}#tour .tr-auth .me-form>.note:last-child{display:none}#tour .tr-auth .me-form>.err:empty{display:none}
#tour .tr-auth #meReg .me-strength,#tour .tr-auth #meReg>div{grid-column:1/-1}
html.tour-on #v-me>.vhead,html.tour-on #meBody>.me-welcome,html.tour-on #meBody>.me-dl{display:none!important}html.tour-on #tour{margin-top:0}
#tour .tr-htop{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:64px;align-items:center}
#tour .tr-auth .me-auth{max-width:none;margin:0}
#tour h1{font:600 46px/1.12 var(--f-body);letter-spacing:0;text-transform:none;margin:0 0 22px}
#tour .tr-cta{display:flex;flex-wrap:wrap;gap:10px}#tour .tr-cta .btn{text-decoration:none}
#tour .tr-hshot{margin-top:34px}
#tour main{max-width:1120px;margin:0 auto}
#tour .tr-kick{font:600 15px var(--f-body);color:var(--muted);letter-spacing:0;text-transform:none;margin:44px 0 0}
#tour .tr-row{display:grid;grid-template-columns:320px minmax(0,1fr);gap:56px;align-items:center;padding:40px 0;border-top:1px solid var(--line)}
#tour .tr-row:first-of-type{border-top:0}
#tour h3{font:600 24px/1.2 var(--f-body);margin:0 0 8px}#tour .tr-txt p,#tour .tr-sub{color:var(--muted);font-size:15px;line-height:1.55;margin:0}
#tour .tr-win{margin:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#11151b;box-shadow:0 18px 50px rgba(0,0,0,.45)}
#tour .tr-wbar{display:flex;align-items:center;height:30px;padding-left:10px;background:#0d1116;border-bottom:1px solid var(--line);font:400 12px 'Segoe UI',system-ui,sans-serif}
#tour .tr-wbar img{width:14px;height:14px;border-radius:3px}#tour .tr-wbar span{margin-left:8px;flex:1}#tour .tr-wbar i{width:46px;height:30px;display:flex;align-items:center;justify-content:center}#tour .tr-wbar svg{width:10px;height:10px;fill:none;stroke:#c9d1da;stroke-width:1}
#tour .tr-shot{display:block;width:100%;height:auto}
#tour .tr-blk{padding:40px 0;border-top:1px solid var(--line)}#tour .tr-blk h2{font:600 24px/1.2 var(--f-body);letter-spacing:0;text-transform:none;margin:0 0 6px}#tour .tr-blk h2.tr-small{font-size:15px;color:var(--muted)}
#tour .tr-live{margin-top:18px}
#tour .lv{position:relative;display:grid;grid-template-columns:340px minmax(0,1fr) 250px;grid-template-areas:"rel delta map" "rel radar map" "rel radar fuel" "pedals dash fuel";gap:16px 22px;padding:52px 22px 22px;border-radius:18px;border:1px solid var(--line);background:radial-gradient(120% 90% at 50% 10%,#4a5566 0%,#232a35 40%,#0b0e12 100%);overflow:hidden;color:#e7ebf1}
#tour .lv-tag{position:absolute;left:14px;top:12px;font:700 10px var(--f-data);letter-spacing:.14em;color:#ffb02e;background:rgba(13,17,22,.7);border:1px solid #4a3a14;border-radius:999px;padding:3px 9px}
#tour .lv-p{background:rgba(13,17,22,.86);border:1px solid #2a3340;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:8px 10px;min-width:0;align-self:start}
#tour .lv-delta{grid-area:delta;justify-self:center;width:100%;max-width:380px}#tour .lv-rel{grid-area:rel}#tour .lv-map{grid-area:map}#tour .lv-fuel{grid-area:fuel}#tour .lv-dash{grid-area:dash;justify-self:center;width:100%;max-width:420px;align-self:end}#tour .lv-pedals{grid-area:pedals;align-self:end}
#tour .lv-radar{grid-area:radar;background:none;border:0;box-shadow:none;justify-self:center;width:230px;padding:0}#tour .lv-radar svg{display:block;width:100%;overflow:visible}#tour .lv-radar text{font:700 11px var(--f-data)}
#tour .lv-h{display:flex;justify-content:space-between;font:700 10px var(--f-data);letter-spacing:.12em;color:#8a97a9}
#tour .lv-r{display:grid;grid-template-columns:30px 32px minmax(0,1fr) 46px 14px;gap:6px;align-items:center;padding:4px 6px;margin-top:3px;border-radius:5px;font-size:12px}#tour .lv-r>span{font:600 11px var(--f-data);opacity:.85}#tour .lv-r .nm{font:500 12px var(--f-body);opacity:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#tour .lv-r b{font:700 12px var(--f-data);text-align:right}#tour .lv-r i{font-size:10px;font-style:normal}
#tour .lv-r.me{background:#ffb02e;color:#0d1116}#tour .lv-r.me .nm{font-weight:700}
#tour .lv-dt{position:relative;height:16px;border-radius:8px;background:#1b222c;overflow:hidden}#tour .lv-dt i{position:absolute;top:0;bottom:0;border-radius:8px}#tour .lv-dt b{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#e7ebf1;opacity:.7}
#tour .lv-dr{display:flex;justify-content:center;gap:12px;margin-top:6px;align-items:center}#tour .lv-dr span{font:700 15px var(--f-data);color:#0d1116;padding:1px 10px;border-radius:999px}#tour .lv-dr em{font:500 11px var(--f-data);font-style:normal;color:#8a97a9}
#tour .lv-sl{display:flex;gap:3px;margin-bottom:8px}#tour .lv-sl i{flex:1;height:8px;border-radius:2px}
#tour .lv-dd{display:flex;align-items:flex-end;gap:16px}#tour .lv-dd>span{flex:1}#tour .lv-dd small{display:block;font:700 10px var(--f-data);letter-spacing:.12em;color:#8a97a9}#tour .lv-dd .g{font:800 46px/1 var(--f-display)}#tour .lv-dd .s{font:700 30px/1 var(--f-data)}#tour .lv-dd em{font:500 11px var(--f-data);font-style:normal;color:#8a97a9}#tour .lv-dd .r{text-align:right}#tour .lv-dd .r b{display:block;font:700 15px var(--f-data)}
#tour .lv-pd{display:flex;gap:8px;margin-top:6px}#tour .lv-pd svg{flex:1;height:64px;display:block}#tour .lv-pd s{width:12px;background:#1b222c;border-radius:3px;position:relative;overflow:hidden;text-decoration:none}#tour .lv-pd s i{position:absolute;left:0;right:0;bottom:0}
#tour .lv-map svg{display:block;width:100%}
#tour .lv-fu{display:flex;gap:18px;margin-top:4px}#tour .lv-fu b{display:block;font:700 22px var(--f-data);white-space:nowrap}#tour .lv-fu b em{font:500 11px var(--f-body);font-style:normal;color:#8a97a9}#tour .lv-fu small{display:block;font-size:10px;line-height:1.3;color:#8a97a9}#tour .lv-fuel p{margin:6px 0 0;font-size:11px;color:#4fe09a}
#tour .tr-ovs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:22px}
#tour .tr-ov{margin:0}#tour .tr-ov>div{height:150px;display:flex;align-items:center;justify-content:center;background:#0d1116;border:1px solid var(--line);border-radius:12px;padding:12px}#tour .tr-ov img{max-width:100%;max-height:126px;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.55)}#tour .tr-ov figcaption{margin-top:8px;font-size:12px;color:var(--muted)}
#tour .tr-org{margin:14px 0 0;font-size:14px;color:var(--muted)}#tour .tr-org button{background:none;border:0;padding:0;color:var(--accent);font:inherit;font-weight:600;cursor:pointer}
#tour .tr-lgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:18px 0}
#tour .tr-lg{display:grid;grid-template-columns:44px minmax(0,1fr);gap:10px 12px;align-items:center;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
#tour .tr-lg img,#tour .tr-lgi{width:44px;height:44px;border-radius:10px;display:grid;place-items:center;background:var(--line);font-weight:700}
#tour .tr-lgt{display:flex;flex-direction:column;min-width:0}#tour .tr-lgt b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#tour .tr-lgt small{color:var(--muted);font-size:12px}
#tour .tr-lgn{grid-column:1/-1;display:flex;gap:16px;font-size:13px;color:var(--muted)}#tour .tr-lgn b{color:var(--fg);font-family:var(--f-data)}#tour .tr-lgn b.on{color:var(--good,#3ecf8e)}
#tour .tr-lg .btn{grid-column:1/-1;justify-self:start;text-decoration:none;font:700 13px/1.2 var(--f-body);letter-spacing:0;text-transform:none;border-radius:8px;padding:8px 14px}
@media(max-width:900px){#tour .tr-lgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){#tour .tr-lgrid{grid-template-columns:minmax(0,1fr)}}
#tour .tr-pgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:28px;margin-top:18px}
#tour .tr-phone{margin:0}#tour .tr-phone>div{border:6px solid #2a313c;border-radius:34px;overflow:hidden;background:#11151b;box-shadow:0 18px 50px rgba(0,0,0,.45)}#tour .tr-phone img{display:block;width:100%;height:auto}#tour .tr-phone figcaption{margin-top:8px;font-size:12px;color:var(--muted);text-align:center}
#tour .tr-more{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:48px;margin-top:14px}#tour .tr-more-i{border-top:2px solid var(--accent);padding-top:10px}#tour .tr-more-i b{font-size:15px;font-weight:600}#tour .tr-more-i p{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--muted)}
#tour .tr-end h2{font-size:30px;margin-bottom:16px}
#tour .tr-foot{border-top:1px solid var(--line);padding:20px 0 8px;text-align:center;color:var(--muted);font-size:13px}#tour .tr-foot a{color:var(--accent);text-decoration:none}
#tour .tr-rv{opacity:0;transform:translateY(16px);transition:opacity .55s ease,transform .55s ease}#tour .tr-rv.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){#tour .tr-rv{opacity:1;transform:none;transition:none}}
@media(max-width:980px){#tour .lv{grid-template-columns:minmax(0,1fr) 230px;grid-template-areas:"delta delta" "rel radar" "rel map" "fuel map" "dash dash" "pedals pedals"}#tour .tr-ovs,#tour .tr-pgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){header.top .tr-nav a{display:none}}
@media(max-width:900px){#tour .tr-htop{grid-template-columns:minmax(0,1fr);gap:22px}#tour .tr-auth{order:-1}}
@media(max-width:760px){#tour h1{font-size:28px}#tour .tr-row{grid-template-columns:minmax(0,1fr);gap:14px;padding:26px 0}#tour h3{font-size:20px}
#tour .lv{grid-template-columns:minmax(0,1fr);grid-template-areas:"delta" "rel" "radar" "map" "dash" "pedals" "fuel";padding:44px 12px 12px;gap:10px}#tour .lv-radar{width:190px}
#tour .tr-ovs{grid-template-columns:minmax(0,1fr)}#tour .tr-more{grid-template-columns:minmax(0,1fr);gap:16px}#tour .tr-cta .btn{flex:1 1 45%;text-align:center}#tour .tr-wbar i{width:34px}}`;
  document.head.appendChild(st);
  window.PITLANE_TOUR = { mount, unmount, maybeOpen };
  // the sign wall can go up before this script has loaded: open the page then too
  if (document.documentElement.classList.contains("signwall")) mount();
})();
