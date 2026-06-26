/* ============================================================
 * space.js — In-system flight. Procedural star system, inertial
 * ship control, planet approach/landing, hyperspace warp.
 * ============================================================ */
(function (global) {
  'use strict';

  const C = global.Content, RNG = global.RNG;

  function SpaceScene(game, fromPlanetId) {
    this.g = game;
    this._genSystem();
    // Spawn near system edge or just above the planet we left from.
    let sx = 0, sy = -this.systemRadius * 0.7;
    if (fromPlanetId != null) {
      const p = this.planets.find(function (q) { return q.id === fromPlanetId; });
      if (p) { sx = p.x; sy = p.y - p.r - 90; }
    }
    this.ship = { x: sx, y: sy, vx: 0, vy: 0, angle: -Math.PI / 2 };
    this.maxSpeed = 520;
    this.cam = { x: sx, y: sy };
  }

  SpaceScene.prototype._genSystem = function () {
    const seed = this.g.save.systemSeed >>> 0;
    const rng = RNG.mulberry32(seed);
    this.seed = seed;
    this.name = C.systemName(rng);
    const count = 3 + ((rng() * 4) | 0); // 3..6 planets
    this.planets = [];
    let dist = 520;
    for (let i = 0; i < count; i++) {
      dist += 360 + rng() * 520;
      const ang = rng() * Math.PI * 2;
      const biome = C.BIOMES[(rng() * C.BIOMES.length) | 0];
      const r = 70 + rng() * 120;
      const pseed = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
      const prng = RNG.mulberry32(pseed);
      this.planets.push({
        id: i,
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        r: r,
        biome: biome,
        seed: pseed,
        name: C.planetName(prng),
        sprite: makePlanetSprite(biome, r, pseed),
      });
    }
    this.systemRadius = dist + 400;
  };

  SpaceScene.prototype.onResize = function () {};

  SpaceScene.prototype.update = function (dt) {
    const g = this.g, inp = g.input, s = this.ship;

    // Steering: analog vector sets heading; magnitude sets thrust.
    const mag = Math.hypot(inp.mx, inp.my);
    let thrust = 0;
    if (mag > 0.08) {
      const target = Math.atan2(inp.my, inp.mx);
      // shortest-arc turn toward target
      let d = target - s.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      s.angle += d * Math.min(1, dt * 8);
      thrust = mag;
    }
    const boost = inp.actionDown ? 1.8 : 1;
    const accel = 720 * thrust * boost;
    s.vx += Math.cos(s.angle) * accel * dt;
    s.vy += Math.sin(s.angle) * accel * dt;

    // Damping + clamp
    const damp = Math.pow(0.12, dt);
    s.vx *= damp; s.vy *= damp;
    const sp = Math.hypot(s.vx, s.vy);
    const maxS = this.maxSpeed * boost;
    if (sp > maxS) { s.vx = s.vx / sp * maxS; s.vy = s.vy / sp * maxS; }
    s.x += s.vx * dt; s.y += s.vy * dt;

    // Camera lag
    this.cam.x += (s.x - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (s.y - this.cam.y) * Math.min(1, dt * 6);

    // Nearest planet + landing prompt
    let near = null, nd = 1e9;
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i];
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < nd) { nd = d; near = p; }
    }
    this.near = near; this.nearDist = nd;

    g.setActionLabel('BOOST');
    if (near && nd < near.r + 90) {
      const p = near;
      g.setContext('LAND · ' + p.name, function () {
        g.setScene(new global.PlanetScene(g, p, p.seed));
      });
    } else if (this.g.save.fuel > 0) {
      const self = this;
      g.setContext('WARP ⚡', function () { self._warp(); });
    } else {
      g.setContext('WARP (no fuel)', function () { g.toast('Need a Warp Cell — mine & craft fuel'); });
    }
  };

  SpaceScene.prototype._warp = function () {
    const g = this.g;
    if (g.save.fuel <= 0) return;
    g.save.fuel--;
    g.save.systemsVisited++;
    g.save.systemSeed = (g.save.systemSeed * 1664525 + 1013904223) >>> 0;
    g.persist();
    g.toast('Hyperjump → new system');
    g.setScene(new SpaceScene(g));
  };

  SpaceScene.prototype.render = function (ctx) {
    const g = this.g, W = g.W, H = g.H, cam = this.cam;
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, W, H);
    drawStarfield(ctx, cam, W, H);

    const ox = W / 2 - cam.x, oy = H / 2 - cam.y;

    // Sun glow at origin
    drawSun(ctx, ox, oy);

    // Planets (cull offscreen)
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i];
      const sx = p.x + ox, sy = p.y + oy;
      if (sx < -p.r - 60 || sx > W + p.r + 60 || sy < -p.r - 60 || sy > H + p.r + 60) continue;
      ctx.drawImage(p.sprite, sx - p.r - 8, sy - p.r - 8);
      if (p === this.near && this.nearDist < p.r + 90) {
        ctx.strokeStyle = 'rgba(120,220,255,0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(sx, sy, p.r + 30, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Ship
    const ss = this.ship;
    drawShip(ctx, ss.x + ox, ss.y + oy, ss.angle, g.input.actionDown);

    // Offscreen pointer to nearest planet
    if (this.near) {
      const sx = this.near.x + ox, sy = this.near.y + oy;
      if (sx < 0 || sx > W || sy < 0 || sy > H) drawEdgePointer(ctx, W, H, sx, sy, this.near.biome.orb);
    }

    drawSpaceHUD(ctx, this);
  };

  // ---------- Drawing helpers ----------
  function makePlanetSprite(biome, r, seed) {
    const size = (r + 8) * 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    const cx = size / 2, cy = size / 2;
    // base sphere
    const grad = c.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.2, cx, cy, r);
    grad.addColorStop(0, biome.bands[3]);
    grad.addColorStop(0.6, biome.bands[2]);
    grad.addColorStop(1, biome.bands[0]);
    c.fillStyle = grad;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    // surface mottling
    c.save();
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
    const rng = RNG.mulberry32(seed);
    for (let i = 0; i < r * 1.2; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      c.fillStyle = biome.bands[1 + ((rng() * 3) | 0)];
      c.globalAlpha = 0.25 + rng() * 0.3;
      const s = 4 + rng() * (r * 0.18);
      c.beginPath(); c.arc(px, py, s, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    // atmosphere
    c.globalAlpha = 1;
    const atm = c.createRadialGradient(cx, cy, r * 0.85, cx, cy, r + 7);
    atm.addColorStop(0, 'rgba(0,0,0,0)');
    atm.addColorStop(0.7, hexA(biome.orb, 0.18));
    atm.addColorStop(1, hexA(biome.orb, 0));
    c.fillStyle = atm;
    c.beginPath(); c.arc(cx, cy, r + 7, 0, Math.PI * 2); c.fill();
    return cv;
  }

  function drawSun(ctx, x, y) {
    const grad = ctx.createRadialGradient(x, y, 20, x, y, 260);
    grad.addColorStop(0, 'rgba(255,240,200,0.9)');
    grad.addColorStop(0.25, 'rgba(255,180,90,0.5)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, 260, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3c8';
    ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
  }

  function drawShip(ctx, x, y, ang, boosting) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    if (boosting) {
      ctx.fillStyle = 'rgba(120,200,255,0.8)';
      ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-26 - Math.random() * 8, 0); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#dfe9f5';
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -9); ctx.lineTo(-5, 0); ctx.lineTo(-10, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5fb6ff';
    ctx.beginPath(); ctx.arc(2, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  let starCache = null, starCamX = 0, starCamY = 0;
  function drawStarfield(ctx, cam, W, H) {
    // 3 parallax layers via hashed grid cells (infinite, cheap).
    const layers = [[0.2, 160, 0.5, '#6f86b0'], [0.45, 110, 0.8, '#9fb6e0'], [0.8, 80, 1.2, '#ffffff']];
    for (let li = 0; li < layers.length; li++) {
      const [par, cell, size, col] = layers[li];
      ctx.fillStyle = col;
      const offX = cam.x * par, offY = cam.y * par;
      const startCol = Math.floor((offX - W) / cell);
      const endCol = Math.floor((offX + W) / cell);
      const startRow = Math.floor((offY - H) / cell);
      const endRow = Math.floor((offY + H) / cell);
      for (let cx = startCol; cx <= endCol; cx++) {
        for (let cy = startRow; cy <= endRow; cy++) {
          const h = RNG.hash2(cx, cy, 7 + li * 31);
          if (h < 0.55) continue;
          const px = cx * cell + RNG.hash2(cx, cy, 11) * cell - offX + W / 2;
          const py = cy * cell + RNG.hash2(cx, cy, 13) * cell - offY + H / 2;
          ctx.globalAlpha = 0.4 + h * 0.6;
          ctx.fillRect(px, py, size, size);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawEdgePointer(ctx, W, H, tx, ty, color) {
    const cx = W / 2, cy = H / 2;
    const dx = tx - cx, dy = ty - cy;
    const m = 56;
    const ang = Math.atan2(dy, dx);
    // Project the direction onto the screen-margin rectangle.
    const scale = Math.min((W / 2 - m) / Math.max(1, Math.abs(dx)), (H / 2 - m) / Math.max(1, Math.abs(dy)));
    const px = cx + dx * scale, py = cy + dy * scale;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawSpaceHUD(ctx, scene) {
    const g = scene.g, W = g.W;
    ctx.save();
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aecbff';
    ctx.fillText('★ ' + scene.name, 14, 14);
    ctx.fillStyle = '#7f93b8';
    ctx.font = '12px system-ui, sans-serif';
    if (scene.near) {
      const km = (scene.nearDist / 10) | 0;
      ctx.fillText('Nearest: ' + scene.near.name + ' (' + scene.near.biome.name + ')  ' + km + ' km', 14, 34);
    }
    // Fuel pips
    const fx = 14, fy = 54;
    ctx.fillStyle = '#7f93b8';
    ctx.fillText('Fuel', fx, fy);
    for (let i = 0; i < g.save.maxFuel; i++) {
      ctx.fillStyle = i < g.save.fuel ? '#5fd6c8' : 'rgba(255,255,255,0.15)';
      global.roundRect(ctx, fx + 34 + i * 16, fy, 12, 12, 3); ctx.fill();
    }
    ctx.restore();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  global.hexA = hexA;

  global.SpaceScene = SpaceScene;
})(window);
