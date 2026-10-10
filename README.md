# Bannerfall

A fully offline medieval defence game for phones. Pick a legion (Men, Elves, Orcs, Goblins or Dwarves), hold the gate against marching armies, and conquer your way across the world map toward the Obsidian Citadel.

"Bannerfall" is a working title. Search App Store Connect for name clashes before you commit to it.

No internet, no accounts, no ads, no tracking. All art is drawn in code and all sound is synthesised, so there are no image or audio files to manage. Progress saves on the device.

---

## 1. Run it (30 seconds)

**Easiest:** open `www/index.html` in Chrome or Safari. Use the browser's device toolbar (Chrome: F12, then the phone icon) to see it at phone size.

**With live reload in VS Code:** install the "Live Server" extension, right-click `www/index.html`, then "Open with Live Server". Or from a terminal in this folder:

```
npm run serve
```

then open http://localhost:8080.

---

## 2. How the game works

- **The board:** 5 lanes by 6 rows. Enemies march down a lane and stop to fight the first unit in their way. Anything that reaches the bottom damages your gate. Gate at zero means defeat.
- **Deploying:** tap a unit card, then tap a tile. Tap **Dismiss** then a unit to sell it back for 60%. Tap a placed unit to see its firing range.
- **Position matters:** melee enemies stop 40px in front of your front unit. Spears reach one tile behind the front line. Archers and mages sit two or three tiles back. Enemy archers and mages close to 70px from your front line, so you can always answer them, but a unit placed too far back cannot.
- **Gold:** you earn gold over time and from every kill. Units cost gold.
- **Conquest:** the map is a road of 8 lands. Each is held by one of the other four legions. Every land is harder than the last (more waves, tougher enemies, champions near the end, a warlord at the Citadel).
- **Tribute:** every land you conquer raises your income by 8% in later battles, so conquering makes you stronger while the enemy also scales up.
- **Glory and upgrades:** stars (1 to 3, based on how much gate you have left) earn Glory. Spend it at the War Council on Royal Treasury, Barracks and Fortified Gate. Each legion has its own campaign and its own upgrades.

### Legions

| Legion | Style | Perks |
|---|---|---|
| Men | Elite swordsmen | +20% income |
| Elves | Longest-ranged archers | Units regenerate 3 HP/s (others 1) |
| Orcs | Heavy, hard-hitting melee | Berserk (melee 25% faster below half health), +10% income |
| Goblins | Cheapest units, swarm | +35% gold per kill, +25% income |
| Dwarves | Armoured and tough | 15% less damage taken, gate +25% health |

### Prices (in-game gold)

Men match your price list exactly: Spearman 100, Swordsman 250, Archer 300, Mage 450.

| Legion | Spear | Sword | Archer | Mage |
|---|---|---|---|---|
| Men | Spearman 100 | Swordsman 250 | Archer 300 | Battle Mage 450 |
| Elves | Glade Spear 90 | Bladedancer 220 | Longbow Ranger 390 | Moon Mage 410 |
| Orcs | Raider 110 | Warbrute 330 | Skirmisher 180 | Shaman 330 |
| Goblins | Stabber 80 | Cutthroat 160 | Slinger 200 | Hexer 320 |
| Dwarves | Pikeman 120 | Axeguard 290 | Crossbowman 280 | Runesmith 450 |

**Costs follow strength.** Every unit in every legion is priced by one formula in `www/js/data.js`:

> power = sqrt(damage-per-second x effective health) x range bonus
> (area attacks count 1.5x, armour raises effective health)
> cost = power x 3.953, rounded to the nearest 10

Edit a unit's stats and its price updates itself. Run `npm run balance` to see the full table: every unit lands at about 3.9 to 4.1 gold per point of power.

---

## 3. Where to edit

| You want to change | File |
|---|---|
| Legions, unit stats, perks, economy, upgrades, map, difficulty | `www/js/data.js` |
| Combat rules, wave generation, enemy behaviour | `www/js/engine.js` |
| How units, enemies and the field look | `www/js/render.js` |
| Menus, map, save, sound, touch input | `www/js/ui.js` |
| Colours, layout | `www/css/style.css` |

Difficulty knobs, all in `data.js`: `hpScale`, `dmgScale`, `countScale` and `waves` (per land), plus `ECON` (start gold, income, bounty, tribute).

---

## 4. Balance testing

```
npm run balance
```

This prints the price table, then plays hundreds of battles with a simple bot (no UI needed) and shows win rate and average gate health left for each legion at each land.

Current results with a basic fixed-strategy bot: all legions clear lands 1 and 2 almost every time, most clear 3 and 4, and the Citadel (land 8) is a real wall (best legions win about a third to two thirds of the time, others rarely). A human who adapts and spends upgrades well should do better than the bot, but that is not yet verified. **The balance is a tested starting point, not finished. Playtest it on a real phone and adjust.**

---

## 5. Put it on the App Store

You need: a Mac with Xcode, and an Apple Developer Program membership (currently USD 99 per year). Check Apple's site for current requirements.

The game is plain web code. [Capacitor](https://capacitorjs.com) wraps it into a real iOS app.

### One-time setup

In this folder:

```
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli
npx cap add ios
```

### Every time you change the game

```
npx cap sync ios
npx cap open ios
```

### In Xcode

1. Click the **App** project, then **Signing & Capabilities**. Choose your Team and set a unique **Bundle Identifier** (also update `appId` in `capacitor.config.json` to match).
2. **General** tab, **Deployment Info**: untick Landscape so the game is portrait only. Set iPhone only if you do not want an iPad version.
3. Replace the app icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset` takes a single 1024x1024 image. A placeholder is in `assets/icon-1024.png` (no transparency, as Apple requires). Swap in your own art when you have it.
4. Set **Version** (1.0) and **Build** (1).
5. Pick "Any iOS Device (arm64)" as the target, then **Product, Archive, Distribute App, App Store Connect**.

### In App Store Connect

- Create the app record (name, bundle id, primary language).
- Add screenshots (take them from the Simulator or a device; Apple lists the required sizes).
- **Privacy:** the game collects no data and makes no network calls, so you can declare "Data Not Collected" and use a simple privacy policy page that says so. You still need a privacy policy URL.
- **Age rating:** answer the questionnaire honestly; cartoon/fantasy violence applies.
- Submit for review, then test the TestFlight build on a real phone first.

### Things to know

- **In-game "$":** the prices are in-game gold, not real money. If you later sell anything for real money (gems, unlocks, ad removal) it must use Apple's in-app purchase system.
- **Review risk:** Apple can reject apps that feel like a repackaged website. This is a real interactive game with its own saves and sound, which helps, but polish it before submitting.
- **Android later:** the same `www` folder works with `npm install @capacitor/android` and `npx cap add android`.

---

## 6. Ideas for next steps

- Real sprite art and animations (replace `drawToken` in `render.js`).
- Music and richer sound effects.
- Hero units with special abilities, per-legion unit upgrades, more than four unit types.
- Branching world map and random events.
- Endless mode for each legion.
- Game Center leaderboards (needs a Capacitor plugin).
