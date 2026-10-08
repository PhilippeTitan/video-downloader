(function () {
  if (window.__vdSniffer) return;
  window.__vdSniffer = true;

  function post(payload) {
    try {
      window.webkit.messageHandlers.vd.postMessage({ type: 'detect', payload: payload });
    } catch (e) {}
  }

  function kindFor(url) {
    var clean = url.split('?')[0].toLowerCase();
    if (clean.indexOf('.m3u8') !== -1) return 'hls';
    if (clean.indexOf('.mp4') !== -1 || clean.indexOf('.webm') !== -1 || clean.indexOf('.mov') !== -1) return 'video';
    return 'page';
  }

  var seen = Object.create(null);

  function report(url, kind, title) {
    if (!url || seen[url]) return;
    seen[url] = true;
    var payload = { url: url, kind: kind || kindFor(url) };
    if (title) payload.title = title;
    post(payload);
  }

  function collect() {
    var title = document.title;
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var video = videos[i];
      var src = video.currentSrc || video.src;
      if (src) report(src, kindFor(src), title);
      var sources = video.querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        var s = sources[j];
        if (s.src) {
          var t = (s.type || '').toLowerCase();
          report(s.src, t.indexOf('mpegurl') !== -1 ? 'hls' : kindFor(s.src), title);
        }
      }
    }
    try {
      var entries = performance.getEntriesByType('resource');
      for (var k = 0; k < entries.length; k++) {
        var name = entries[k].name;
        var kind = kindFor(name);
        if (kind !== 'page') report(name, kind, title);
      }
    } catch (e) {}
  }

  var timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      collect();
    }, 400);
  }

  try {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (e) {}
  document.addEventListener('play', schedule, true);
  window.addEventListener('load', schedule);
  schedule();
})();
