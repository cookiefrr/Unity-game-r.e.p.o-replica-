/* boot.js — wire up intro screen and launch the game. */
(function () {
  'use strict';
  let game = null;

  function launch() {
    document.getElementById('intro').style.display = 'none';
    if (!game) { game = new window.Game(); game.start(); window.game = game; }
  }

  document.getElementById('btnPlay').addEventListener('click', launch);

  document.getElementById('btnReset').addEventListener('click', function () {
    if (!confirm('Wipe your save and generate a brand-new universe?')) return;
    try { localStorage.removeItem('stellar_drift_save_v1'); } catch (e) {}
    location.reload();
  });

  // Prevent pinch-zoom / double-tap zoom on mobile for a native feel.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  let lastTouch = 0;
  document.addEventListener('touchend', function (e) {
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
})();
