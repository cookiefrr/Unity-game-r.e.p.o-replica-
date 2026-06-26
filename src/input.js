/* ============================================================
 * input.js — Unified input: virtual joystick + action buttons
 * for touch, plus WASD/arrows + Space for desktop.
 * Exposes a normalized move vector (mx,my in [-1,1]) and an
 * "action" edge flag consumed by scenes.
 * ============================================================ */
(function (global) {
  'use strict';

  function Input(canvas) {
    this.mx = 0; this.my = 0;          // analog move vector
    this.actionDown = false;           // action button held
    this.actionPressed = false;        // edge: pressed this frame
    this._actionPrev = false;
    this.keys = Object.create(null);

    // Virtual joystick state
    this.joyActive = false;
    this.joyId = -1;
    this.joyOX = 0; this.joyOY = 0;    // origin (where finger landed)
    this.joyX = 0; this.joyY = 0;      // current finger pos
    this.joyRadius = 70;

    this._bind(canvas);
  }

  Input.prototype._bind = function (canvas) {
    const self = this;

    // ---- Keyboard (desktop) ----
    window.addEventListener('keydown', function (e) {
      self.keys[e.code] = true;
      if (e.code === 'Space') { self.actionDown = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
      if (e.code === 'Space') self.actionDown = false;
    });

    // ---- Touch (mobile) ----
    const opts = { passive: false };
    canvas.addEventListener('touchstart', function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        // Left half of screen drives the joystick.
        if (t.clientX < window.innerWidth * 0.5 && !self.joyActive) {
          self.joyActive = true;
          self.joyId = t.identifier;
          self.joyOX = self.joyX = t.clientX;
          self.joyOY = self.joyY = t.clientY;
        }
      }
      e.preventDefault();
    }, opts);

    canvas.addEventListener('touchmove', function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === self.joyId) {
          self.joyX = t.clientX; self.joyY = t.clientY;
        }
      }
      e.preventDefault();
    }, opts);

    function endTouch(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === self.joyId) {
          self.joyActive = false; self.joyId = -1;
          self.mx = self.my = 0;
        }
      }
      e.preventDefault();
    }
    canvas.addEventListener('touchend', endTouch, opts);
    canvas.addEventListener('touchcancel', endTouch, opts);
  };

  // Called once per frame to resolve analog vector + edges.
  Input.prototype.update = function () {
    // Joystick vector
    if (this.joyActive) {
      let dx = this.joyX - this.joyOX;
      let dy = this.joyY - this.joyOY;
      const len = Math.hypot(dx, dy);
      if (len > this.joyRadius) { dx = dx / len * this.joyRadius; dy = dy / len * this.joyRadius; }
      this.mx = dx / this.joyRadius;
      this.my = dy / this.joyRadius;
    } else {
      // Keyboard fallback
      let kx = 0, ky = 0;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) kx -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) kx += 1;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) ky -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) ky += 1;
      const l = Math.hypot(kx, ky);
      if (l > 0) { kx /= l; ky /= l; }
      this.mx = kx; this.my = ky;
    }

    // Action edge detection
    this.actionPressed = this.actionDown && !this._actionPrev;
    this._actionPrev = this.actionDown;
  };

  // Hook for on-screen action button(s).
  Input.prototype.setAction = function (down) { this.actionDown = down; };

  global.Input = Input;
})(window);
