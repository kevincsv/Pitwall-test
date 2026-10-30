/* The web's landing for a visitor (not signed in), the "Boxes" design (the owner's choice, design 1 "Escaparate"): the
   app header carries real buttons (Records, Leagues, the language, Downloads in amber); the hero is the tagline with the
   calls to action beside the sign-in card (the "me" view's own panel, moved here); then "See it from the inside", one app
   window with tabs on its left that change what it shows (the Coach, Analyzer, Races, Your laps and Leaderboards
   screenshots, landing/<lang>/*.jpg, and Live telemetry: two real laps of Spa played in a loop, landing/live-lap.json,
   with the speed, pedals, wheel and G cards over the live lap comparison); the three most active leagues; the overlays
   as the agent draws them (landing/<lang>/ov-*.png); three steps; the footer. No way into the app on invented data:
   "Create account" goes to the form at the top. The web only (COMPANION): the PC app and the phones have their own
   first screens. */
(function () {
  if (typeof COMPANION === "undefined" || !COMPANION) return;
  const L = () => (typeof LANG === "string" && /^(es|pt)$/.test(LANG) ? LANG : "en");
  const t = (en, es, pt) => ({ en, es, pt })[L()] || en;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IMG = () => "landing/" + L() + "/"; // the pictures in the page's language
  const LEAGP = () => ({ es: "/es/ligas-iracing", pt: "/pt/ligas-iracing" })[L()] || "/iracing-leagues";
  const RECP = () => ({ es: "/es/records", pt: "/pt/records" })[L()] || "/records";
  // the public pages of each game, linked from the foot so search engines reach them from "/"
  const IRP = () => ({ es: "/es/telemetria-iracing", pt: "/pt/telemetria-iracing" })[L()] || "/iracing-telemetry";
  const LMUP = () => ({ es: "/es/telemetria-le-mans-ultimate", pt: "/pt/telemetria-le-mans-ultimate" })[L()] || "/le-mans-ultimate-telemetry";

  const ICON = {
    dl: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
    rec: '<svg viewBox="0 0 24 24"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    lg: '<svg viewBox="0 0 24 24"><path d="M4 21V4"/><path d="M4 4h13l-2 4 2 4H4"/></svg>',
    lang: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></svg>',
    win: '<svg viewBox="0 0 24 24"><path d="M3 5.5 10.5 4.4v7.1H3zM11.5 4.3 21 3v8.5h-9.5zM3 12.5h7.5v7.1L3 18.5zM11.5 12.5H21V21l-9.5-1.3z"/></svg>',
    and: '<svg viewBox="0 0 24 24"><path d="M6 10h12v7a1 1 0 0 1-1 1h-1v3h-2v-3h-4v3H8v-3H7a1 1 0 0 1-1-1zM3.5 10h1.5v6H3.5zM19 10h1.5v6H19zM7.6 4.2l1.1 1.6A6 6 0 0 0 6 9h12a6 6 0 0 0-2.7-3.2l1.1-1.6"/></svg>',
    discord: '<svg viewBox="0 0 24 24"><path d="M19.6 5.3A17 17 0 0 0 15.4 4l-.5 1a16 16 0 0 0-5.8 0l-.5-1a17 17 0 0 0-4.2 1.3C1.7 9.4 1 13.4 1.3 17.3A17 17 0 0 0 6.5 20l1.1-1.7a11 11 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 11.4 0l.4.3a11 11 0 0 1-1.7.8l1.1 1.7a17 17 0 0 0 5.2-2.7c.4-4.5-.7-8.5-3.1-12zM8.5 14.9c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2zm7 0c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2z"/></svg>',
  };
  const CAPS = `<i><svg viewBox="0 0 10 10"><path d="M0 5.5h10"/></svg></i><i><svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.2"/></svg></i><i><svg viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9"/></svg></i>`;
  const BAR = `<div class="tr-wbar"><img src="icon-192.png" alt="" width="16" height="16"><span>Pitlane HQ</span>${CAPS}</div>`;
  // the screenshots' sizes, so the page never jumps while they load
  const SHOT = { "board.jpg": [2880, 1040], "coach.jpg": [2880, 1040], "compare.jpg": [2880, 1000], "laps.jpg": [2880, 880], "race.jpg": [2220, 1520] };
  const shot = (img, alt, first) => { const [w, h] = SHOT[img] || [2880, 1040]; return `<img class="tr-shot" src="${IMG()}${img}" alt="${esc(alt)}" width="${w}" height="${h}" ${first ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`; };

  // ---------- Live telemetry: two real laps (Super Formula SF23, Spa's Historic Grand Prix) played in a loop ----------
  // landing/live-lap.json: A (lap 5) and B (the lap before), one row every 10 m: [time s, km/h, throttle %, brake %, gear,
  // steering rad, lateral G, longitudinal G] (the G from the speed and the lap's path); fetched once, when the tab opens
  let LAPS = null;
  const lapData = () => LAPS || (LAPS = fetch("landing/live-lap.json").then((r) => r.json()).catch(() => { LAPS = null; return null; }));
  function startLive(cv, D) {
    const x = cv.getContext("2d"), red = reduced(), A = D.A, B = D.B, n = A.length, LAP = D.lapA;
    const VG = []; A.forEach((r) => { VG[r[4]] = Math.max(VG[r[4]] || 0, r[1]); });
    const COND = '"Barlow Condensed",sans-serif', MONO = '"JetBrains Mono",monospace', UI = '"IBM Plex Sans",sans-serif';
    const W_ = {
      speed: t("SPEED", "VELOCIDAD", "VELOCIDADE"), gear: t("GEAR", "MARCHA", "MARCHA"), pedals: t("PEDALS AND WHEEL", "PEDALES Y VOLANTE", "PEDAIS E VOLANTE"),
      thr: t("THR.", "ACEL.", "ACEL."), brk: t("BRAKE", "FRENO", "FREIO"), clu: t("CLUTCH", "EMBR.", "EMBR."), g: t("G FORCES", "FUERZAS G", "FORÇAS G"),
      cmp: t("COMPARE LAPS, LIVE", "COMPARAR VUELTAS EN VIVO", "COMPARAR VOLTAS AO VIVO"), live: t("● LIVE", "● EN VIVO", "● AO VIVO"),
      sub: t("Super Formula SF23 · Historic Grand Prix · Lap 5", "Super Formula SF23 · Grand Prix histórico · Vuelta 5", "Super Formula SF23 · Grande Prêmio histórico · Volta 5"),
      a: t("A · Lap 5", "A · Vuelta 5", "A · Volta 5"), b: t("B · Previous lap", "B · Vuelta anterior", "B · Volta anterior"),
      real: t("Real laps from Pitlane HQ", "Vueltas reales de Pitlane HQ", "Voltas reais do Pitlane HQ"),
      rows: [t("SPEED", "VELOCIDAD", "VELOCIDADE"), t("THROTTLE", "ACELERADOR", "ACELERADOR"), t("BRAKE", "FRENO", "FREIO"), t("STEERING", "VOLANTE", "VOLANTE"), t("GEAR", "MARCHA", "MARCHA")],
    };
    function at(T) {
      T = ((T % LAP) + LAP) % LAP; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m][0] <= T) lo = m; else hi = m; }
      const a = A[lo], b = lo + 1 < n ? A[lo + 1] : [LAP, ...A[0].slice(1)], k = Math.max(0, Math.min(1, (T - a[0]) / ((b[0] - a[0]) || 1))), I = (q) => a[q] + (b[q] - a[q]) * k;
      const v = I(1), gear = k < 0.5 ? a[4] : b[4];
      return { v, thr: I(2) / 100, brk: I(3) / 100, gear, steer: Math.max(-1, Math.min(1, -I(5) / Math.PI)), rpm: 4600 + 3800 * Math.min(1, v / (VG[gear] || v)), glat: I(6), glon: I(7) };
    }
    const dl = A.map((a, q) => a[0] - B[q][0]), fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`;
    let T = 24, last = performance.now(), raf = 0, HT = T; const H = []; for (let k = 59; k >= 0; k--) H.push(at(T - k * 0.05));
    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!red) T += dt; const f = at(T);
      while (HT + 0.05 <= T) { HT += 0.05; H.push(at(HT)); } while (H.length > 60) H.shift();
      const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1, W = Math.round(r.width * d), Hh = Math.round(r.height * d); if (!W || !Hh) { raf = requestAnimationFrame(draw); return; }
      if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
      const u = W / 1000; x.clearRect(0, 0, W, Hh); x.fillStyle = "#0d1116"; x.fillRect(0, 0, W, Hh);
      const txt = (s, X, Y, sz, c, w = "700", fam = MONO, al = "left") => { x.fillStyle = c; x.font = `${w} ${sz * u}px ${fam}`; x.textAlign = al; x.fillText(s, X * u, Y * u); x.textAlign = "left"; };
      const card = (X, Y, w, h, s) => { x.fillStyle = "#161c24"; x.strokeStyle = "#263140"; x.lineWidth = d; x.beginPath(); x.roundRect(X * u, Y * u, w * u, h * u, 8 * u); x.fill(); x.stroke(); txt(s, X + 12, Y + 20, 11, "#98a3b2", "600"); };
      txt("SPA-FRANCORCHAMPS", 14, 26, 15, "#eef1f5", "700", COND); txt(W_.sub, 150, 26, 12, "#98a3b2", "500", UI); txt(W_.live, 986, 26, 12, "#ffb02e", "700", MONO, "right");
      // speed, gear and the shift lights (the stored laps have no revs: the lights follow the speed in that gear)
      card(10, 40, 270, 190, W_.speed); txt(String(Math.round(f.v)), 26, 128, 76, "#eef1f5", "700", COND); txt("km/h", 28, 150, 13, "#98a3b2", "500");
      txt(String(f.gear), 262, 128, 76, "#ffb02e", "700", COND, "right"); txt(W_.gear, 262, 150, 11, "#98a3b2", "600", MONO, "right");
      const lit = Math.round(((f.rpm - 4600) / 3800) * 12); for (let i = 0; i < 12; i++) { x.fillStyle = i < lit ? (i < 6 ? "#4fe09a" : i < 10 ? "#ffb02e" : "#ff5a5a") : "#222b36"; x.beginPath(); x.roundRect((26 + i * 20.5) * u, 172 * u, 16 * u, 10 * u, 2 * u); x.fill(); }
      // pedals and wheel
      card(290, 40, 300, 190, W_.pedals);
      [[W_.thr, f.thr, "#4fe09a"], [W_.brk, f.brk, "#ff5a5a"], [W_.clu, 0, "#5aa9ff"]].forEach(([l, v, c], i) => { const X = 310 + i * 52, top = 60, h = 135; x.fillStyle = "#0f141b"; x.beginPath(); x.roundRect(X * u, top * u, 34 * u, h * u, 5 * u); x.fill(); x.fillStyle = c; const hh = h * v; x.beginPath(); x.roundRect(X * u, (top + h - hh) * u, 34 * u, hh * u, 5 * u); x.fill(); txt(l, X + 17, top + h + 18, 10, "#98a3b2", "600", MONO, "center"); });
      const cx = 520, cy = 128, R = 48; x.save(); x.translate(cx * u, cy * u); x.rotate(f.steer * Math.PI); x.strokeStyle = "#cfd6de"; x.lineWidth = 9 * u; x.beginPath(); x.arc(0, 0, R * u, 0, Math.PI * 2); x.stroke(); x.lineWidth = 7 * u; x.beginPath(); x.moveTo(-R * u, 0); x.lineTo(R * u, 0); x.moveTo(0, 0); x.lineTo(0, R * u); x.stroke(); x.fillStyle = "#ffb02e"; x.fillRect(-3 * u, -(R + 5) * u, 6 * u, 11 * u); x.restore();
      txt(`${Math.round(f.steer * -180)}°`, cx, cy + R + 34, 13, "#cfd6de", "600", MONO, "center");
      // g-g
      card(600, 40, 390, 190, W_.g); const gx = 795, gy = 140, GR = 78, sc = GR / 4; x.strokeStyle = "#263140"; x.lineWidth = d; [1, 2, 3, 4].forEach((k) => { x.beginPath(); x.arc(gx * u, gy * u, k * sc * u, 0, Math.PI * 2); x.stroke(); }); x.beginPath(); x.moveTo((gx - GR) * u, gy * u); x.lineTo((gx + GR) * u, gy * u); x.moveTo(gx * u, (gy - GR) * u); x.lineTo(gx * u, (gy + GR) * u); x.stroke();
      H.forEach((h, i, a) => { x.fillStyle = `rgba(255,176,46,${(i / a.length) * 0.5})`; x.beginPath(); x.arc((gx + h.glat * sc) * u, (gy - h.glon * sc) * u, 2.2 * u, 0, Math.PI * 2); x.fill(); });
      x.fillStyle = "#ffb02e"; x.beginPath(); x.arc((gx + f.glat * sc) * u, (gy - f.glon * sc) * u, 6 * u, 0, Math.PI * 2); x.fill();
      txt(`LAT ${Math.abs(f.glat).toFixed(2)} G`, 622, 200, 12, "#cfd6de", "600"); txt(`LONG ${f.glon.toFixed(2)} G`, 622, 220, 12, "#cfd6de", "600"); txt("1G  2G  3G  4G", 975, 220, 10, "#6c7787", "600", MONO, "right");
      // compare laps, live: this lap (A, drawn up to where the car is) against the lap before (B, whole), over the lap's distance
      card(10, 240, 980, 390, W_.cmp); const tx = 110, tw = 740, px = (q) => (tx + (q / (n - 1)) * tw) * u;
      const TT = ((T % LAP) + LAP) % LAP; let lo = 0; while (lo < n - 2 && A[lo + 1][0] <= TT) lo++;
      const fr = Math.max(0, Math.min(1, (TT - A[lo][0]) / ((A[lo + 1][0] - A[lo][0]) || 1))), ia = lo + fr, ic = Math.min(n - 1, Math.round(ia));
      x.fillStyle = "#ffb02e"; x.fillRect(560 * u, 251 * u, 10 * u, 10 * u); txt(`${W_.a} · ${fmt(TT)}`, 576, 260, 11, "#eef1f5", "600");
      x.fillStyle = "#5aa9ff"; x.fillRect(770 * u, 251 * u, 10 * u, 10 * u); txt(`${W_.b} · ${fmt(D.lapB)}`, 786, 260, 11, "#eef1f5", "600");
      const dN = dl[lo] + (dl[Math.min(n - 1, lo + 1)] - dl[lo]) * fr;
      const RW = [["DELTA", null, 54, 1], [W_.rows[0], (q) => q[1] / 300, 70, 0, (q) => q[1], ""], [W_.rows[1], (q) => q[2] / 100, 38, 0, (q) => q[2], "%"], [W_.rows[2], (q) => q[3] / 100, 38, 0, (q) => q[3], "%"], [W_.rows[3], (q) => q[5] / Math.PI, 38, 1, (q) => Math.round(q[5] * 57.3), "°"], [W_.rows[4], (q) => (q[4] - 1) / 5, 38, 2, (q) => q[4], ""]];
      let Y = 276;
      RW.forEach(([l, fn, hh, mode, val, un]) => {
        const mid = Y + hh / 2, yv = (v) => (mode === 1 ? mid - Math.max(-1, Math.min(1, v)) * (hh / 2) : Y + hh - Math.max(0, Math.min(1, v)) * hh) * u;
        x.fillStyle = "#11171e"; x.fillRect(tx * u, Y * u, tw * u, hh * u); x.strokeStyle = "#222b36"; x.lineWidth = d; x.beginPath(); const zy = mode === 1 ? mid : Y + hh; x.moveTo(tx * u, zy * u); x.lineTo((tx + tw) * u, zy * u); x.stroke();
        const line = (arr, to, c, w) => { x.strokeStyle = c; x.lineWidth = w * d; x.lineJoin = "round"; x.beginPath(); for (let q = 0; q <= to; q++) { const X = px(q), Yv = yv(fn(arr[q])); if (!q) x.moveTo(X, Yv); else if (mode === 2) { x.lineTo(X, yv(fn(arr[q - 1]))); x.lineTo(X, Yv); } else x.lineTo(X, Yv); } x.stroke(); };
        txt(l, 24, mid + 4, 10, "#98a3b2", "600");
        if (!fn) {
          const sc2 = 0.5;
          for (let q = 1; q <= ic; q++) { const c = dl[q] > 0 ? "#ff5a5a" : "#4fe09a", X0 = px(q - 1), X1 = px(q), y0 = yv(dl[q - 1] / sc2), y1 = yv(dl[q] / sc2); x.fillStyle = c + "33"; x.beginPath(); x.moveTo(X0, mid * u); x.lineTo(X0, y0); x.lineTo(X1, y1); x.lineTo(X1, mid * u); x.fill(); x.strokeStyle = c; x.lineWidth = 1.8 * d; x.beginPath(); x.moveTo(X0, y0); x.lineTo(X1, y1); x.stroke(); }
          x.fillStyle = dN <= 0 ? "#4fe09a" : "#ff5a5a"; x.beginPath(); x.arc(px(ia), yv(dN / sc2), 3.5 * u, 0, Math.PI * 2); x.fill();
          txt((dN > 0 ? "+" : dN < 0 ? "−" : "") + Math.abs(dN).toFixed(3) + " s", tx + tw + 14, mid + 6, 17, dN <= 0 ? "#4fe09a" : "#ff5a5a", "700");
        } else {
          line(B, n - 1, "#5aa9ff", 1.4); line(A, ic, "#ffb02e", 2);
          const big = hh > 40; txt(val(A[ic]) + un, tx + tw + 14, mid + (big ? -2 : 4), big ? 15 : 12, "#ffb02e"); txt(val(B[ic]) + un, tx + tw + (big ? 14 : 70), mid + (big ? 16 : 4), big ? 15 : 12, "#5aa9ff");
        }
        Y += hh + 8;
      });
      const cx2 = px(ia); x.strokeStyle = "#eef1f5aa"; x.lineWidth = d; x.beginPath(); x.moveTo(cx2, 276 * u); x.lineTo(cx2, (Y - 8) * u); x.stroke();
      const per = D.step || 10; for (let km = 0; km <= 9; km++) { const q = (km * 1000) / per; if (q > n - 1) break; txt(`${km} km`, tx + (q / (n - 1)) * tw, Y + 6, 10, "#6c7787", "600", MONO, "center"); }
      txt(W_.real, 24, 622, 10, "#6c7787", "500", UI);
      if (!red) raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }

  // ---------- the page ----------
  const TABS = () => [
    ["coach.jpg", "Coach", t("Your plan for the next session, with the corner that costs you most and what to do there.", "Tu plan para la próxima sesión, con la curva que más te cuesta y qué hacer en ella.", "Seu plano para a próxima sessão, com a curva que mais custa e o que fazer nela.")],
    ["compare.jpg", t("Analyzer", "Analizador", "Analisador"), t("Your lap against your own or the community's fastest, corner by corner.", "Tu vuelta contra la tuya o contra la más rápida de la comunidad, curva a curva.", "Sua volta contra a sua ou a mais rápida da comunidade, curva a curva.")],
    ["race.jpg", t("Races", "Carreras", "Corridas"), t("Start, finish, iRating, incidents and every lap of the race.", "Salida, llegada, iRating, incidentes y cada vuelta de la carrera.", "Largada, chegada, iRating, incidentes e cada volta da corrida.")],
    ["live", t("Live telemetry", "Telemetría en vivo", "Telemetria ao vivo"), t("Speed, pedals, steering and G forces live, and your lap compared with the one before metre by metre, on your phone too.", "Velocidad, pedales, volante y fuerzas G en vivo, y tu vuelta comparada con la anterior metro a metro, también en el móvil.", "Velocidade, pedais, volante e forças G ao vivo, e sua volta comparada com a anterior metro a metro, também no celular.")],
    ["laps.jpg", t("Your laps", "Tus vueltas", "Suas voltas"), t("Every session with its laps and sectors, saved by itself.", "Cada sesión con sus vueltas y sectores, guardada sola.", "Cada sessão com suas voltas e setores, salva sozinha.")],
    ["board.jpg", t("Leaderboards", "Clasificaciones", "Classificações"), t("The fastest lap of every car and track, by discipline.", "La vuelta más rápida de cada coche y circuito, por disciplina.", "A volta mais rápida de cada carro e pista, por disciplina.")],
  ];
  const OVS = () => [
    ["relative", "Relative"], ["deltabar", t("Delta bar", "Barra de delta", "Barra de delta")], ["dash", "Dash"], ["g-inputs", t("Pedals", "Pedales", "Pedais")],
    ["standings", t("Standings", "Clasificación", "Classificação")], ["fuel", t("Fuel", "Combustible", "Combustível")], ["g-timing", t("Timing", "Tiempos", "Tempos")], ["g-tyres", t("Tyres", "Neumáticos", "Pneus")],
    ["gg", t("G forces", "Fuerzas G", "Forças G")], ["s-sectors", t("Mini-sectors", "Minisectores", "Minissetores")], ["pit", t("Pit stop", "Parada en boxes", "Parada nos boxes")], ["l-brakes", t("Braking points", "Puntos de frenada", "Pontos de frenagem")],
    ["gaps", t("Gaps", "Diferencias", "Diferenças")], ["weather", t("Weather", "Meteo", "Clima")], ["l-coach", t("Coach on track", "Coach en pista", "Coach na pista")], ["trackbar", t("Track position", "Posiciones en pista", "Posições na pista")],
  ];
  const CHIPS = () => [t("Opacity per overlay", "Opacidad por overlay", "Opacidade por overlay"), t("No title", "Sin título", "Sem título"), t("Flags", "Banderas", "Bandeiras"), t("Penalty clock", "Reloj de penalización", "Relógio de penalidade")];
  const STEPS = () => [
    [t("Create your account", "Crea tu cuenta", "Crie sua conta"), t("With your email, Steam or Discord.", "Con tu email, Steam o Discord.", "Com seu email, Steam ou Discord.")],
    [t("Install the agent", "Instala el agente", "Instale o agente"), t("Pitlane HQ for Windows.", "Pitlane HQ para Windows.", "Pitlane HQ para Windows.")],
    [t("Hit the track", "Sal a pista", "Vá para a pista"), t("Every lap shows on the web and on your phone without you doing anything.", "Cada vuelta aparece en la web y en el móvil sin que hagas nada.", "Cada volta aparece na web e no celular sem você fazer nada.")],
  ];
  const DISC = { oval: ["Oval", "Óvalo", "Oval"], sports_car: ["Sports Car", "Sports Car", "Sports Car"], formula_car: ["Formula Car", "Fórmula", "Fórmula"], dirt_oval: ["Dirt Oval", "Óvalo de tierra", "Oval de terra"], dirt_road: ["Dirt Road", "Tierra", "Terra"] };
  const head = (eyb, h2, p) => `<header class="tr-sh"><div><span class="tr-eyb">${esc(eyb)}</span><h2>${esc(h2)}</h2></div>${p ? `<p>${esc(p)}</p>` : ""}</header>`;

  // the three most active leagues (the same list as Community → Leagues), read from the server: the section shows once they are there
  async function leagues() {
    const sec = S.el && S.el.querySelector(".tr-leag"); if (!sec) return;
    const get = async (g) => { try { const r = await fetch("/community/leagues/found?game=" + g); if (r.ok) return ((await r.json()).leagues || []).map((x) => ({ ...x, game: g })); } catch (e) {} return []; };
    const all = [].concat(...(await Promise.all(["iracing", "lmu"].map(get))));
    const list = all.sort((a, b) => (b.online || 0) - (a.online || 0) || (b.members || 0) - (a.members || 0)).slice(0, 3); if (!list.length || !S.el || !S.el.contains(sec)) return;
    const num = (n) => Number(n || 0).toLocaleString(L() === "en" ? "en" : L());
    const what = (x) => x.game === "lmu" ? "Le Mans Ultimate" : (x.cats || []).length === 1 ? t(...(DISC[x.cats[0]] || [x.cats[0], x.cats[0], x.cats[0]])) : (x.cats || []).length > 1 ? t("Several disciplines", "Varias disciplinas", "Várias disciplinas") : "iRacing";
    sec.querySelector(".tr-top3").innerHTML = list.map((x, k) => `<article class="tr-card tr-lgc"><div class="tr-lgh">${x.icon ? `<img src="${esc(x.icon)}" alt="" width="46" height="46" loading="lazy">` : `<i aria-hidden="true">${esc((x.name || "?").slice(0, 1).toUpperCase())}</i>`}<span class="tr-rk">#${k + 1}</span></div><h3>${esc(x.name)}</h3><p>${esc(what(x))}</p><div class="tr-lgn"><span><b class="on">● ${num(x.online)}</b> ${esc(t("online", "conectados", "online"))}</span><span><b>${num(x.members)}</b> ${esc(t("members", "miembros", "membros"))}</span></div><a class="tr-b tr-disc" href="${esc(x.invite)}" target="_blank" rel="noopener">${ICON.discord}${esc(t("Join on Discord", "Unirse en Discord", "Entrar no Discord"))}</a></article>`).join("");
    sec.hidden = false;
  }
  const S = { el: null, stop: null };
  function pageHTML() {
    const tabs = TABS().map(([k, h, p], i) => `<button type="button" role="tab" aria-selected="${i ? "false" : "true"}" data-show="${k}"><b>${esc(h)}</b><span>${esc(p)}</span></button>`).join("");
    const ovs = OVS().map(([f, c]) => `<figure${f === "gg" ? ' class="tr-gg"' : ""}><img src="${IMG()}ov-${f}.png" alt="${esc("Overlay " + c)}" loading="lazy" decoding="async"><figcaption>${esc(c)}</figcaption></figure>`).join("");
    return `<section class="tr-hero"><div><div class="tr-eyb">iRacing <span>·</span> Le Mans Ultimate <span>(beta)</span></div>
<h1>${t("Telemetry, coach and <em>overlays</em> for your laps", "Telemetría, coach y <em>overlays</em> para tus vueltas", "Telemetria, coach e <em>overlays</em> para suas voltas")}</h1>
<p class="tr-lead">${esc(t("Pitlane HQ records every iRacing and Le Mans Ultimate lap while you drive, tells you which corner costs you time and puts the overlays over the game.", "Pitlane HQ guarda cada vuelta de iRacing y Le Mans Ultimate mientras conduces, te dice en qué curva pierdes tiempo y pone los overlays encima del juego.", "O Pitlane HQ grava cada volta do iRacing e do Le Mans Ultimate enquanto você pilota, diz em qual curva você perde tempo e coloca os overlays sobre o jogo."))}</p>
<div class="tr-ctas"><button type="button" class="tr-b tr-p" data-tr="create">${esc(t("Create account", "Crear cuenta", "Criar conta"))}</button><a class="tr-b" href="/dl/PitlaneHQ-Setup.exe">${ICON.win}${esc(t("Download for Windows", "Descargar para Windows", "Baixar para Windows"))}</a><a class="tr-b" href="/dl/PitlaneHQ-Android.apk">${ICON.and}Android</a></div>
<p class="tr-hint">${esc(t("Run an iRacing or LMU league?", "¿Organizas una liga de iRacing o LMU?", "Organiza uma liga de iRacing ou LMU?"))} <button type="button" data-tr="league">${esc(t("Post it for free", "Publícala gratis", "Publique de graça"))} →</button></p></div>
<div class="tr-auth"></div></section>
<section class="tr-sec">${head(t("What Pitlane HQ does", "Qué hace Pitlane HQ", "O que o Pitlane HQ faz"), t("See it from the inside", "Míralo por dentro", "Veja por dentro"))}
<div class="tr-show"><div class="tr-tabs" role="tablist" aria-label="${esc(t("Features", "Funciones", "Funções"))}">${tabs}</div><figure class="tr-win">${BAR}<div class="tr-wbody">${shot("coach.jpg", "Coach", true)}</div></figure></div></section>
<section class="tr-sec tr-leag" hidden>${head(t("Leagues", "Ligas", "Ligas"), t("The most active leagues right now", "Las ligas más activas ahora", "As ligas mais ativas agora"), t("Found on Reddit, with who is on their Discord right now.", "Encontradas en Reddit, con quién está en su Discord en este momento.", "Encontradas no Reddit, com quem está no Discord delas agora."))}
<div class="tr-top3"></div><div class="tr-ctas"><a class="tr-b" href="${LEAGP()}">${esc(t("See every league", "Ver todas las ligas", "Ver todas as ligas"))}</a><button type="button" class="tr-b" data-tr="league">${esc(t("Post your league for free", "Publica tu liga gratis", "Publique sua liga de graça"))}</button></div></section>
<section class="tr-sec">${head("Overlays", t("Over the game", "Encima del juego", "Sobre o jogo"), t("Each overlay with its own design, its opacity and what you want to see. In VR too.", "Cada overlay con su diseño, su opacidad y lo que quieres ver. También en VR.", "Cada overlay com seu design, sua opacidade e o que você quer ver. Também em VR."))}
<div class="tr-scene"><div class="tr-chips">${CHIPS().map((c) => `<span>${esc(c)}</span>`).join("")}</div><div class="tr-ovm">${ovs}</div>
<p class="tr-ex">${esc(t("And also radar, map, flags, engine, incidents, stats, live compare and performance.", "Y también radar, mapa, banderas, motor, incidentes, estadísticas, comparación en vivo y rendimiento.", "E também radar, mapa, bandeiras, motor, incidentes, estatísticas, comparação ao vivo e desempenho."))}</p></div></section>
<section class="tr-sec">${head(t("Start in two minutes", "Empieza en dos minutos", "Comece em dois minutos"), t("Three steps", "Tres pasos", "Três passos"))}
<div class="tr-steps">${STEPS().map(([h, p], i) => `<div class="tr-card"><s>${i + 1}</s><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></section>
<footer class="tr-foot"><span>Pitlane HQ</span><a href="${IRP()}">${esc(t("iRacing telemetry", "Telemetría iRacing", "Telemetria iRacing"))}</a><a href="${LMUP()}">${esc(t("Le Mans Ultimate telemetry", "Telemetría Le Mans Ultimate", "Telemetria Le Mans Ultimate"))}</a><a href="/downloads">${esc(t("Downloads", "Descargas", "Downloads"))}</a><a href="${RECP()}">${esc(t("Records", "Récords", "Recordes"))}</a><a href="${LEAGP()}">${esc(t("Leagues", "Ligas", "Ligas"))}</a><a href="/changelog">${esc(t("What's new", "Novedades", "Novidades"))}</a><a href="mailto:support@pitlanehq.app">support@pitlanehq.app</a></footer>`;
  }
  // a tab changes what the window shows: a screenshot, or the live telemetry drawn from the real laps
  function showTab(b) {
    const box = S.el && S.el.querySelector(".tr-wbody"); if (!box) return;
    S.el.querySelectorAll(".tr-tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    if (S.stop) { S.stop(); S.stop = null; }
    const k = b.dataset.show, alt = b.querySelector("b").textContent;
    if (k !== "live") { box.innerHTML = shot(k, alt); return; }
    box.innerHTML = `<canvas class="tr-tele" role="img" aria-label="${esc(alt)}"></canvas>`;
    const cv = box.querySelector("canvas"), tok = (S.tok = {});
    Promise.resolve(lapData()).then((D) => { if (!D || S.tok !== tok || !cv.isConnected) return; S.stop = startLive(cv, D); });
  }
  // the app header carries the design's buttons: Records, Leagues, the language and Downloads
  function topNav() {
    const h = document.querySelector("header.top"); if (!h) return;
    let n = h.querySelector(".tr-nav"); if (!n) { n = document.createElement("div"); n.className = "tr-nav"; h.appendChild(n); }
    n.innerHTML = `<a class="tr-hb" href="${RECP()}">${ICON.rec}<span>${esc(t("Records", "Récords", "Recordes"))}</span></a><a class="tr-hb" href="${LEAGP()}">${ICON.lg}<span>${esc(t("Leagues", "Ligas", "Ligas"))}</span></a><button type="button" class="tr-hb tr-lang" data-tr="lang">${ICON.lang}${L().toUpperCase()} ▾</button><a class="tr-hb tr-dl" href="/downloads">${ICON.dl}<span>${esc(t("Downloads", "Descargas", "Downloads"))}</span></a>`;
    n.querySelector("[data-tr=lang]").onclick = () => { try { chooseLanguage(); } catch (e) {} };
  }
  // the sign-in (or create account) panel of the "me" view sits in the hero, beside the tagline, as in the design
  function auth() {
    const me = document.getElementById("meBody"), slot = S.el && S.el.querySelector(".tr-auth"), pn = me && me.querySelector(".me-auth");
    if (slot && pn) { slot.querySelectorAll(".me-auth").forEach((x) => x !== pn && x.remove()); slot.appendChild(pn); }
    const reg = document.getElementById("meToReg"); if (reg) reg.textContent = t("Create account", "Crear cuenta", "Criar conta");
  }
  function render() {
    if (S.stop) { S.stop(); S.stop = null; }
    // the sign-in panel lives in the hero: take it back to the "me" view before the page is drawn again, or it goes with it
    const me = document.getElementById("meBody"), pn = S.el.querySelector(".tr-auth .me-auth"); if (me && pn) me.appendChild(pn);
    S.el.innerHTML = pageHTML();
    leagues(); auth(); topNav();
  }
  function unmount() {
    if (!S.el) return;
    document.documentElement.classList.remove("tour-on"); document.querySelectorAll("header.top .tr-nav").forEach((x) => x.remove()); if (S.mo) S.mo.disconnect(); const me = document.getElementById("meBody"), pn = S.el.querySelector(".tr-auth .me-auth"); if (me && pn) me.appendChild(pn);
    if (S.stop) { S.stop(); S.stop = null; } clearInterval(S.langT); S.el.remove(); S.el = null;
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
      const tb = ev.target.closest(".tr-tabs button"); if (tb) { showTab(tb); return; }
      const b = ev.target.closest("[data-tr]"); if (!b) return;
      // posting a league needs an account: the form to create it, then the leagues hub once signed in
      if (b.dataset.tr === "league") { try { sessionStorage.setItem("pw.goLeagues", "1"); } catch (e) {} b.dataset.tr = "create"; b.click(); b.dataset.tr = "league"; return; }
      if (b.dataset.tr === "create") {
        scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => { const btn = document.getElementById("meToReg"); if (btn) btn.click(); setTimeout(() => { const f = document.querySelector(".tr-auth input"); if (f) f.focus({ preventScroll: true }); }, 80); }, 450);
      }
    });
    el.addEventListener("keydown", (ev) => {
      const tb = ev.target.closest(".tr-tabs button"); if (!tb || !/Arrow(Up|Down|Left|Right)/.test(ev.key)) return;
      const bs = [...el.querySelectorAll(".tr-tabs button")], i = bs.indexOf(tb), nx = bs[(i + (/Down|Right/.test(ev.key) ? 1 : bs.length - 1)) % bs.length];
      showTab(nx); nx.focus(); ev.preventDefault();
    });
  }
  /** Called by the sign wall (index.html) each time it changes: the page sits under the sign-in while it is up. */
  function maybeOpen(wallOn) { if (wallOn) mount(); else unmount(); }

  const st = document.createElement("style");
  st.textContent = `#tour{--tr-card:#161c24;--tr-card2:#11161d;--tr-edge:#263140;--tr-mute:#98a3b2;--tr-dim:#6c7787;--tr-ac:#ffb02e;--tr-ink:#1a1204;color:#eef1f5;font-family:var(--f-body);max-width:1200px;margin:0 auto}
html.tour-on header.top .iconbtn,html.tour-on header.top .conn{display:none!important}
header.top .tr-nav{margin-left:auto;display:flex;align-items:center;gap:6px}
header.top .tr-hb{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border-radius:8px;background:#161c24;border:1px solid #263140;font:500 14px var(--f-body);cursor:pointer;text-decoration:none;color:#eef1f5;transition:border-color .15s,background .15s;white-space:nowrap}
header.top .tr-hb:hover{border-color:#3a4a5e;background:#1b222c}
header.top .tr-hb svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:#ffb02e;flex:none}
header.top .tr-lang{font:500 13px var(--f-data)}header.top .tr-lang svg{color:#98a3b2}
header.top .tr-dl{background:#ffb02e;border-color:#ffb02e;color:#1a1204;font-weight:600}header.top .tr-dl svg{color:#1a1204}header.top .tr-dl:hover{background:#ffc04f;border-color:#ffc04f}
@media(max-width:720px){header.top .tr-hb>span{display:none}header.top .tr-hb{padding:0 10px}header.top .tr-dl>span{display:inline}}
@media(max-width:520px){html.tour-on header.top .version-badge{display:none}}
@media(max-width:420px){header.top .tr-nav{gap:4px}header.top .tr-hb{padding:0 8px}header.top .tr-dl>span{display:none}}
html.tour-on #v-me>.vhead,html.tour-on #meBody>.me-welcome,html.tour-on #meBody>.me-dl{display:none!important}
#tour .tr-hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:56px;align-items:center;padding:56px 0 48px}
#tour .tr-eyb{font:600 12px var(--f-data);color:#ffb02e;letter-spacing:.08em;text-transform:uppercase;display:flex;gap:10px;flex-wrap:wrap}#tour .tr-eyb span{color:#98a3b2}
#tour h1{font:700 clamp(42px,5.6vw,72px)/.94 var(--f-display);text-transform:uppercase;letter-spacing:0;margin:14px 0 18px;text-wrap:balance}#tour h1 em{font-style:normal;color:#ffb02e}
#tour .tr-lead{color:#98a3b2;font-size:17px;line-height:1.6;max-width:46ch;margin:0 0 24px}
#tour .tr-ctas{display:flex;gap:10px;flex-wrap:wrap}
#tour .tr-b{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 18px;border-radius:8px;font:600 15px var(--f-body);letter-spacing:0;text-transform:none;border:1px solid #263140;background:#161c24;color:#eef1f5;text-decoration:none;cursor:pointer}
#tour .tr-b:hover{border-color:#3a4a5e}#tour .tr-b svg{width:17px;height:17px;fill:currentColor;flex:none}
#tour .tr-b.tr-p{background:#ffb02e;border-color:#ffb02e;color:#1a1204}#tour .tr-b.tr-p:hover{background:#ffc04f}
#tour .tr-b.tr-disc{background:#5865f21f;border-color:#5865f266}
#tour .tr-hint{margin:16px 0 0;font-size:14px;color:#98a3b2}#tour .tr-hint button{background:none;border:0;padding:0;color:#ffb02e;font:inherit;font-weight:600;cursor:pointer}
#tour .tr-auth .me-auth{display:grid;grid-template-columns:1fr 1fr;column-gap:8px;max-width:none;margin:0;padding:22px;border-radius:14px;background:#161c24;border:1px solid #263140;box-shadow:0 30px 60px -30px #000}
#tour .tr-auth .me-auth>h2{grid-column:1/-1;display:flex;align-items:center;gap:10px;font:600 18px var(--f-body);letter-spacing:0;text-transform:none;margin:0 0 16px;padding:0 0 14px;min-height:0;background:none;border:0;border-bottom:1px solid #263140;color:#eef1f5}
#tour .tr-auth .me-auth>h2::before{width:3px;height:18px;background:#ffb02e;border-radius:2px}
#tour .tr-auth .me-form{display:contents}#tour .tr-auth .me-form>*{grid-column:1/-1}
#tour .tr-auth label{display:block;margin-bottom:14px}#tour .tr-auth .label{font:400 13px var(--f-body);letter-spacing:0;text-transform:none;color:#98a3b2}
#tour .tr-auth input{margin-top:6px;height:42px;border-radius:8px;background:#11161d;border:1px solid #263140}#tour .tr-auth input:focus{border-color:#ffb02e;outline:none}
#tour .tr-auth .btn{font:600 14px/1.2 var(--f-body);letter-spacing:0;text-transform:none;border-radius:8px;min-height:42px;padding:10px}
#tour .tr-auth .me-form>button[type=submit]{grid-column:1;order:5;margin-top:4px;background:#ffb02e;border-color:#ffb02e;color:#1a1204}
#tour .tr-auth .me-switch{display:contents}#tour .tr-auth .me-switch>span{display:none}#tour .tr-auth .me-switch>.btn{grid-column:2;order:5;margin-top:4px}
#tour .tr-auth .me-auth .me-steam{grid-column:1/-1;order:6;margin:0;display:flex;flex-direction:column}#tour .tr-auth .me-auth .me-steam::before{content:"";display:block;height:1px;background:#263140;margin:14px 0}
#tour .tr-auth .me-auth .me-steam.first{order:0;margin:0 0 12px}#tour .tr-auth .me-auth .me-steam.first::before{display:none}
#tour .tr-auth .me-oab{grid-template-columns:1fr 1fr}#tour .tr-auth .me-steam .btn:not(.dc){background:#1b2838}#tour .tr-auth .me-steam .btn.dc{background:#5865f21f;border-color:#5865f266;color:#eef1f5}
#tour .tr-auth .me-form>.note{order:7;margin-top:14px!important;font-size:13px}#tour .tr-auth .me-form>.note:last-child{display:none}#tour .tr-auth .me-form>.err:empty{display:none}
#tour .tr-auth .me-auth>.callout{grid-column:1/-1}#tour .tr-auth .me-auth .me-steam .note:empty{display:none}#tour .tr-auth .me-auth .me-form>.note a,#tour .tr-auth .me-auth a{color:#ffb02e}
#tour .tr-auth #meReg .me-strength,#tour .tr-auth #meReg>div{grid-column:1/-1}
#tour .tr-sec{padding:64px 0;border-top:1px solid #263140}
#tour .tr-sh{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap;margin-bottom:28px}
#tour .tr-sh h2{font:700 clamp(30px,3.6vw,44px)/1 var(--f-display);text-transform:uppercase;letter-spacing:0;margin:8px 0 0}
#tour .tr-sh p{color:#98a3b2;margin:0;max-width:46ch;line-height:1.55}
#tour .tr-card{background:#161c24;border:1px solid #263140;border-radius:12px;padding:20px;min-width:0}
#tour .tr-card h3{font:700 22px var(--f-display);text-transform:uppercase;margin:0 0 6px;letter-spacing:.02em}
#tour .tr-card p{color:#98a3b2;margin:0;line-height:1.55;font-size:14px}
#tour .tr-show{display:grid;grid-template-columns:260px minmax(0,1fr);gap:24px;align-items:start}
#tour .tr-tabs{display:grid;gap:6px}
#tour .tr-tabs button{all:unset;cursor:pointer;display:block;padding:14px 16px;border-radius:10px;border:1px solid transparent;color:#98a3b2}
#tour .tr-tabs button b{display:block;font:700 19px var(--f-display);text-transform:uppercase;color:#eef1f5;letter-spacing:.02em}
#tour .tr-tabs button span{display:none;font-size:14px;line-height:1.5;margin-top:4px}
#tour .tr-tabs button[aria-selected="true"]{background:#161c24;border-color:#263140;box-shadow:inset 3px 0 #ffb02e}#tour .tr-tabs button[aria-selected="true"] span{display:block}
#tour .tr-tabs button:focus-visible{outline:2px solid #ffb02e}
#tour .tr-win{margin:0;border-radius:10px;overflow:hidden;border:1px solid #263140;background:#0a0d11;box-shadow:0 40px 80px -40px #000;min-width:0}
#tour .tr-wbar{display:flex;align-items:center;height:32px;padding-left:12px;background:#1a1f27;font:400 12px 'Segoe UI',system-ui,sans-serif;color:#c9d1db}
#tour .tr-wbar img{width:14px;height:14px;border-radius:3px}#tour .tr-wbar span{margin-left:8px;flex:1}#tour .tr-wbar i{width:44px;height:32px;display:flex;align-items:center;justify-content:center}#tour .tr-wbar svg{width:10px;height:10px;fill:none;stroke:#98a3b2;stroke-width:1}
#tour .tr-shot{display:block;width:100%;height:auto}
#tour .tr-tele{display:block;width:100%;aspect-ratio:1000/640;background:#0d1116}
#tour .tr-top3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px}
#tour .tr-lgc{display:flex;flex-direction:column;gap:10px}#tour .tr-lgc h3{margin:0;overflow-wrap:anywhere}
#tour .tr-lgh{display:flex;justify-content:space-between;align-items:center}
#tour .tr-lgh i,#tour .tr-lgh img{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font:700 22px var(--f-display);font-style:normal;background:#5865f222;color:#9aa4ff}
#tour .tr-rk{font:700 28px var(--f-display);color:#6c7787}
#tour .tr-lgn{display:flex;gap:16px;font-size:13px;color:#98a3b2;flex-wrap:wrap;font-variant-numeric:tabular-nums}#tour .tr-lgn b{color:#eef1f5}#tour .tr-lgn b.on{color:#4fe09a}
#tour .tr-lgc .tr-b{margin-top:auto}
#tour .tr-scene{border-radius:12px;border:1px solid #263140;background:radial-gradient(90% 120% at 30% 0,#2f3b4b,#0a0d12 70%);padding:18px}
#tour .tr-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}#tour .tr-chips span{border:1px solid #263140;background:#11161d;border-radius:999px;padding:6px 12px;font-size:13px;color:#cfd6de}
#tour .tr-ovm{columns:3 260px;column-gap:14px}
#tour .tr-ovm figure{break-inside:avoid;margin:0 0 14px;display:block}#tour .tr-ovm img{display:block;width:100%;height:auto;border-radius:6px;box-shadow:0 10px 24px -12px #000}#tour .tr-ovm .tr-gg img{width:62%}
#tour .tr-ovm figcaption{font:600 11px var(--f-data);color:#98a3b2;text-transform:uppercase;letter-spacing:.06em;margin-top:6px}
#tour .tr-ex{font-size:12px;color:#6c7787;margin:10px 0 0}
#tour .tr-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}#tour .tr-steps s{text-decoration:none;font:700 13px var(--f-data);color:#ffb02e}
#tour .tr-foot{border-top:1px solid #263140;padding:26px 0;margin-top:20px;color:#98a3b2;font-size:13px;display:flex;gap:18px;flex-wrap:wrap}#tour .tr-foot a{color:#ffb02e;text-decoration:none}
@media(max-width:900px){#tour .tr-hero{grid-template-columns:minmax(0,1fr);gap:32px;padding:32px 0}}
@media(max-width:860px){#tour .tr-show{grid-template-columns:minmax(0,1fr)}#tour .tr-tabs{grid-auto-flow:column;grid-auto-columns:max-content;overflow-x:auto;scrollbar-width:none}#tour .tr-tabs button span{display:none!important}#tour .tr-top3{grid-template-columns:minmax(0,1fr)}}
@media(max-width:820px){#tour .tr-steps{grid-template-columns:minmax(0,1fr)}}
@media(max-width:600px){#tour .tr-sec{padding:44px 0}#tour .tr-ctas .tr-b{flex:1 1 auto}#tour .tr-wbar i{width:34px}}
@media(prefers-reduced-motion:reduce){#tour *{transition:none!important}}`;
  document.head.appendChild(st);
  window.PITLANE_TOUR = { mount, unmount, maybeOpen };
  // the sign wall can go up before this script has loaded: open the page then too
  if (document.documentElement.classList.contains("signwall")) mount();
})();
