/* ============================================================
 * rng.js — Deterministic pseudo-random + value noise utilities
 * Everything is seed-driven so a star system / planet always
 * regenerates identically. No allocations in hot paths.
 * ============================================================ */
(function (global) {
  'use strict';

  // Fast 32-bit seeded PRNG (Mulberry32). Returns a function -> [0,1)
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Turn an arbitrary string into a 32-bit integer seed (xfnv1a).
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Deterministic hash of two integers -> [0,1). Used for value noise.
  function hash2(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // 2D value noise in [0,1].
  function valueNoise(x, y, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const v00 = hash2(x0, y0, seed);
    const v10 = hash2(x0 + 1, y0, seed);
    const v01 = hash2(x0, y0 + 1, seed);
    const v11 = hash2(x0 + 1, y0 + 1, seed);
    return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
  }

  // Fractal (fBm) value noise. octaves kept low for mobile perf.
  function fbm(x, y, seed, octaves) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    octaves = octaves || 3;
    for (let o = 0; o < octaves; o++) {
      sum += amp * valueNoise(x * freq, y * freq, seed + o * 1013);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  global.RNG = { mulberry32, hashSeed, hash2, valueNoise, fbm, lerp, smooth };
})(window);
