# Stellar Drift 🚀

A tiny, mobile-first space exploration game inspired by **No Man's Sky** —
built with plain HTML5 Canvas + JavaScript. No engine, no build step, no
dependencies. Just open it and play, on a phone or a desktop browser.

> Intentionally lightweight (not photo-realistic) but a complete, playable
> loop, optimized to run smoothly even on modest mobile hardware.

## ▶ Play

Open `index.html` in any modern browser. On a phone, serve the folder over
HTTP (e.g. `python3 -m http.server`) or host it anywhere static and open the
URL. Works offline once loaded; progress auto-saves to the device.

## Gameplay loop

1. **Fly** your ship through a procedurally generated star system.
2. **Land** on a planet (each has its own biome, terrain, resources & creatures).
3. **Mine** resources and **scan** alien creatures on foot.
4. **Craft Warp Cells** from fuel materials (Plutonium + Dihydrogen) in the 🎒 menu.
5. **Warp** to a brand-new star system and repeat — the galaxy is endless.

Manage your **life support** while exploring: it drains away from your ship,
so head back to refuel before it runs out.

## Controls

| Action | Touch | Keyboard |
|--------|-------|----------|
| Move / fly | Virtual joystick (drag on **left half** of screen) | WASD / Arrows |
| Boost / Mine / Scan | Hold the round button (bottom-right) | Space |
| Land / Take off / Warp | Context button (bottom-right) | tap |
| Inventory & crafting | 🎒 button (top-right) | tap |

## How it's optimized

- **Seeded procedural generation** (Mulberry32 PRNG + value/fBm noise) — every
  system & planet is reproducible from a single 32-bit seed; nothing is stored.
- **Chunked terrain** rendered once into cached offscreen canvases, loaded/unloaded
  around the player; far chunks are evicted to cap memory.
- **Pre-rendered planet sprites** (gradient + mottling + atmosphere) drawn once.
- **Infinite parallax starfield** generated from hashed grid cells — zero allocations.
- **Viewport culling** everywhere; **device-pixel-ratio capped at 2**; delta-time
  clamped; single `requestAnimationFrame` loop.

## Project structure

```
index.html        markup + HUD/controls
src/style.css     mobile-first UI styling (safe-area aware)
src/rng.js        seeded PRNG + value/fBm noise
src/content.js    resources, biomes, name generation, recipes
src/input.js      virtual joystick + keyboard, unified input
src/game.js       core loop, scenes, save/load, HUD, crafting
src/space.js      in-system flight scene
src/planet.js     on-foot planet exploration scene
src/boot.js       intro screen + launch
```
