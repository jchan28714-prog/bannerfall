/* Run with:  node tools/balance-check.js
   1) Prints every unit's price next to its real strength.
   2) Plays hundreds of battles with a simple bot to check difficulty ramps.
   Pass a seed count:  node tools/balance-check.js 12 */
require('../www/js/data.js');
require('../www/js/engine.js');
const BF = globalThis.BF;
const G = BF.GRID;

// ---------- 1. price table ----------
console.log('\nUNIT PRICES (cost should rise with power)\n');
console.log('legion    unit             cost   hp   dps   range  power');
for (const f of BF.FACTIONS) {
  for (const r of BF.ROLES) {
    const u = f.units[r];
    const dps = u.dmg * u.rate * (u.aoe ? 1.5 : 1);
    const p = BF.powerOf(u, f.mods.armor);
    console.log(
      f.short.padEnd(9), u.name.padEnd(16),
      String(u.cost).padStart(5), String(u.hp).padStart(4),
      dps.toFixed(1).padStart(5), String(u.range).padStart(6),
      p.toFixed(1).padStart(6)
    );
  }
}

// ---------- 2. bot ----------
// The bot plays for Men faction. Units auto-spawn and march from the left.
// No grid placement – just B.spawn(type, row).
const MEN_TERRS = BF.buildCampaign('men').filter(t => t.id !== BF.FACTION_HOME['men']);

function runBot(terrObj, upg, seed) {
  const b = new BF.Battle({ factionId: 'men', territory: terrObj, upgrades: upg, seed, fx: false, tribute: MEN_TERRS.indexOf(terrObj) });
  const f = b.faction;
  let acc = 0;
  while (!b.over && b.time < 1200) {
    b.step(1 / 30);
    acc += 1 / 30;
    if (acc < 0.4) continue;
    acc = 0;
    buyUnits(b, f);
  }
  return { win: b.over === 'win', hp: b.baseHp / b.baseMax, stars: b.stars };
}

// Bot spawns swords into the hottest lanes, archers into quieter lanes.
function buyUnits(b, f) {
  const U = f.units;
  const rowThreat = Array(G.rows).fill(0);
  for (const e of b.enemies) rowThreat[e.row] += 1 + (1 - e.x / G.cw) * 2;

  const hotRows = [...Array(G.rows).keys()].sort((a, c) => rowThreat[c] - rowThreat[a]);
  for (const row of hotRows) {
    const mine = b.defenders.filter(d => d.row === row);
    const hasSword  = mine.some(d => d.type === 'sword');
    const hasArcher = mine.some(d => d.type === 'archer');
    if (!hasSword && U.sword.cost <= b.gold) {
      if (b.spawn('sword', row).ok) return;
    }
    if (hasSword && !hasArcher && U.archer.cost <= b.gold) {
      if (b.spawn('archer', row).ok) return;
    }
    if (U.spear.cost <= b.gold) {
      if (b.spawn('spear', row).ok) return;
    }
  }
}

const SEEDS = parseInt(process.argv[2] || '6', 10);
const SAMPLE = MEN_TERRS.slice(0, 8);

console.log('\nBOT BATTLES – Men vs first ' + SAMPLE.length + ' territories (' + SEEDS + ' seeds)\n');
console.log('territory'.padEnd(26) + 'win%  hp%');
for (const t of SAMPLE) {
  const d = t.index || 0;
  const lv = Math.min(5, Math.round(d * 0.6));
  const upg = { treasury: lv, barracks: lv, walls: lv };
  let wins = 0, hp = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const r = runBot(t, upg, 1000 * d + s);
    if (r.win) { wins++; hp += r.hp; }
  }
  const pct = Math.round((wins / SEEDS) * 100);
  console.log(t.name.padEnd(26) + String(pct + '%').padStart(4) + (wins ? '  ' + Math.round((hp / wins) * 100) + '%' : ''));
}
console.log('\n(win-rate / average gate HP on wins)\n');
