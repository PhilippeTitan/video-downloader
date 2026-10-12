/* Pull-to-refresh sniffer — Theos twin of expo-app's PULL_JS.
   Injected at document start so the window survives every reload; the
   browser's touch listeners are attached before the page's own scripts.
   Thresholds must stay in sync with expo-app/App.tsx. */
(function () {
  if (window.__vdPull) return;
  window.__vdPull = true;
  var startY = 0;
  var startX = 0;
  var startT = 0;
  var active = false;
  var fired = false;
  function atTop() {
    var y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    return y <= 3;
  }
  function post() {
    var msg = { source: 'vd-browser', type: 'pull-refresh' };
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        return;
      }
    } catch (e) {}
    try {
      window.webkit.messageHandlers.vd.postMessage(msg);
    } catch (e) {}
  }
  document.addEventListener('touchstart', function (e) {
    fired = false;
    if (!atTop()) { active = false; return; }
    active = true;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    startT = Date.now();
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!active || fired) return;
    var dy = e.touches[0].clientY - startY;
    var dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx * 1.2 > dy) return;
    // iOS reports negative scrollY while rubber-banding — real content
    // overscroll is the strongest signal when the page exposes it.
    var over = -(window.scrollY || 0);
    var dt = Date.now() - startT;
    var flick = dy > 28 && dt < 320;
    var far = dy > 50;
    if (flick || far || over > 24) {
      fired = true;
      active = false;
      post();
    }
  }, { passive: true });
  // Re-arm at gesture end: if the UI swallowed the trigger (spinner window),
  // the next pull must still work instead of latching dead until a reload.
  document.addEventListener('touchend', function () { active = false; fired = false; }, { passive: true });
  document.addEventListener('touchcancel', function () { active = false; fired = false; }, { passive: true });
})();
