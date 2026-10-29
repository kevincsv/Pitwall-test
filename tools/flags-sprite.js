// The country flags beside the drivers' names (the native relative and standings, the app's Telemetry tables, the race
// summary): one sprite of every flag of the flag-icons package (MIT, github.com/lipis/flag-icons, its licence in
// web/dist/flags/LICENSE-flag-icons.txt), drawn by Chromium from its 4:3 SVGs at 32×24 px a flag (shown at 16×12 and
// scaled by the overlays), and flags.json: the codes in the sprite's order and the names the game may give (iRacing's
// FlairName) to their code. Run again only to change the set:
//   npm pack flag-icons && tar xzf flag-icons-*.tgz   (somewhere outside the repository)
//   NODE_PATH=$(npm root -g) node tools/flags-sprite.js <that folder>/package
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const pkg = process.argv[2];
if (!pkg) { console.error('usage: node tools/flags-sprite.js <flag-icons package folder>'); process.exit(2); }
const out = path.join(__dirname, '..', 'web', 'dist', 'flags');
const W = 32, H = 24, COLS = 16;
// the regions iRacing drivers fly besides the countries; groups of countries (UN, ASEAN…) are left out
const EXTRA = ['gb-eng', 'gb-sct', 'gb-wls', 'gb-nir', 'es-ct', 'es-pv', 'es-ga', 'eu'];
const countries = JSON.parse(fs.readFileSync(path.join(pkg, 'country.json'), 'utf8'))
  .filter(c => (c.iso || EXTRA.includes(c.code)) && fs.existsSync(path.join(pkg, 'flags', '4x3', c.code + '.svg')));
const codes = countries.map(c => c.code);
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const names = {};
for (const c of countries) names[norm(c.name)] = c.code;
// the other names a country goes by (the game's own spelling first)
const ALIAS = {
  'united states': 'us', 'usa': 'us', 'u s a': 'us', 'america': 'us', 'great britain': 'gb', 'uk': 'gb', 'britain': 'gb',
  'turkey': 'tr', 'czechia': 'cz', 'korea': 'kr', 'korea republic of': 'kr', 'republic of korea': 'kr', 'russian federation': 'ru',
  'holland': 'nl', 'the netherlands': 'nl', 'viet nam': 'vn', 'macedonia': 'mk', 'slovak republic': 'sk', 'ivory coast': 'ci',
  'cote divoire': 'ci', 'hong kong sar': 'hk', 'macao': 'mo', 'iran islamic republic of': 'ir', 'taiwan province of china': 'tw',
  'chinese taipei': 'tw', 'bosnia': 'ba', 'bosnia herzegovina': 'ba', 'uae': 'ae', 'brunei': 'bn', 'cape verde': 'cv',
  'swaziland': 'sz', 'burma': 'mm', 'vatican': 'va', 'vatican city': 'va', 'palestine': 'ps', 'moldova republic of': 'md',
  'lao peoples democratic republic': 'la', 'syrian arab republic': 'sy', 'tanzania united republic of': 'tz',
  'venezuela bolivarian republic of': 've', 'bolivia plurinational state of': 'bo', 'micronesia': 'fm', 'east timor': 'tl',
  'catalunya': 'es-ct', 'basque country': 'es-pv', 'euskadi': 'es-pv', 'european union': 'eu',
};
for (const [k, v] of Object.entries(ALIAS)) if (codes.includes(v)) names[k] = v;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const rows = Math.ceil(codes.length / COLS);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: COLS * W, height: rows * H }, deviceScaleFactor: 1 });
  const cells = codes.map((c, i) => {
    const svg = fs.readFileSync(path.join(pkg, 'flags', '4x3', c + '.svg')).toString('base64');
    return `<img src="data:image/svg+xml;base64,${svg}" style="position:absolute;left:${(i % COLS) * W}px;top:${Math.floor(i / COLS) * H}px;width:${W}px;height:${H}px">`;
  }).join('');
  await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><div id="s" style="position:relative;width:${COLS * W}px;height:${rows * H}px">${cells}</div></body></html>`);
  await p.waitForFunction(() => [...document.images].every(i => i.complete));
  await p.locator('#s').screenshot({ path: path.join(out, 'flags.png'), omitBackground: true });
  await b.close();
  fs.writeFileSync(path.join(out, 'flags.json'), JSON.stringify({ w: W, h: H, cols: COLS, codes, names }) + '\n');
  fs.copyFileSync(path.join(pkg, 'LICENSE'), path.join(out, 'LICENSE-flag-icons.txt'));
  console.log(codes.length, 'flags,', Object.keys(names).length, 'names');
})();
