/* ============================================================
 * content.js — Game data: resources, biomes, name generation,
 * crafting recipe. Pure data + small deterministic helpers.
 * ============================================================ */
(function (global) {
  'use strict';

  // Harvestable resources. `fuel` flags items used to craft warp cells.
  const RESOURCES = {
    ferrite:  { name: 'Ferrite',   color: '#b07d52', short: 'Fe' },
    carbon:   { name: 'Carbon',    color: '#3a3a3a', short: 'C'  },
    sodium:   { name: 'Sodium',    color: '#e8a33d', short: 'Na' },
    cobalt:   { name: 'Cobalt',    color: '#4a7bd6', short: 'Co' },
    plutonium:{ name: 'Plutonium', color: '#5fd66a', short: 'Pu', fuel: true },
    dihydro:  { name: 'Dihydrogen',color: '#5fd6c8', short: 'H2', fuel: true },
  };

  // Planet biome palettes. Each has terrain bands low->high.
  const BIOMES = [
    { id: 'lush',   name: 'Lush',     bands: ['#11304a', '#1d6b4a', '#2f9e57', '#7fbf5a', '#cdd98a'], orb: '#3fcf6a',
      res: ['carbon', 'ferrite', 'sodium', 'plutonium'] },
    { id: 'desert', name: 'Arid',     bands: ['#5b3a1a', '#8a5a24', '#c08a3a', '#e0b86a', '#f0dca0'], orb: '#e0a64a',
      res: ['ferrite', 'sodium', 'cobalt', 'dihydro'] },
    { id: 'frozen', name: 'Frozen',   bands: ['#1a3550', '#365f7a', '#6f9fb8', '#bcd6ea', '#eef6ff'], orb: '#9fd0ff',
      res: ['dihydro', 'cobalt', 'ferrite', 'carbon'] },
    { id: 'toxic',  name: 'Toxic',    bands: ['#241a3a', '#3d2a5a', '#5e3a7a', '#8a5fa6', '#b88fd0'], orb: '#a05fd0',
      res: ['plutonium', 'sodium', 'carbon', 'cobalt'] },
    { id: 'scorch', name: 'Scorched', bands: ['#3a0d0d', '#6e1a14', '#a82e1c', '#d6582a', '#f0a24a'], orb: '#e0431a',
      res: ['ferrite', 'plutonium', 'sodium', 'carbon'] },
    { id: 'barren', name: 'Barren',   bands: ['#2a2a30', '#444450', '#5e5e6a', '#888894', '#bcbcc6'], orb: '#9a9aa6',
      res: ['ferrite', 'cobalt', 'carbon', 'dihydro'] },
  ];

  // Recipe to craft one Warp Cell (refuels hyperdrive).
  const WARP_RECIPE = { plutonium: 25, dihydro: 25 };

  const SYS_PRE = ['Hyades', 'Eissen', 'Korva', 'Tau', 'Vega', 'Nox', 'Ardent', 'Lumen',
    'Wyrd', 'Onar', 'Pyxis', 'Calyx', 'Drennan', 'Eos', 'Mira', 'Yarr'];
  const SYS_SUF = ['Major', 'Minor', 'Prime', 'IX', 'VII', 'Reach', 'Expanse', 'Cluster',
    'Drift', 'Verge', 'Belt', 'Gate', 'XII', 'III', 'Nebula'];
  const PL_SYL = ['ar', 'on', 'ix', 'us', 'or', 'an', 'el', 'oth', 'ra', 'ki', 'um', 'es', 'yr', 'ad'];

  function pick(rng, arr) { return arr[(rng() * arr.length) | 0]; }

  function systemName(rng) {
    return pick(rng, SYS_PRE) + ' ' + pick(rng, SYS_SUF);
  }

  function planetName(rng) {
    let n = pick(rng, SYS_PRE).slice(0, 3);
    const parts = 1 + ((rng() * 2) | 0);
    for (let i = 0; i < parts; i++) n += pick(rng, PL_SYL);
    n += '-' + (((rng() * 900) | 0) + 100);
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  function creatureName(rng) {
    const a = ['Glide', 'Stomp', 'Crawl', 'Float', 'Dart', 'Hulk', 'Spine', 'Gleam'];
    const b = ['back', 'maw', 'wing', 'horn', 'fin', 'pod', 'claw', 'eye'];
    return pick(rng, a) + pick(rng, b);
  }

  global.Content = {
    RESOURCES, BIOMES, WARP_RECIPE,
    systemName, planetName, creatureName, pick,
  };
})(window);
