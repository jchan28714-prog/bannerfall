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
  // Landscape-first: wider than tall (aspect ≈ 1.5)
  BF.GRID = { rows: 6, cell: 56, w: 504, h: 336, cw: 504, ch: 356 };
  BF.CASTLE_W  = 54;   // pixel width of the castle gate drawing
  BF.SPAWN_X   = 66;   // x where new defenders appear (emerge from the castle)
  BF.MARCH_SPD = 17;   // px/s base march speed for defenders
  BF.ROLES = ['spear', 'sword', 'archer', 'mage'];

  // ---- Economy ----
  BF.ECON = {
    startGold: 500,     // gold at the start of each battle
    baseIncome: 24,     // kept for War Council display, but passive income is disabled
    sellRefund: 0.8,    // share of cost returned when you dismiss a unit
    bountyRate: 0.5,    // gold per kill = unit cost x this (raised: kills are the only income)
    baseHp: 60,         // gate health before upgrades
    tribute: 0.08,      // extra starting gold per territory already conquered
  };

  // ---- Faction special abilities (30-second cooldown) ----
  BF.ABILITIES = {
    men:     { name: 'Iron Wall',    key: 'IW', desc: 'Free swordsman in each occupied lane',      cooldown: 30 },
    elves:   { name: 'Arrow Volley', key: 'AV', desc: 'Each archer fires 3 rapid shots instantly', cooldown: 30 },
    orcs:    { name: 'Blood Frenzy', key: 'BF', desc: 'All defenders attack 75% faster for 8s',   cooldown: 30 },
    goblins: { name: 'Scurry Rush',  key: 'SR', desc: 'Free stabber in every lane with enemies',  cooldown: 30 },
    dwarves: { name: 'Ironclad',     key: 'IC', desc: 'All defenders take 60% less damage for 8s', cooldown: 30 },
  };

  // ---- Permanent upgrades bought with Glory (earned by conquering) ----
  BF.UPGRADES = [
    { id: 'treasury', name: 'Royal Treasury', desc: '+40 starting gold and +8% kill bounty per level', max: 5 },
    { id: 'barracks', name: 'Barracks', desc: '+6% unit health and damage per level', max: 5 },
    { id: 'walls', name: 'Fortified Gate', desc: '+15 gate health per level', max: 5 },
  ];
  BF.upgradeCost = (level) => 15 * (level + 1);

  // ---- Price model ----
  BF.COST_PER_POWER = 2.5; // reduced from 3.953 — cheaper units for larger army deployments
  BF.powerOf = function (u, armor) {
    const dps = u.dmg * u.rate * (u.aoe ? 1.5 : 1);
    const ehp = u.hp / (1 - (armor || 0));
    const reach = 1 + 0.012 * Math.max(0, u.range - 120);
    return Math.sqrt(dps * ehp) * reach;
  };
  BF.costOf = function (u, armor) {
    return Math.max(10, Math.round((BF.COST_PER_POWER * BF.powerOf(u, armor)) / 10) * 10);
  };

  BF.ROLE = {
    spear: { speed: 24, leak: 4 },
    sword: { speed: 20, leak: 6 },
    archer: { speed: 20, leak: 5 },
    mage: { speed: 17, leak: 6 },
  };

  /* --------------------------------------------------------------------------
     LEGIONS
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
      perks: ['Longest-ranged archers in the game', 'Defenders regenerate 3 HP/s'],
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
      perks: ['Massive health and damage in melee', 'Berserk: attacks 25% faster below half health'],
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
      perks: ['Cheapest units in the game', '+35% gold from kills, +25% starting gold'],
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
      perks: ['Armour: all damage cut by 15%', 'Gate has 25% more health'],
      mods: { income: 1, bounty: 1, baseHp: 1.25, armor: 0.15, regen: 0, berserk: false },
      units: {
        spear: { name: 'Pikeman', hp: 110, dmg: 8, rate: 0.9, range: 115 },
        sword: { name: 'Axeguard', hp: 240, dmg: 21, rate: 0.9, range: 44 },
        archer: { name: 'Crossbowman', hp: 80, dmg: 17, rate: 0.7, range: 210 },
        mage: { name: 'Runesmith', hp: 85, dmg: 33, rate: 0.6, range: 210, aoe: 75 },
      },
    },
  ];

  for (const f of BF.FACTIONS) {
    for (const role of BF.ROLES) {
      const u = f.units[role];
      u.role = role;
      u.cost = BF.costOf(u, f.mods.armor);
    }
  }
  BF.factionById = (id) => BF.FACTIONS.find((f) => f.id === id);

  // Normalise champion/warlord role names to their base role for weakness lookup
  BF.baseRole = (role) => (role === 'champion' || role === 'warlord') ? 'sword' : role;

  // Rock-paper-scissors damage multipliers
  // archers shred swords; mages shred defensive melee; melee beats ranged in close
  BF.dmgMult = function (atkRole, defRole) {
    if (atkRole === 'archer' && defRole === 'sword')  return 1.75;
    if (atkRole === 'archer' && defRole === 'spear')  return 1.3;
    if (atkRole === 'mage'   && (defRole === 'spear' || defRole === 'sword')) return 1.6;
    if ((atkRole === 'spear' || atkRole === 'sword') && (defRole === 'archer' || defRole === 'mage')) return 1.3;
    return 1.0;
  };

  /* --------------------------------------------------------------------------
     WORLD MAP  –  Risk-style territory system
     15 territories to conquer + 1 Obsidian Citadel (final boss).
     Each faction controls a home region; the player starts in theirs.
     Territories are connected by adjacency – you can only attack a territory
     that borders one you already hold (or your homeland).
     -------------------------------------------------------------------------- */

  // Which territory is each faction's starting homeland
  BF.FACTION_HOME = {
    men:     't_keep',
    elves:   't_sylvan',
    orcs:    't_ashfield',
    dwarves: 't_karakdun',
    goblins: 't_gloomhollow',
  };

  // All territories (x,y in the 360×500 map SVG viewBox)
  BF.TERRITORIES = [
    // ── Men of Aldermere (East) ──────────────────────────────────────────────
    { id: 't_keep',     name: 'Aldermere Keep',     owner: 'men',     x: 305, y: 282, adj: ['t_ironwall', 't_stoneforge', 't_karakdun', 't_marches'] },
    { id: 't_ironwall', name: 'Ironwall Cliffs',    owner: 'men',     x: 318, y: 188, adj: ['t_thornwood', 't_scorched', 't_keep'] },
    { id: 't_marches',  name: 'Greywatch Marches',  owner: 'men',     x: 295, y: 374, adj: ['t_keep', 't_skullpeak', 't_gloomhollow'] },

    // ── Elves of Sylvanmere (North) ─────────────────────────────────────────
    { id: 't_sylvan',   name: 'Sylvanmere Grove',   owner: 'elves',   x: 155, y: 62,  adj: ['t_moonveil', 't_thornwood', 't_ashfield'] },
    { id: 't_moonveil', name: 'Moonveil Glade',     owner: 'elves',   x: 54,  y: 88,  adj: ['t_sylvan', 't_raiders'] },
    { id: 't_thornwood',name: 'Thornwood Pass',     owner: 'elves',   x: 272, y: 90,  adj: ['t_sylvan', 't_scorched', 't_ironwall'] },

    // ── Orcs of the Ashen Horde (West) ──────────────────────────────────────
    { id: 't_ashfield', name: 'Ashfield',            owner: 'orcs',    x: 122, y: 178, adj: ['t_raiders', 't_sylvan', 't_scorched', 't_deepmines', 't_karakdun'] },
    { id: 't_raiders',  name: "Raider's Reach",      owner: 'orcs',    x: 42,  y: 198, adj: ['t_moonveil', 't_ashfield', 't_deepmines'] },
    { id: 't_scorched', name: 'Scorched Plains',     owner: 'orcs',    x: 215, y: 192, adj: ['t_thornwood', 't_ashfield', 't_ironwall', 't_stoneforge'] },

    // ── Dwarves of Karak Dun (Central mountains) ────────────────────────────
    { id: 't_karakdun', name: 'Karak Dun',           owner: 'dwarves', x: 178, y: 272, adj: ['t_ashfield', 't_deepmines', 't_stoneforge', 't_keep', 't_gloomhollow'] },
    { id: 't_deepmines',name: 'The Deepmines',       owner: 'dwarves', x: 96,  y: 295, adj: ['t_raiders', 't_ashfield', 't_karakdun', 't_mudmire'] },
    { id: 't_stoneforge',name:'Stoneforge',           owner: 'dwarves', x: 258, y: 295, adj: ['t_scorched', 't_karakdun', 't_keep', 't_skullpeak'] },

    // ── Goblins of Gloomhollow (South) ──────────────────────────────────────
    { id: 't_gloomhollow',name:'Gloomhollow Warren', owner: 'goblins', x: 152, y: 402, adj: ['t_deepmines', 't_karakdun', 't_marches', 't_mudmire', 't_skullpeak', 't_citadel'] },
    { id: 't_mudmire',  name: 'Mudmire Bog',         owner: 'goblins', x: 65,  y: 388, adj: ['t_deepmines', 't_gloomhollow'] },
    { id: 't_skullpeak',name: 'Skullpeak',            owner: 'goblins', x: 238, y: 378, adj: ['t_stoneforge', 't_marches', 't_gloomhollow', 't_citadel'] },

    // ── Final territory ──────────────────────────────────────────────────────
    { id: 't_citadel',  name: 'Obsidian Citadel',    owner: null,      x: 175, y: 462, adj: ['t_gloomhollow', 't_skullpeak'], final: true },
  ];

  BF.territoryById = (id) => BF.TERRITORIES.find((t) => t.id === id);

  /* Build the campaign for a given player faction.
     Returns territory objects with difficulty stats injected.
     Territories owned by the player's faction are reassigned to rival factions. */
  BF.buildCampaign = function (playerId) {
    const homeId = BF.FACTION_HOME[playerId];
    const rivals = BF.FACTIONS.filter((f) => f.id !== playerId);

    // BFS from homeland to assign difficulty index
    const dist = {};
    const queue = [homeId];
    dist[homeId] = 0;
    while (queue.length) {
      const cur = queue.shift();
      const t = BF.territoryById(cur);
      if (!t) continue;
      for (const adj of t.adj) {
        if (dist[adj] === undefined) { dist[adj] = dist[cur] + 1; queue.push(adj); }
      }
    }

    return BF.TERRITORIES.map((t) => {
      const d = dist[t.id] !== undefined ? dist[t.id] : 8;
      const idx = Math.max(0, d - 1);
      // If this territory belongs to the player's faction, assign a rival
      let owner = t.owner;
      if (owner === playerId) {
        const r = rivals[BF.TERRITORIES.indexOf(t) % rivals.length];
        owner = r.id;
      }
      if (t.final) owner = owner || rivals[0].id;
      return Object.assign({}, t, {
        owner,
        index: idx,
        waves: t.final ? 9 : Math.max(3, 2 + d),
        hpScale:    0.65 + 0.09 * idx,
        dmgScale:   0.70 + 0.09 * idx,
        countScale: 0.75 + 0.09 * idx,
      });
    });
  };

  // ---- Mid-battle spend actions  (cost scales with wave index w = 0-based) ----
  // Target balance: each wave yields ≈ wave_number × 40 g from kills at good play.
  //
  // w   enemies  avg_bounty  wave_yield  repairCost  mercCost
  // 0       3        30          90          60         120
  // 1       5        33         165          80         155
  // 2       6        37         222         100         190
  // 3       7        41         287         120         225
  // 4       9        45         405         140         260
  // 5      10        50         500         160         295
  // 6      11        55         605         180         330
  // 7      12        60         720         200         365
  // 8      13        65         845         220         400
  // 9      15        70        1050         240         435
  BF.WAVE_ECON = {
    repairCost: (w) => Math.round((60 + 20 * w) / 10) * 10,   // restores 25% of max gate HP
    mercCost:   (w) => Math.round((120 + 35 * w) / 10) * 10,  // spawns free sword in least-covered lane
    wallCost:   (w) => Math.round((90 + 30 * w) / 10) * 10,   // +8 max gate HP for this battle
  };

  // ---- Auto-recruit: free reinforcement spawned every N seconds in the most threatened lane ----
  BF.AUTO_RECRUIT = { interval: 60 };

  // ---- Tier-1 unit touch abilities (tap a deployed unit to activate) ----
  BF.TOUCH_ABILITIES = {
    spear:  { name: 'Shield Wall',  desc: 'Takes 60% less damage, holds ground 4s',  cooldown: 18, dur: 4 },
    sword:  { name: 'Rally Cry',    desc: '+50% attack speed for lane allies 5s',     cooldown: 20, dur: 5 },
    archer: { name: 'Rapid Volley', desc: 'Fires 3 instant shots at closest enemy',   cooldown: 12, dur: 0 },
    mage:   { name: 'Chain Blast',  desc: '2× AoE damage pulse hits every enemy in lane', cooldown: 16, dur: 0 },
  };

  // ---- Tier-1 strength / weakness matrix ----
  // strong → deals extra damage to those roles (see dmgMult)
  // weak   → takes extra damage from those roles
  BF.TIER1_MATRIX = {
    spear:  { strong: ['archer', 'mage'],  weak: ['sword'],          flavor: 'Cheap vanguard; bristling line punishes ranged rushers.' },
    sword:  { strong: ['spear', 'mage'],   weak: ['archer'],         flavor: 'Armoured brawler; shrugs off polearms, suffers under arrows.' },
    archer: { strong: ['sword', 'spear'],  weak: ['spear at melee'], flavor: 'Shreds heavy infantry; panics when closed on.' },
    mage:   { strong: ['spear', 'sword'],  weak: ['archer', 'spear'],flavor: 'Melts melee blobs; glass-cannon when focused.' },
  };

  // ---- First-10-wave enemy siege design ----
  // mix   : probability weights for _pickRole (champion excluded here; added by schedule)
  // count : base enemy count before countScale
  BF.WAVE_DESIGN = [
    { n:1,  name:'Skirmish Line',      mix:{ spear:1.0 },                           count:3,  challenge:'Single type; teaches lane placement.' },
    { n:2,  name:'Massed Levies',      mix:{ spear:0.7, sword:0.3 },                count:5,  challenge:'First heavies – prioritise swords.' },
    { n:3,  name:'Armoured Footmen',   mix:{ spear:0.35, sword:0.65 },              count:6,  challenge:'Sword-heavy; archers now earn cost.' },
    { n:4,  name:'Crossbow Snipers',   mix:{ spear:0.4, sword:0.3, archer:0.3 },   count:7,  challenge:'First ranged; players need counter-archers.' },
    { n:5,  name:'Raid Party',         mix:{ sword:0.4, archer:0.4, spear:0.2 },   count:9,  challenge:'Balanced push; economy stress-test.' },
    { n:6,  name:'Siege Division',     mix:{ sword:0.4, archer:0.3, mage:0.3 },    count:10, challenge:'Mages debut; AoE punishes tight clusters.' },
    { n:7,  name:'Battering Vanguard', mix:{ spear:0.2, sword:0.5, mage:0.3 },     count:11, challenge:'Heavy melee + mage combo; gate HP at risk.' },
    { n:8,  name:'Arrow Storm',        mix:{ archer:0.55, mage:0.45 },              count:12, challenge:'Ranged-dominant; spear Shield Wall shines.' },
    { n:9,  name:'Elite Guard',        mix:{ sword:0.35, archer:0.3, mage:0.35 },  count:13, challenge:'Stats near champion tier; merc/repair advised.' },
    { n:10, name:'Final Assault',      mix:{ sword:0.35, archer:0.3, mage:0.35 },  count:15, challenge:'Champion spawns at wave end; all resources on deck.' },
  ];

  if (typeof module !== 'undefined') module.exports = BF;
})();
