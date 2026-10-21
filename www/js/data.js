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
  // 10/90 Horizon Rule: sky=10% of canvas height, battlefield=90%
  BF.GRID = { rows: 6, cell: 42, sky: 38, w: 504, h: 288, cw: 504, ch: 376 };
  BF.CASTLE_W  = 54;   // pixel width of the castle gate drawing
  BF.SPAWN_X   = 66;   // x where new defenders appear (emerge from the castle)
  BF.MARCH_SPD = 13;   // px/s base march speed for defenders (slower for epic scale)

  // Dynamic resolution: recompute GRID to match the container's aspect ratio
  BF.reflow = function (containerW, containerH) {
    if (containerW <= 0 || containerH <= 0) return;
    var G = BF.GRID;
    var aspect = Math.max(1.0, Math.min(2.5, containerW / containerH));
    var ch = 376;
    var sky = Math.round(ch * 0.10);
    var btm = 8;
    var avail = ch - sky - btm;
    var cell = Math.floor(avail / G.rows);
    var h = cell * G.rows;
    G.ch = ch;
    G.sky = ch - h - btm;
    G.h = h;
    G.cell = cell;
    G.cw = Math.round(ch * aspect);
    G.w = G.cw;
  };
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

  // ---- Faction ultimate abilities — each summons an OG Force + area effect ----
  BF.ABILITIES = {
    men:     { name: 'Holy Smite',  key: 'HS', desc: 'Summons a Paladin; holy bolts strike every lane',       cooldown: 45 },
    elves:   { name: 'Hurricane',   key: 'HU', desc: 'Summons Spirit Warden; hurricane blasts enemies back',  cooldown: 40 },
    orcs:    { name: 'Eruption',    key: 'ER', desc: 'Summons Demonic Giant; volcanic burst scorches all foes',cooldown: 40 },
    goblins: { name: 'Acid Rain',   key: 'AR', desc: 'Summons Scrap Mech; acid shower melts all enemies',     cooldown: 40 },
    dwarves: { name: 'Earthquake',  key: 'EQ', desc: 'Summons Runesmith Golem; tremor slows all enemies 4s',  cooldown: 45 },
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
    spear: { speed: 18, leak: 4 },
    sword: { speed: 15, leak: 6 },
    archer: { speed: 15, leak: 5 },
    mage: { speed: 13, leak: 6 },
  };

  /* --------------------------------------------------------------------------
     LEGIONS
     -------------------------------------------------------------------------- */
  BF.FACTIONS = [
    {
      id: 'men', name: 'Men of Aldermere', short: 'Men',
      color: '#4a78c2', accent: '#a9c1ec',
      tagline: 'Disciplined steel. The finest swordsmen in the realm.',
      lore: { goal: 'Unite the fractured provinces and seize the Obsidian Citadel to claim dominion over Middle Earth.', crisis: 'The high council has been corrupted. Former allies brand you a traitor while four rival legions march on the Citadel.' },
      perks: ['Elite swordsmen: heavy, hard-hitting blades', '+20% gold income'],
      mods: { income: 1.2, bounty: 1, baseHp: 1, armor: 0, regen: 0, berserk: false },
      units: {
        spear: { name: 'Spearman', hp: 80, dmg: 8, rate: 1.0, range: 38 },
        sword: { name: 'Swordsman', hp: 190, dmg: 19, rate: 1.1, range: 30 },
        archer: { name: 'Archer', hp: 70, dmg: 15, rate: 0.85, range: 250 },
        mage: { name: 'Battle Mage', hp: 75, dmg: 30, rate: 0.7, range: 230, aoe: 80 },
      },
    },
    {
      id: 'elves', name: 'Elves of Sylvanmere', short: 'Elves',
      color: '#3f9a6a', accent: '#a6e3bf',
      tagline: 'Slow, patient arrows that reach across the whole field.',
      lore: { goal: 'Purge the dark blight from the ancient forests and claim the Citadel to restore natural order across Middle Earth.', crisis: 'Goblin logging mechs devastate the outer woods while four rival legions race toward the same throne.' },
      perks: ['Longest-ranged archers in the game', 'Defenders regenerate 3 HP/s'],
      mods: { income: 1, bounty: 1, baseHp: 1, armor: 0, regen: 3, berserk: false },
      units: {
        spear: { name: 'Glade Spear', hp: 70, dmg: 7, rate: 1.0, range: 38 },
        sword: { name: 'Bladedancer', hp: 150, dmg: 17, rate: 1.2, range: 30 },
        archer: { name: 'Longbow Ranger', hp: 65, dmg: 22, rate: 0.55, range: 330 },
        mage: { name: 'Moon Mage', hp: 65, dmg: 28, rate: 0.65, range: 240, aoe: 80 },
      },
    },
    {
      id: 'orcs', name: 'Orcs of the Ashen Horde', short: 'Orcs',
      color: '#b5482f', accent: '#f0a98e',
      tagline: 'Brutes who grow wilder the more they bleed.',
      lore: { goal: 'Escape the volcanic wastes and conquer the Citadel to claim Middle Earth as the new Orc homeland.', crisis: 'Dwarves block the mountain gates while four rival legions also march on the Citadel. Lava closes in behind.' },
      perks: ['Massive health and damage in melee', 'Berserk: attacks 25% faster below half health'],
      mods: { income: 1.1, bounty: 1, baseHp: 1, armor: 0, regen: 0, berserk: true },
      units: {
        spear: { name: 'Raider', hp: 100, dmg: 9, rate: 0.9, range: 38 },
        sword: { name: 'Warbrute', hp: 260, dmg: 26, rate: 1.0, range: 30 },
        archer: { name: 'Skirmisher', hp: 55, dmg: 11, rate: 0.8, range: 210 },
        mage: { name: 'Shaman', hp: 65, dmg: 28, rate: 0.6, range: 210, aoe: 80 },
      },
    },
    {
      id: 'goblins', name: 'Goblins of Gloomhollow', short: 'Goblins',
      color: '#a3a93a', accent: '#e3e68f',
      tagline: 'Cheap, quick and everywhere. Win by sheer numbers.',
      lore: { goal: 'Claw up from the collapsing caverns and storm the Citadel to crown a Goblin king over Middle Earth.', crisis: 'Unstable scrap-tech misfires constantly while four rival legions and scrap-baron mutiny threaten every advance.' },
      perks: ['Cheapest units in the game', '+35% gold from kills, +25% starting gold'],
      mods: { income: 1.25, bounty: 1.35, baseHp: 1, armor: 0, regen: 0, berserk: false },
      units: {
        spear: { name: 'Stabber', hp: 55, dmg: 6, rate: 1.2, range: 38 },
        sword: { name: 'Cutthroat', hp: 110, dmg: 12, rate: 1.3, range: 30 },
        archer: { name: 'Slinger', hp: 45, dmg: 8.5, rate: 1.1, range: 240 },
        mage: { name: 'Hexer', hp: 50, dmg: 26, rate: 0.7, range: 220, aoe: 85 },
      },
    },
    {
      id: 'dwarves', name: 'Dwarves of Karak Dun', short: 'Dwarves',
      color: '#c08a3e', accent: '#f1d09a',
      tagline: 'Armoured and immovable. Nothing gets through the line.',
      lore: { goal: 'Reclaim the deep-mines, forge ancient runic weapons, and take the Citadel to become guardians of Middle Earth.', crisis: 'A subterranean menace breaches the lower shafts while four rival legions compete for the same throne above.' },
      perks: ['Armour: all damage cut by 15%', 'Gate has 25% more health'],
      mods: { income: 1, bounty: 1, baseHp: 1.25, armor: 0.15, regen: 0, berserk: false },
      units: {
        spear: { name: 'Pikeman', hp: 110, dmg: 8, rate: 0.9, range: 38 },
        sword: { name: 'Axeguard', hp: 240, dmg: 21, rate: 0.9, range: 30 },
        archer: { name: 'Crossbowman', hp: 80, dmg: 17, rate: 0.7, range: 210 },
        mage: { name: 'Runesmith', hp: 85, dmg: 33, rate: 0.6, range: 210, aoe: 75 },
      },
    },
  ];

  // Citadel: non-playable faction that defends the final territory
  BF.CITADEL_FACTION = {
    id: 'citadel', name: 'The Celestial Citadel', short: 'Citadel',
    color: '#8a6ad0', accent: '#c8b0f0',
    tagline: 'Divine enforcers guarding the seat of power.',
    mods: { income: 1.1, bounty: 1.1, baseHp: 1.1, armor: 0.05, regen: 1, berserk: false },
    units: {
      spear: { name: 'Sentinel', hp: 95, dmg: 9, rate: 1.0, range: 38 },
      sword: { name: 'Seraph Knight', hp: 210, dmg: 22, rate: 1.05, range: 30 },
      archer: { name: 'Starbow', hp: 75, dmg: 18, rate: 0.75, range: 270 },
      mage: { name: 'Oracle', hp: 80, dmg: 32, rate: 0.65, range: 230, aoe: 80 },
    },
  };
  for (const role of BF.ROLES) {
    const u = BF.CITADEL_FACTION.units[role];
    u.role = role;
    u.cost = BF.costOf(u, BF.CITADEL_FACTION.mods.armor);
  }

  var FACTION_DISCOUNT = {
    men: 'sword', elves: 'archer', orcs: 'sword', goblins: 'spear', dwarves: 'spear'
  };
  for (const f of BF.FACTIONS) {
    f.discount = FACTION_DISCOUNT[f.id] || null;
    for (const role of BF.ROLES) {
      const u = f.units[role];
      u.role = role;
      u.cost = BF.costOf(u, f.mods.armor);
      if (role === f.discount) u.cost = Math.max(10, Math.round(u.cost * 0.7));
    }
  }

  // ---- OG Forces: elite champions summoned by ultimate abilities ----
  const OG_DEFS = {
    men:     { name: 'Paladin',         hp: 420, dmg: 40, rate: 0.70, range: 52,  aoe: 55 },
    elves:   { name: 'Spirit Warden',   hp: 350, dmg: 28, rate: 0.60, range: 300, aoe: 90 },
    orcs:    { name: 'Demonic Giant',   hp: 580, dmg: 50, rate: 0.80, range: 56,  aoe: 60 },
    goblins: { name: 'Scrap Mech',      hp: 260, dmg: 20, rate: 2.20, range: 180, aoe: 80 },
    dwarves: { name: 'Runesmith Golem', hp: 750, dmg: 32, rate: 0.65, range: 58,  aoe: 55 },
  };
  for (const f of BF.FACTIONS) {
    const og = OG_DEFS[f.id];
    if (og) { og.role = 'og'; og.cost = 500; f.units.og = og; }
  }

  BF.factionById = (id) => BF.FACTIONS.find((f) => f.id === id) || (id === 'citadel' ? BF.CITADEL_FACTION : null);

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

  // All territories (x,y in the 900×520 landscape map SVG viewBox)
  BF.TERRITORIES = [
    // ── Elves of Sylvanmere (North — mystical forests) ────────────────────
    { id: 't_starfall',    name: 'Starfall Pools',     owner: 'elves',   x: 315, y: 29,  adj: ['t_sylvan', 't_moonveil', 't_ancient'] },
    { id: 't_ancient',     name: 'Ancient Canopy',     owner: 'elves',   x: 612, y: 36,  adj: ['t_starfall', 't_sylvan', 't_thornwood'] },
    { id: 't_moonveil',    name: 'Moonveil Glade',     owner: 'elves',   x: 144, y: 69,  adj: ['t_starfall', 't_sylvan', 't_whisperwood', 't_raiders'] },
    { id: 't_sylvan',      name: 'Sylvanmere Grove',   owner: 'elves',   x: 405, y: 65,  adj: ['t_starfall', 't_moonveil', 't_ancient', 't_thornwood', 't_ashfield', 't_citadel'] },
    { id: 't_thornwood',   name: 'Thornwood Pass',     owner: 'elves',   x: 711, y: 87,  adj: ['t_ancient', 't_sylvan', 't_scorched', 't_ironwall'] },
    { id: 't_whisperwood', name: 'Whisperwood',        owner: 'elves',   x: 171, y: 126, adj: ['t_moonveil', 't_raiders', 't_emberpits'] },

    // ── Orcs of the Ashen Horde (West — volcanic wastelands) ──────────────
    { id: 't_emberpits',   name: 'Ember Pits',         owner: 'orcs',    x: 99,  y: 163, adj: ['t_whisperwood', 't_raiders', 't_bloodforge'] },
    { id: 't_raiders',     name: "Raider's Reach",     owner: 'orcs',    x: 81,  y: 213, adj: ['t_moonveil', 't_whisperwood', 't_emberpits', 't_ashfield', 't_bloodforge'] },
    { id: 't_ashfield',    name: 'Ashfield',           owner: 'orcs',    x: 279, y: 188, adj: ['t_sylvan', 't_raiders', 't_scorched', 't_warpeak', 't_frosthold', 't_karakdun', 't_citadel'] },
    { id: 't_scorched',    name: 'Scorched Plains',    owner: 'orcs',    x: 549, y: 177, adj: ['t_thornwood', 't_ashfield', 't_ironwall', 't_ironvein'] },
    { id: 't_bloodforge',  name: 'Blood Forge',        owner: 'orcs',    x: 72,  y: 271, adj: ['t_emberpits', 't_raiders', 't_warpeak', 't_deepmines'] },
    { id: 't_warpeak',     name: 'War Peak',           owner: 'orcs',    x: 225, y: 249, adj: ['t_ashfield', 't_bloodforge', 't_deepmines', 't_karakdun'] },

    // ── Dwarves of Karak Dun (Central — snowy alpine peaks) ───────────────
    { id: 't_frosthold',   name: 'Frosthold',          owner: 'dwarves', x: 387, y: 228, adj: ['t_ashfield', 't_karakdun', 't_anvil', 't_ironvein'] },
    { id: 't_ironvein',    name: 'Ironvein Tunnels',   owner: 'dwarves', x: 612, y: 224, adj: ['t_scorched', 't_frosthold', 't_stoneforge', 't_ironwall'] },
    { id: 't_karakdun',    name: 'Karak Dun',          owner: 'dwarves', x: 441, y: 278, adj: ['t_ashfield', 't_warpeak', 't_frosthold', 't_deepmines', 't_stoneforge', 't_anvil', 't_gloomhollow', 't_keep', 't_citadel'] },
    { id: 't_deepmines',   name: 'The Deepmines',      owner: 'dwarves', x: 207, y: 300, adj: ['t_bloodforge', 't_warpeak', 't_karakdun', 't_mudmire'] },
    { id: 't_stoneforge',  name: 'Stoneforge',         owner: 'dwarves', x: 666, y: 282, adj: ['t_ironvein', 't_karakdun', 't_anvil', 't_keep', 't_skullpeak'] },
    { id: 't_anvil',       name: 'The Anvil',          owner: 'dwarves', x: 513, y: 318, adj: ['t_frosthold', 't_karakdun', 't_stoneforge', 't_silverbridge'] },

    // ── Men of Aldermere (East — golden valleys) ──────────────────────────
    { id: 't_ironwall',    name: 'Ironwall Cliffs',    owner: 'men',     x: 801, y: 141, adj: ['t_thornwood', 't_scorched', 't_ironvein', 't_watchtower', 't_keep'] },
    { id: 't_keep',        name: 'Aldermere Keep',     owner: 'men',     x: 774, y: 256, adj: ['t_ironwall', 't_stoneforge', 't_karakdun', 't_silverbridge', 't_watchtower', 't_marches', 't_citadel'] },
    { id: 't_watchtower',  name: 'The Watchtower',     owner: 'men',     x: 837, y: 206, adj: ['t_ironwall', 't_keep', 't_harvest'] },
    { id: 't_silverbridge',name: 'Silver Bridge',      owner: 'men',     x: 711, y: 321, adj: ['t_keep', 't_anvil', 't_harvest'] },
    { id: 't_harvest',     name: 'Harvest Fields',     owner: 'men',     x: 828, y: 343, adj: ['t_watchtower', 't_silverbridge', 't_marches'] },
    { id: 't_marches',     name: 'Greywatch Marches',  owner: 'men',     x: 738, y: 386, adj: ['t_keep', 't_harvest', 't_skullpeak', 't_gloomhollow'] },

    // ── Goblins of Gloomhollow (South — toxic swamps) ─────────────────────
    { id: 't_gloomhollow', name: 'Gloomhollow Warren', owner: 'goblins', x: 387, y: 394, adj: ['t_karakdun', 't_mudmire', 't_marches', 't_skullpeak', 't_rotfen', 't_toxicspire', 't_citadel'] },
    { id: 't_mudmire',     name: 'Mudmire Bog',        owner: 'goblins', x: 153, y: 386, adj: ['t_deepmines', 't_gloomhollow', 't_rotfen'] },
    { id: 't_skullpeak',   name: 'Skullpeak',          owner: 'goblins', x: 621, y: 386, adj: ['t_stoneforge', 't_marches', 't_gloomhollow', 't_darktide'] },
    { id: 't_rotfen',      name: 'Rotfen Marsh',       owner: 'goblins', x: 198, y: 441, adj: ['t_mudmire', 't_gloomhollow'] },
    { id: 't_toxicspire',  name: 'Toxicspire',         owner: 'goblins', x: 459, y: 441, adj: ['t_gloomhollow', 't_darktide'] },
    { id: 't_darktide',    name: 'Dark Tide',          owner: 'goblins', x: 693, y: 433, adj: ['t_skullpeak', 't_toxicspire'] },

    // ── Obsidian Citadel (centre of the world — requires 3 of 4 enemy legion homes) ──
    { id: 't_citadel', name: 'Obsidian Citadel', owner: 'citadel', x: 450, y: 260, adj: ['t_keep', 't_sylvan', 't_ashfield', 't_karakdun', 't_gloomhollow'], final: true },
  ];

  BF.territoryById = (id) => BF.TERRITORIES.find((t) => t.id === id);

  /* Build the campaign for a given player faction.
     Returns territory objects with difficulty stats injected.
     Territories owned by the player's faction are reassigned to rival factions. */
  // Faction homes of the 4 enemies (used for Citadel unlock check)
  BF.enemyHomes = function (playerId) {
    return BF.FACTIONS.filter(f => f.id !== playerId).map(f => BF.FACTION_HOME[f.id]);
  };

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

    // Dynamic layout: rotate all territory positions so player's home is at the bottom
    // and the Citadel stays at centre
    const cx = 450, cy = 260;
    const homeT = BF.territoryById(homeId);
    const homeAngle = Math.atan2(homeT.y - cy, homeT.x - cx);
    const targetAngle = Math.PI / 2; // bottom
    const rot = targetAngle - homeAngle;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);

    return BF.TERRITORIES.map((t) => {
      const d = dist[t.id] !== undefined ? dist[t.id] : 8;
      const idx = Math.max(0, d - 1);
      let owner = t.owner;
      if (owner === playerId) {
        const r = rivals[BF.TERRITORIES.indexOf(t) % rivals.length];
        owner = r.id;
      }
      if (t.final) owner = owner || rivals[0].id;

      // Rotate position around map centre
      const dx = t.x - cx, dy = t.y - cy;
      const rx = cx + dx * cosR - dy * sinR;
      const ry = cy + dx * sinR + dy * cosR;

      return Object.assign({}, t, {
        owner,
        index: idx,
        waves: t.final ? 9 : 5 + d,
        hpScale:    0.90 + 0.12 * idx,
        dmgScale:   0.85 + 0.12 * idx,
        countScale: 0.90 + 0.10 * idx,
        mapX: Math.round(rx),
        mapY: Math.round(ry),
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
  BF.AUTO_RECRUIT = { interval: 50 };
  BF.REPAIR_CD = 20;
  BF.MERC_CD = 15;

  // ---- Barracks upgrade attributes (progressive star cost: level N costs N stars) ----
  BF.UPGRADE_ATTRS = [
    { id: 'atkSpd',    name: 'Attack Speed',          desc: '+8% attack speed per level',      max: 5, perLv: 0.08 },
    { id: 'atkStr',    name: 'Attack Strength',       desc: '+8% attack damage per level',     max: 5, perLv: 0.08 },
    { id: 'def',       name: 'Defence',               desc: '+6% damage reduction per level',  max: 5, perLv: 0.06 },
    { id: 'moveSpd',   name: 'Movement Speed',        desc: '+6% movement speed per level',    max: 5, perLv: 0.06 },
    { id: 'goldReduc', name: 'Gold Cost Reduction',   desc: '-5% unit gold cost per level',    max: 5, perLv: 0.05 },
  ];
  BF.starUpgCost = (currentLevel) => currentLevel + 1;
  BF.starUpgTotalSpent = (level) => level * (level + 1) / 2;

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
