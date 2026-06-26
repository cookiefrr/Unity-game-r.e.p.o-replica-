/* ============================================================
 * planet.js — On-foot planet exploration. Procedural chunked
 * terrain (cached canvases), resource mining, creature scanning,
 * life-support survival loop, return-to-ship takeoff.
 * ============================================================ */
(function (global) {
  'use strict';

  const C = global.Content, RNG = global.RNG;

  const T = 40;            // tile size px
  const CT = 8;            // tiles per chunk
  const CP = T * CT;       // chunk size px
  const REACH = T * 1.3;   // interaction radius

  function PlanetScene(game, planet, seed) {
    this.g = game;
    this.planet = planet;
    this.seed = seed >>> 0;
    this.biome = planet.biome;
    this.rng = RNG.mulberry32(this.seed);

    this.chunks = new Map();          // "cx,cy" -> chunk
    this.harvested = new Set();       // permanently mined node keys

    this.player = { x: 0, y: 0, vx: 0, vy: 0 };
    this.ship = { x: 0, y: 0 };       // landing site / takeoff point
    this.cam = { x: 0, y: 0 };

    this.life = 100; this.maxLife = 100;
    this.hazard = 3 + (this.biome.id === 'toxic' || this.biome.id === 'scorch' || this.biome.id === 'frozen' ? 4 : 0);

    this.target = null;               // current interactable
    this.progress = 0;

    // First-visit discovery.
    const key = planet.seed + '';
    if (game.save.discoveredPlanets.indexOf(key) === -1) {
      game.save.discoveredPlanets.push(key);
      game.persist();
      game.toast('Discovered planet ' + planet.name);
    }
  }

  PlanetScene.prototype.onResize = function () {};

  // ---------- Chunk generation ----------
  PlanetScene.prototype._chunkKey = function (cx, cy) { return cx + ',' + cy; };

  PlanetScene.prototype._terrainBand = function (wx, wy) {
    const n = RNG.fbm(wx / (CP * 1.3), wy / (CP * 1.3), this.seed, 4);
    const bands = this.biome.bands;
    let idx = (n * bands.length) | 0;
    if (idx >= bands.length) idx = bands.length - 1;
    return idx;
  };

  PlanetScene.prototype._genChunk = function (cx, cy) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = CP;
    const c = cv.getContext('2d');
    const bands = this.biome.bands;
    for (let ty = 0; ty < CT; ty++) {
      for (let tx = 0; tx < CT; tx++) {
        const wx = (cx * CT + tx) * T, wy = (cy * CT + ty) * T;
        const idx = this._terrainBand(wx + T / 2, wy + T / 2);
        c.fillStyle = bands[idx];
        c.fillRect(tx * T, ty * T, T + 1, T + 1);
        // subtle per-tile speckle for texture
        const h = RNG.hash2(cx * CT + tx, cy * CT + ty, this.seed);
        if (h > 0.82) {
          c.fillStyle = 'rgba(255,255,255,0.05)';
          c.fillRect(tx * T + (h * T) % T, ty * T + (h * 7 % T), 3, 3);
        }
      }
    }

    // Entities deterministic per chunk.
    const rng = RNG.mulberry32((this.seed ^ Math.imul(cx + 1013, 0x1b873593) ^ Math.imul(cy + 911, 0x85ebca6b)) >>> 0);
    const nodes = [], plants = [], creatures = [];
    const nNodes = (rng() * 4) | 0;
    for (let i = 0; i < nNodes; i++) {
      const px = (cx * CT + rng() * CT) * T, py = (cy * CT + rng() * CT) * T;
      // avoid water band (0) for nodes
      if (this._terrainBand(px, py) === 0) continue;
      const k = cx + ',' + cy + ',' + i;
      if (this.harvested.has(k)) continue;
      const type = this.biome.res[(rng() * this.biome.res.length) | 0];
      nodes.push({ key: k, x: px, y: py, type: type, amount: 8 + ((rng() * 18) | 0), shape: rng() });
    }
    const nPlants = (rng() * 6) | 0;
    for (let i = 0; i < nPlants; i++) {
      const px = (cx * CT + rng() * CT) * T, py = (cy * CT + rng() * CT) * T;
      if (this._terrainBand(px, py) <= 1) continue;
      plants.push({ x: px, y: py, s: 0.6 + rng() * 0.9, t: rng() });
    }
    if (rng() > 0.55) {
      const px = (cx * CT + rng() * CT) * T, py = (cy * CT + rng() * CT) * T;
      creatures.push({
        id: 'c' + cx + '_' + cy, x: px, y: py,
        dir: rng() * Math.PI * 2, t: 0, scanned: false,
        name: C.creatureName(rng), col: this.biome.bands[3], size: 9 + rng() * 8,
      });
    }
    return { cv: cv, nodes: nodes, plants: plants, creatures: creatures };
  };

  PlanetScene.prototype._ensureChunk = function (cx, cy) {
    const k = this._chunkKey(cx, cy);
    let ch = this.chunks.get(k);
    if (!ch) { ch = this._genChunk(cx, cy); this.chunks.set(k, ch); }
    return ch;
  };

  // ---------- Update ----------
  PlanetScene.prototype.update = function (dt) {
    const g = this.g, inp = g.input, p = this.player;

    // Movement
    const sp = 200;
    p.vx = inp.mx * sp; p.vy = inp.my * sp;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.facing = (Math.abs(p.vx) + Math.abs(p.vy) > 5) ? Math.atan2(p.vy, p.vx) : (p.facing || 0);

    this.cam.x += (p.x - this.cam.x) * Math.min(1, dt * 8);
    this.cam.y += (p.y - this.cam.y) * Math.min(1, dt * 8);

    // Load chunks around player, unload far.
    const pcx = Math.floor(p.x / CP), pcy = Math.floor(p.y / CP);
    const R = 2;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) this._ensureChunk(pcx + dx, pcy + dy);
    for (const key of this.chunks.keys()) {
      const parts = key.split(','), kx = +parts[0], ky = +parts[1];
      if (Math.abs(kx - pcx) > R + 1 || Math.abs(ky - pcy) > R + 1) this.chunks.delete(key);
    }

    // Creatures wander (loaded chunks only).
    for (const ch of this.chunks.values()) {
      for (let i = 0; i < ch.creatures.length; i++) {
        const cr = ch.creatures[i];
        cr.t -= dt;
        if (cr.t <= 0) { cr.dir = Math.random() * Math.PI * 2; cr.t = 1 + Math.random() * 2; }
        cr.x += Math.cos(cr.dir) * 40 * dt;
        cr.y += Math.sin(cr.dir) * 40 * dt;
      }
    }

    // Find nearest interactable.
    this.target = null;
    let best = REACH * REACH;
    for (const ch of this.chunks.values()) {
      for (let i = 0; i < ch.nodes.length; i++) {
        const n = ch.nodes[i];
        const d = (n.x - p.x) * (n.x - p.x) + (n.y - p.y) * (n.y - p.y);
        if (d < best) { best = d; this.target = { kind: 'node', ref: n, chunk: ch }; }
      }
      for (let i = 0; i < ch.creatures.length; i++) {
        const cr = ch.creatures[i];
        if (cr.scanned) continue;
        const d = (cr.x - p.x) * (cr.x - p.x) + (cr.y - p.y) * (cr.y - p.y);
        if (d < best) { best = d; this.target = { kind: 'creature', ref: cr, chunk: ch }; }
      }
    }

    // Interaction (hold action).
    if (this.target && inp.actionDown) {
      this.progress += dt / (this.target.kind === 'node' ? 1.1 : 1.4);
      if (this.progress >= 1) {
        this.progress = 0;
        if (this.target.kind === 'node') {
          const n = this.target.ref;
          g.addItem(n.type, n.amount);
          this.harvested.add(n.key);
          const arr = this.target.chunk.nodes;
          arr.splice(arr.indexOf(n), 1);
          g.persist();
          g.toast('+' + n.amount + ' ' + C.RESOURCES[n.type].name);
        } else {
          const cr = this.target.ref;
          cr.scanned = true;
          g.save.species++;
          g.persist();
          g.toast('Scanned: ' + cr.name);
        }
        this.target = null;
      }
    } else {
      this.progress = 0;
    }

    // Action button label.
    if (this.target) g.setActionLabel(this.target.kind === 'node' ? 'MINE' : 'SCAN');
    else g.setActionLabel('');

    // Life support survival loop.
    const dShip = Math.hypot(this.ship.x - p.x, this.ship.y - p.y);
    if (dShip < T * 2) {
      this.life = Math.min(this.maxLife, this.life + 40 * dt);
      g.save.health = Math.min(100, g.save.health + 12 * dt);
    } else {
      this.life -= this.hazard * dt;
    }
    if (this.life <= 0) {
      this.life = 0;
      g.save.health -= 9 * dt;
      if (g.save.health <= 0) {
        g.save.health = 30; this.life = this.maxLife;
        p.x = this.ship.x; p.y = this.ship.y;
        g.persist();
        g.toast('Life support failure — auto-recall to ship');
      }
    }

    // Takeoff prompt near ship.
    if (dShip < T * 2.2) {
      const self = this;
      g.setContext('TAKE OFF', function () {
        g.save.health = Math.min(100, g.save.health + 20);
        g.persist();
        g.setScene(new global.SpaceScene(g, self.planet.id));
      });
    } else {
      g.clearContext();
    }
  };

  // ---------- Render ----------
  PlanetScene.prototype.render = function (ctx) {
    const g = this.g, W = g.W, H = g.H, cam = this.cam;
    const ox = W / 2 - cam.x, oy = H / 2 - cam.y;

    ctx.fillStyle = this.biome.bands[0];
    ctx.fillRect(0, 0, W, H);

    // Terrain chunks (culled).
    for (const [key, ch] of this.chunks) {
      const parts = key.split(','), kx = +parts[0], ky = +parts[1];
      const sx = kx * CP + ox, sy = ky * CP + oy;
      if (sx > W || sy > H || sx + CP < 0 || sy + CP < 0) continue;
      ctx.drawImage(ch.cv, sx, sy);
    }

    // Plants, nodes, creatures (only loaded/visible chunks).
    for (const ch of this.chunks.values()) {
      for (let i = 0; i < ch.plants.length; i++) drawPlant(ctx, ch.plants[i], ox, oy, this.biome);
      for (let i = 0; i < ch.nodes.length; i++) drawNode(ctx, ch.nodes[i], ox, oy);
      for (let i = 0; i < ch.creatures.length; i++) drawCreature(ctx, ch.creatures[i], ox, oy);
    }

    // Ship / landing pad
    drawPad(ctx, this.ship.x + ox, this.ship.y + oy);

    // Player
    drawExplorer(ctx, this.player.x + ox, this.player.y + oy, this.player.facing || 0);

    // Highlight + progress on target
    if (this.target) {
      const t = this.target.ref;
      const tx = t.x + ox, ty = t.y + oy;
      ctx.strokeStyle = 'rgba(150,230,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx, ty, REACH * 0.7, 0, Math.PI * 2); ctx.stroke();
      if (this.progress > 0) {
        ctx.strokeStyle = '#5fd6c8'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(tx, ty, REACH * 0.7, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2); ctx.stroke();
      }
    }

    drawPlanetHUD(ctx, this);
    drawMinimap(ctx, this);
  };

  // ---------- Entity drawing ----------
  function drawExplorer(ctx, x, y, facing) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 8, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8eef7';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a6bd6';
    ctx.beginPath(); ctx.arc(Math.cos(facing) * 4, Math.sin(facing) * 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPad(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(120,220,255,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#cdd9e8';
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(14, 12); ctx.lineTo(0, 6); ctx.lineTo(-14, 12); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawNode(ctx, n, ox, oy) {
    const x = n.x + ox, y = n.y + oy;
    const col = C.RESOURCES[n.type].color;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 7, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    const s = 10 + n.shape * 6;
    ctx.beginPath();
    ctx.moveTo(-s, 4); ctx.lineTo(-s * 0.5, -s); ctx.lineTo(s * 0.4, -s * 0.7);
    ctx.lineTo(s, 2); ctx.lineTo(s * 0.3, s * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(-s * 0.5, -s); ctx.lineTo(s * 0.4, -s * 0.7); ctx.lineTo(-s * 0.1, -s * 0.2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawPlant(ctx, pl, ox, oy, biome) {
    const x = pl.x + ox, y = pl.y + oy;
    ctx.save(); ctx.translate(x, y); ctx.scale(pl.s, pl.s);
    ctx.strokeStyle = biome.bands[2]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -8); ctx.stroke();
    ctx.fillStyle = biome.orb;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(0, -10, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCreature(ctx, cr, ox, oy) {
    const x = cr.x + ox, y = cr.y + oy;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, cr.size * 0.6, cr.size, cr.size * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cr.col;
    ctx.beginPath(); ctx.ellipse(0, 0, cr.size, cr.size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10131a';
    ctx.beginPath(); ctx.arc(cr.size * 0.4, -cr.size * 0.2, 2, 0, Math.PI * 2); ctx.fill();
    if (!cr.scanned) {
      ctx.strokeStyle = 'rgba(255,210,90,0.7)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(0, 0, cr.size + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ---------- HUD ----------
  function bar(ctx, x, y, w, h, frac, col, bg) {
    ctx.fillStyle = bg || 'rgba(255,255,255,0.12)';
    global.roundRect(ctx, x, y, w, h, 4); ctx.fill();
    ctx.fillStyle = col;
    global.roundRect(ctx, x, y, Math.max(0, w * frac), h, 4); ctx.fill();
  }

  function drawPlanetHUD(ctx, scene) {
    const g = scene.g;
    ctx.save();
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = '#e6f0ff';
    ctx.fillText(scene.planet.name, 14, 14);
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#9fb6d6';
    ctx.fillText(scene.biome.name + ' · hazard ' + (scene.hazard > 4 ? 'high' : 'mild'), 14, 33);

    ctx.fillStyle = '#9fb6d6'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('LIFE', 14, 50);
    bar(ctx, 44, 49, 120, 10, scene.life / scene.maxLife, '#5fd6c8');
    ctx.fillStyle = '#9fb6d6';
    ctx.fillText('HP', 14, 66);
    bar(ctx, 44, 65, 120, 10, g.save.health / 100, '#e0653f');
    ctx.restore();
  }

  function drawMinimap(ctx, scene) {
    const g = scene.g, W = g.W;
    const S = 96, pad = 14, x0 = W - S - pad, y0 = 14;
    const scale = 0.06;
    ctx.save();
    ctx.fillStyle = 'rgba(6,12,22,0.7)';
    global.roundRect(ctx, x0, y0, S, S, 8); ctx.fill();
    ctx.beginPath(); global.roundRect(ctx, x0, y0, S, S, 8); ctx.clip();
    const cx = x0 + S / 2, cy = y0 + S / 2, px = scene.player.x, py = scene.player.y;
    // ship
    ctx.fillStyle = '#7adcff';
    ctx.fillRect(cx + (scene.ship.x - px) * scale - 2, cy + (scene.ship.y - py) * scale - 2, 4, 4);
    // nodes & creatures
    for (const ch of scene.chunks.values()) {
      for (let i = 0; i < ch.nodes.length; i++) {
        const n = ch.nodes[i];
        ctx.fillStyle = C.RESOURCES[n.type].color;
        ctx.fillRect(cx + (n.x - px) * scale - 1, cy + (n.y - py) * scale - 1, 3, 3);
      }
      for (let i = 0; i < ch.creatures.length; i++) {
        const cr = ch.creatures[i];
        ctx.fillStyle = cr.scanned ? '#6a7' : '#ffd24a';
        ctx.fillRect(cx + (cr.x - px) * scale - 1, cy + (cr.y - py) * scale - 1, 2, 2);
      }
    }
    // player
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  global.PlanetScene = PlanetScene;
})(window);
