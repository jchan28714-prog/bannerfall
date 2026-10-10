/* Run with:  node tools/balance-check.js
   1) Prints every unit's price next to its real strength, so you can see that gold cost tracks power.
   2) Plays hundreds of battles with a simple bot to check the difficulty ramps up as you conquer.
   Pass a number for how many seeds per battle (default 6):  node tools/balance-check.js 12 */
require('../www/js/data.js');
require('../www/js/engine.js');
const BF = globalThis.BF;
const G = BF.GRID;

// ---------- 1. price table ----------
console.log('\nUNIT PRICES (cost should rise with power)\n');
console.log('legion    unit             cost   hp   dps   range  power  gold/power');
for (const f of BF.FACTIONS) {
  for (const r of BF.ROLES) {
    const u = f.units[r];
    const dps = u.dmg * u.rate * (u.aoe ? 1.5 : 1);
    const p = BF.powerOf(u, f.mods.armor);
    console.log(
      f.short.padEnd(9), u.name.padEnd(16),
      String(u.cost).padStart(5), String(u.hp).padStart(4),
      dps.toFixed(1).padStart(5), String(u.range).padStart(6),
      p.toFixed(1).padStart(6), (u.cost / p).toFixed(2).padStart(8)
    );
  }
}
const men = BF.factionById('men').units;
const anchors = { spear: 100, sword: 250, archer: 300, mage: 450 };
let okAnchors = true;
for (const k in anchors) if (men[k].cost !== anchors[k]) okAnchors = false;
console.log('\nMen price anchors (100/250/300/450):', okAnchors ? 'OK' : 'MISMATCH ' + JSON.stringify(Object.fromEntries(Object.entries(men).map(([k, v]) => [k, v.cost]))));

// ---------- 2. bot ----------
function runBot(fid, idx, upg, seed) {
  const terr = BF.buildCampaign(fid)[idx];
  const b = new BF.Battle({ factionId: fid, territory: terr, upgrades: upg, seed, fx: false, tribute: idx });
  const f = b.faction;
  let acc = 0;
  while (!b.over && b.time < 1200) {
    b.step(1 / 30);
    acc += 1 / 30;
    if (acc < 0.4) continue;
    acc = 0;
    buy(b, f);
  }
  return { win: b.over === 'win', hp: b.baseHp / b.baseMax, stars: b.stars, time: b.time };
}

// A simple "kill zone" player: remembers which lanes enemies use, then builds a
// sword wall with archers behind it, then a spear, a mage, and so on.
const seen = new WeakMap();
function laneWeights(b) {
  let m = seen.get(b);
  if (!m) { m = { ids: new Set(), cnt: Array(G.cols).fill(0) }; seen.set(b, m); }
  for (const e of b.enemies) if (!m.ids.has(e.id)) { m.ids.add(e.id); m.cnt[e.col]++; }
  return m.cnt;
}

function buy(b, f) {
  const U = f.units;
  const cnt = laneWeights(b);
  const score = (c) => {
    let thr = 0;
    for (const e of b.enemies) if (e.col === c) thr += 1 + (e.y + 20) / G.h + (e.size > 1 ? 3 : 0);
    return cnt[c] * 1.0 + thr * 2;
  };
  const cols = [...Array(G.cols).keys()].sort((a, c) => score(c) - score(a));
  for (const col of cols) {
    if (score(col) <= 0) continue;
    const mine = b.defenders.filter((d) => d.col === col);
    const has = (t) => mine.filter((d) => d.type === t).length;
    const front = mine.filter((d) => d.type === 'sword').sort((p, q) => p.y - q.y)[0];

    const order = ['sword', 'archer', 'archer', 'spear', 'mage', 'sword', 'archer', 'mage', 'spear', 'archer', 'sword', 'mage'];
    const have = { sword: 0, archer: 0, spear: 0, mage: 0 };
    let want = null;
    for (const t of order) {
      have[t]++;
      if (has(t) < have[t]) { want = t; break; }
    }
    if (!want) continue;
    const emergency = mine.length === 0 && b.enemies.some((e) => e.col === col && e.y > 170);
    if (U[want].cost > b.gold) {
      if (emergency && U.spear.cost <= b.gold) want = 'spear'; else return; // save up
    }

    let row = -1;
    if (want === 'sword') {
      row = [2, 1, 3].find((r) => b.canPlace(col, r)) ?? -1;
      if (front) row = -1;
      if (front && has('sword') < 2) row = [front.row + 1].find((r) => b.canPlace(col, r)) ?? -1;
    } else if (want === 'spear') {
      const anchor = front ? front.row : 1;
      row = [anchor + 1, anchor + 2, anchor - 1].find((r) => r >= 0 && r < G.rows && b.canPlace(col, r)) ?? -1;
    } else {
      const stopY = front ? front.y - BF.ENEMY_RANGED_STOP : 40;
      for (let r = G.rows - 1; r >= 0; r--) {
        const y = r * G.cell + 36;
        if (b.canPlace(col, r) && (!front || r > front.row) && y - stopY <= U[want].range - 8) { row = r; break; }
      }
    }
    if (row < 0) continue;
    if (b.place(want, col, row).ok) return;
  }
}

const SEEDS = parseInt(process.argv[2] || '6', 10);
console.log('\nBOT BATTLES (' + SEEDS + ' seeds each). Upgrades scale with progress: level = round(index x 0.6)\n');
console.log('legion    ' + BF.TERRITORY_TEMPLATES.map((t, i) => ('T' + (i + 1)).padStart(9)).join(''));
for (const f of BF.FACTIONS) {
  let line = f.short.padEnd(10);
  for (let i = 0; i < BF.TERRITORY_TEMPLATES.length; i++) {
    const lv = Math.min(5, Math.round(i * 0.6));
    const upg = { treasury: lv, barracks: lv, walls: lv };
    let wins = 0, hp = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const r = runBot(f.id, i, upg, 1000 * i + s);
      if (r.win) { wins++; hp += r.hp; }
    }
    line += (Math.round((wins / SEEDS) * 100) + '%' + (wins ? '/' + Math.round((hp / wins) * 100) : '')).padStart(9);
  }
  console.log(line);
}
console.log('\n(each cell: win-rate % / average gate health left on wins)\n');
