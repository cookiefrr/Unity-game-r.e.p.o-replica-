/* ============================================================
 * game.js — Core: canvas setup, fixed-timestep-ish loop,
 * scene management, save/load, shared HUD + inventory panel.
 * ============================================================ */
(function (global) {
  'use strict';

  const SAVE_KEY = 'stellar_drift_save_v1';

  function Game() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.input = new global.Input(this.canvas);
    this.scene = null;
    this.last = 0;
    this.W = 0; this.H = 0; this.dpr = 1;

    this._ctxBtnLabel = null;
    this._toast = null; this._toastT = 0;

    this._initSave();
    this._initHUD();
    this._resize();
    window.addEventListener('resize', this._resize.bind(this));
    window.addEventListener('orientationchange', this._resize.bind(this));
  }

  // ---------- Save data ----------
  Game.prototype._initSave = function () {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
    if (!s || !s.systemSeed) {
      s = {
        systemSeed: (Math.random() * 0xffffffff) >>> 0,
        fuel: 2, maxFuel: 4,            // warp cells
        inventory: {},
        health: 100,
        discoveredPlanets: [],
        species: 0,
        systemsVisited: 1,
      };
    }
    this.save = s;
  };

  Game.prototype.persist = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) {}
  };

  Game.prototype.addItem = function (id, n) {
    this.save.inventory[id] = (this.save.inventory[id] || 0) + n;
  };
  Game.prototype.itemCount = function (id) { return this.save.inventory[id] || 0; };

  // ---------- Display ----------
  Game.prototype._resize = function () {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR for perf
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.scene && this.scene.onResize) this.scene.onResize();
  };

  // ---------- HUD / DOM controls ----------
  Game.prototype._initHUD = function () {
    const self = this;
    this.btnAction = document.getElementById('btnAction');
    this.btnContext = document.getElementById('btnContext');
    this.btnBag = document.getElementById('btnBag');
    this.panel = document.getElementById('panel');

    // Primary action: hold to mine / scan.
    const press = function (e) { self.input.setAction(true); e.preventDefault(); };
    const release = function (e) { self.input.setAction(false); e.preventDefault(); };
    this.btnAction.addEventListener('touchstart', press, { passive: false });
    this.btnAction.addEventListener('touchend', release, { passive: false });
    this.btnAction.addEventListener('mousedown', press);
    this.btnAction.addEventListener('mouseup', release);
    this.btnAction.addEventListener('mouseleave', release);

    this.btnContext.addEventListener('click', function () {
      if (self._ctxCb) self._ctxCb();
    });

    this.btnBag.addEventListener('click', function () { self.togglePanel(); });
    document.getElementById('panelClose').addEventListener('click', function () { self.togglePanel(false); });
    document.getElementById('btnCraft').addEventListener('click', function () { self.craftWarp(); });
  };

  // Context button shown only when an interaction is available.
  Game.prototype.setContext = function (label, cb) {
    this._ctxCb = cb;
    if (this._ctxBtnLabel !== label) {
      this._ctxBtnLabel = label;
      this.btnContext.textContent = label;
      this.btnContext.style.display = 'block';
    }
  };
  Game.prototype.clearContext = function () {
    if (this._ctxBtnLabel !== null) {
      this._ctxBtnLabel = null;
      this.btnContext.style.display = 'none';
      this._ctxCb = null;
    }
  };

  Game.prototype.setActionLabel = function (label) {
    if (this._actLbl !== label) { this._actLbl = label; this.btnAction.textContent = label; }
    this.btnAction.style.display = label ? 'block' : 'none';
  };

  Game.prototype.togglePanel = function (force) {
    const open = force === undefined ? this.panel.style.display !== 'flex' : force;
    this.panel.style.display = open ? 'flex' : 'none';
    if (open) this.refreshPanel();
  };

  Game.prototype.refreshPanel = function () {
    const C = global.Content;
    const list = document.getElementById('invList');
    let html = '';
    for (const id in C.RESOURCES) {
      const r = C.RESOURCES[id];
      const n = this.itemCount(id);
      html += '<div class="invRow"><span class="dot" style="background:' + r.color + '"></span>' +
        '<span class="iname">' + r.name + (r.fuel ? ' ⛽' : '') + '</span>' +
        '<span class="iqty">' + n + '</span></div>';
    }
    list.innerHTML = html;
    // Recipe readiness
    const rec = C.WARP_RECIPE;
    let ready = true, recTxt = '';
    for (const id in rec) {
      const have = this.itemCount(id), need = rec[id];
      if (have < need) ready = false;
      recTxt += C.RESOURCES[id].name + ' ' + have + '/' + need + '   ';
    }
    document.getElementById('recipe').textContent = recTxt;
    const cb = document.getElementById('btnCraft');
    cb.disabled = !ready || this.save.fuel >= this.save.maxFuel;
    document.getElementById('fuelStat').textContent =
      'Warp Cells: ' + this.save.fuel + ' / ' + this.save.maxFuel;
    document.getElementById('discStat').textContent =
      'Planets ' + this.save.discoveredPlanets.length + '  ·  Species ' + this.save.species +
      '  ·  Systems ' + this.save.systemsVisited;
  };

  Game.prototype.craftWarp = function () {
    const rec = global.Content.WARP_RECIPE;
    for (const id in rec) if (this.itemCount(id) < rec[id]) return;
    if (this.save.fuel >= this.save.maxFuel) return;
    for (const id in rec) this.addItem(id, -rec[id]);
    this.save.fuel++;
    this.persist();
    this.refreshPanel();
    this.toast('Warp Cell crafted (+1 fuel)');
  };

  Game.prototype.toast = function (msg) { this._toast = msg; this._toastT = 2.6; };

  // ---------- Scenes ----------
  Game.prototype.setScene = function (scene) {
    this.scene = scene;
    if (scene.onResize) scene.onResize();
  };

  Game.prototype.start = function () {
    this.setScene(new global.SpaceScene(this));
    this.last = performance.now();
    requestAnimationFrame(this._frame.bind(this));
  };

  Game.prototype._frame = function (now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05; // clamp big stalls

    this.input.update();
    if (this.scene) {
      this.scene.update(dt);
      this.scene.render(this.ctx);
    }
    this._drawToast(this.ctx);

    requestAnimationFrame(this._frame.bind(this));
  };

  Game.prototype._drawToast = function (ctx) {
    if (this._toastT > 0) {
      this._toastT -= 1 / 60;
      const a = Math.min(1, this._toastT);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '600 15px system-ui, sans-serif';
      const w = ctx.measureText(this._toast).width + 28;
      const x = this.W / 2 - w / 2, y = this.H * 0.16;
      ctx.fillStyle = 'rgba(8,14,26,0.9)';
      roundRect(ctx, x, y, w, 34, 8); ctx.fill();
      ctx.fillStyle = '#cfe6ff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this._toast, this.W / 2, y + 17);
      ctx.restore();
    }
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  global.roundRect = roundRect;

  global.Game = Game;
})(window);
