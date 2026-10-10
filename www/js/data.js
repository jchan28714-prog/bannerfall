/* ==========================================================================
   BANNERFALL - game data
   Everything you are likely to tweak lives in this file: legions, unit stats,
   the world map and the economy. No internet, no dependencies.

   PRICING: every unit is priced by ONE formula (see powerOf / costOf), so gold
   cost always follows real fighting strength. Change a unit's stats and its
   price updates itself. Run `node tools/balance-check.js` to see the table.
   ========================================================================== */
(function () {
  'use strict';
  const BF = (globalThis.BF = globalThis.BF || {});

  // ---- Board geometry (logical units; the canvas scales this to any screen) ----
  BF.GRID = { cols: 5, rows: 6, cell: 72, w: 360, h: 432, cw: 360, ch: 452 };
  BF.ROLES = ['spear', 'sword', 'archer', 'mage'];

  // ---- Economy ----
  BF.ECON = {
    startGold: 500,     // gold at the start of each battle
    baseIncome: 24,     // gold per second
    sellRefund: 0.6,    // share of cost returned when you dismiss a unit
    bountyRate: 0.25,   // gold per kill = unit cost x this
    baseHp: 60,         // gate health before upgrades
    tribute: 0.08,      // extra income per territory you have already conquered
  };

  // ---- Permanent upgrades bought with Glory (earned by conquering) ----
  BF.UPGRADES = [
    { id: 'treasury', name: 'Royal Treasury', desc: '+40 starting gold and +4% income per level', max: 5 },
    { id: 'barracks', name: 'Barracks', desc: '+6% unit health and damage per level', max: 5 },
    { id: 'walls', name: 'Fortified Gate', desc: '+15 gate health per level', max: 5 },
  ];
  BF.upgradeCost = (level) => 15 * (level + 1);

  // ---- Price model -----------------------------------------------------------
  // power = sqrt(damage-per-second x effective health) x range bonus
  //   * area-of-effect attacks count as 1.5x damage
  //   * armour raises effective health
  //   * range beyond one tile and a half earns a bonus (it is safer to fire from afar)
  // cost  = power x COST_PER_POWER, rounded to the nearest 10 gold.
  // COST_PER_POWER is set so a Men spearman costs exactly 100 gold.
  BF.COST_PER_POWER = 3.953;
  BF.powerOf = function (u, armor) {
    const dps = u.dmg * u.rate * (u.aoe ? 1.5 : 1);
    const ehp = u.hp / (1 - (armor || 0));
    const reach = 1 + 0.012 * Math.max(0, u.range - 120);
    return Math.sqrt(dps * ehp) * reach;
  };
  BF.costOf = function (u, armor) {
    return Math.max(10, Math.round((BF.COST_PER_POWER * BF.powerOf(u, armor)) / 10) * 10);
  };

  // Walking speed (px/s) and gate damage when an ENEMY of this role slips through
  BF.ROLE = {
    spear: { speed: 24, leak: 4 },
    sword: { speed: 20, leak: 6 },
    archer: { speed: 20, leak: 5 },
    mage: { speed: 17, leak: 6 },
  };

  /* --------------------------------------------------------------------------
     LEGIONS
     Unit stats:  hp, dmg (per hit), rate (hits/sec), range (px, one tile = 72),
                  aoe (splash radius, mages only).
     Perks (mods): income x, bounty x, baseHp x, armor (0-0.5 damage cut),
                   regen (hp/sec), berserk (melee 25% faster under half health).
     -------------------------------------------------------------------------- */
  BF.FACTIONS = [
    {
      id: 'men', name: 'Men of Aldermere', short: 'Men',
      color: '#4a78c2', accent: '#a9c1ec',
      tagline: 'Disciplined steel. The finest swordsmen in the realm.',
      perks: ['Elite swordsmen: heavy, hard-hitting blades', '+20% gold income'],
      mods: { income: 1.2, bounty: 1, baseHp: 1, armor: 0, regen: 0, berserk: false },
      units: {
        spear: { name: 'Spearman', hp: 80, dmg: 8, rate: 1.0, range: 115 },
        sword: { name: 'Swordsman', hp: 190, dmg: 19, rate: 1.1, range: 44 },
        archer: { name: 'Archer', hp: 70, dmg: 15, rate: 0.85, range: 250 },
        mage: { name: 'Battle Mage', hp: 75, dmg: 30, rate: 0.7, range: 230, aoe: 80 },
      },
    },
    {
      id: 'elves', name: 'Elves of Sylvanmere', short: 'Elves',
      color: '#3f9a6a', accent: '#a6e3bf',
      tagline: 'Slow, patient arrows that reach across the whole field.',
      perks: ['Longest-ranged archers in the game', 'Defenders regenerate 3 HP per second (others 1)'],
      mods: { income: 1, bounty: 1, baseHp: 1, armor: 0, regen: 3, berserk: false },
      units: {
        spear: { name: 'Glade Spear', hp: 70, dmg: 7, rate: 1.0, range: 115 },
        sword: { name: 'Bladedancer', hp: 150, dmg: 17, rate: 1.2, range: 44 },
        archer: { name: 'Longbow Ranger', hp: 65, dmg: 22, rate: 0.55, range: 330 },
        mage: { name: 'Moon Mage', hp: 65, dmg: 28, rate: 0.65, range: 240, aoe: 80 },
      },
    },
    {
      id: 'orcs', name: 'Orcs of the Ashen Horde', short: 'Orcs',
      color: '#b5482f', accent: '#f0a98e',
      tagline: 'Brutes who grow wilder the more they bleed.',
      perks: ['Massive health and damage in melee', 'Berserk: melee attacks 25% faster below half health', '+10% gold income'],
      mods: { income: 1.1, bounty: 1, baseHp: 1, armor: 0, regen: 0, berserk: true },
      units: {
        spear: { name: 'Raider', hp: 100, dmg: 9, rate: 0.9, range: 115 },
        sword: { name: 'Warbrute', hp: 260, dmg: 26, rate: 1.0, range: 44 },
        archer: { name: 'Skirmisher', hp: 55, dmg: 11, rate: 0.8, range: 210 },
        mage: { name: 'Shaman', hp: 65, dmg: 28, rate: 0.6, range: 210, aoe: 80 },
      },
    },
    {
      id: 'goblins', name: 'Goblins of Gloomhollow', short: 'Goblins',
      color: '#a3a93a', accent: '#e3e68f',
      tagline: 'Cheap, quick and everywhere. Win by sheer numbers.',
      perks: ['Cheapest units in the game', '+35% gold from every kill, +25% gold income'],
      mods: { income: 1.25, bounty: 1.35, baseHp: 1, armor: 0, regen: 0, berserk: false },
      units: {
        spear: { name: 'Stabber', hp: 55, dmg: 6, rate: 1.2, range: 115 },
        sword: { name: 'Cutthroat', hp: 110, dmg: 12, rate: 1.3, range: 44 },
        archer: { name: 'Slinger', hp: 45, dmg: 8.5, rate: 1.1, range: 240 },
        mage: { name: 'Hexer', hp: 50, dmg: 26, rate: 0.7, range: 220, aoe: 85 },
      },
    },
    {
      id: 'dwarves', name: 'Dwarves of Karak Dun', short: 'Dwarves',
      color: '#c08a3e', accent: '#f1d09a',
      tagline: 'Armoured and immovable. Nothing gets through the line.',
      perks: ['Armour: all damage taken cut by 15%', 'Gate has 25% more health'],
      mods: { income: 1, bounty: 1, baseHp: 1.25, armor: 0.15, regen: 0, berserk: false },
      units: {
        spear: { name: 'Pikeman', hp: 110, dmg: 8, rate: 0.9, range: 115 },
        sword: { name: 'Axeguard', hp: 240, dmg: 21, rate: 0.9, range: 44 },
        archer: { name: 'Crossbowman', hp: 80, dmg: 17, rate: 0.7, range: 210 },
        mage: { name: 'Runesmith', hp: 85, dmg: 33, rate: 0.6, range: 210, aoe: 75 },
      },
    },
  ];

  // Fill in role + price for every unit
  for (const f of BF.FACTIONS) {
    for (const role of BF.ROLES) {
      const u = f.units[role];
      u.role = role;
      u.cost = BF.costOf(u, f.mods.armor);
    }
  }
  BF.factionById = (id) => BF.FACTIONS.find((f) => f.id === id);

  /* --------------------------------------------------------------------------
     WORLD MAP
     You start at your homeland and push toward the Obsidian Citadel. Every
     territory is held by one of the OTHER legions, and each is tougher than the
     last: more waves, tougher enemies, and champions arriving as you near the
     Citadel. Tune difficulty with hpScale / dmgScale / countScale below.
     -------------------------------------------------------------------------- */
  BF.HOME = { x: 60, y: 462 };
  BF.TERRITORY_TEMPLATES = [
    { id: 't1', name: 'Greywatch Marches', x: 150, y: 418 },
    { id: 't2', name: 'Thornwood Pass', x: 256, y: 372 },
    { id: 't3', name: 'Ashen Fields', x: 200, y: 316 },
    { id: 't4', name: 'Stonebridge Ford', x: 96, y: 280 },
    { id: 't5', name: 'Ravenmoor', x: 130, y: 214 },
    { id: 't6', name: 'The Sundered Keep', x: 242, y: 188 },
    { id: 't7', name: 'Frostmaw Heights', x: 272, y: 118 },
    { id: 't8', name: 'The Obsidian Citadel', x: 160, y: 62 },
  ];

  BF.buildCampaign = function (playerId) {
    const rivals = BF.FACTIONS.filter((f) => f.id !== playerId);
    const n = BF.TERRITORY_TEMPLATES.length;
    return BF.TERRITORY_TEMPLATES.map((t, i) => {
      const final = i === n - 1;
      return Object.assign({}, t, {
        index: i,
        final,
        owner: final ? rivals[0].id : rivals[i % rivals.length].id,
        waves: final ? 9 : 5 + Math.floor(i / 2),
        hpScale: 0.85 + 0.15 * i,  // enemy health multiplier
        dmgScale: 0.9 + 0.08 * i,  // enemy damage multiplier
        countScale: 0.95 + 0.08 * i, // enemies per wave multiplier
      });
    });
  };

  if (typeof module !== 'undefined') module.exports = BF;
})();
