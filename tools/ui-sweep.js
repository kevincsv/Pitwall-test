// The web app's phone-width check: opens every main view of web/dist at a PC width (1300) and a phone width (390)
// with the demo data on, as an admin, and reports the page errors and every element wider than the screen, with a
// full-page screenshot of each view in <outdir>/ui/. Serve web/dist first (python3 -m http.server 8799 from
// web/dist); needs Playwright (npm i playwright, and its Chromium). Run: node tools/ui-sweep.js <outdir>
const { chromium } = require('playwright');
const views=["home","laps","coach","cloudlaps","races","live","overlays","community","me","settings"];
(async () => {
  const b = await chromium.launch();
  for (const width of [1300, 390]) {
    const p = await b.newPage({viewport:{width,height:width>800?900:844}});
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error' && !/404|Failed to load|net::|pitlanehq\.app/.test(m.text())) errs.push('console: '+m.text()); });
    const now=Date.now();
    await p.route('**/api/ratings*', r => r.fulfill({ json: { ratings: { sports_car: { ir: 1875, lic: 'B 3.21', at: now-3600e3, src: 'session' }, formula_car: { ir: 980, lic: 'C', at: now-864e5, src: 'race' } } } }));
    await p.goto('http://localhost:8799/index.html?lang=es'); await p.waitForTimeout(2000);
    const st = await p.evaluate(()=>{try{localStorage.setItem("pw.demo","1")}catch(e){} let ok=false; try{if(typeof ME==="undefined"||!ME)ME={};ME.admin=true; ok=isAdmin()}catch(e){} const h=document.getElementById('lpT');let e=h;while(e&&e.parentElement&&e.parentElement!==document.body)e=e.parentElement;if(e)e.remove(); return {demo:!!window.PITLANE_DEMO, admin:ok, on: (typeof demoOn==="function")&&demoOn()}});
    console.log(width, 'state', JSON.stringify(st));
    await p.evaluate(()=>{try{rerenderAll()}catch(e){}}); await p.waitForTimeout(800);
    for (const v of views) {
      await p.evaluate(v=>show(v), v); await p.waitForTimeout(1600);
      const info = await p.evaluate(()=>{const W=innerWidth,bad=[];for(const el of document.querySelectorAll('body *')){const r=el.getBoundingClientRect();if(r.width&&r.height&&r.right>W+1&&getComputedStyle(el).visibility!=='hidden'&&el.closest('[hidden]')==null){const s=el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/).slice(0,2).join('.'):'');if(!bad.some(x=>x.startsWith(s)))bad.push(s+' r='+Math.round(r.right))}if(bad.length>6)break}return {sw:document.documentElement.scrollWidth,W,bad}});
      console.log(width, v, 'overflow:', info.sw>info.W?info.sw:'ok', info.bad.slice(0,4).join(' | '));
      await p.screenshot({path:`${process.argv[2]}/ui/shot-${width}-${v}.png`, fullPage:true});
      if (v==="laps"||v==="coach") { await p.evaluate(()=>{try{closeOpenPanels()}catch(e){} const d=document.querySelector('#sesPick,#pickWin,.pickwin');}); }
    }
    console.log(width, 'errors:', errs.slice(0,8));
    await p.close();
  }
  await b.close();
})();
