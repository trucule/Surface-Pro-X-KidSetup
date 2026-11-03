// Kid stars: adds up the stars she has earned in every app and tells the home screen.
// All of her offline apps are local files, which share one browser storage, so any app can read every app's saved
// progress. The total goes to the home screen's small local service (KidHome, http://127.0.0.1:47821), which shows it
// next to her avatar. Put into every app by tools/apply-kid-stars.py; edit this file and run that tool again.
(function () {
  if (window.KID_STARS) return;
  var PORT = 47821, BASE = 'http://127.0.0.1:' + PORT;
  // What counts as stars in an app's saved data:
  //   an object with a number "stars"                     (most games: their progress object)
  //   an object of objects with a number "stars" each      (Level Up: one per subject)
  //   a number saved under a key ending in "-stars"        (Story Maker)
  //   a list saved under a key starting with "lab-done-"   (Chemistry Lab, Kitchen Lab: one star per experiment)
  function starsIn(key, raw) {
    var v; try { v = JSON.parse(raw); } catch (e) { return 0; }
    var n = function (x) { return typeof x === 'number' && isFinite(x) && x > 0 ? Math.floor(x) : 0; };
    if (/^lab-done-/.test(key)) return Array.isArray(v) ? v.length : 0;
    if (/-stars$/.test(key)) return n(v);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 0;
    if (typeof v.stars === 'number') return n(v.stars);
    var sum = 0;
    for (var k in v) if (v[k] && typeof v[k] === 'object' && typeof v[k].stars === 'number') sum += n(v[k].stars);
    return sum;
  }
  function earned() {
    var total = 0, per = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (!k || /^kid-avatar/.test(k)) continue;
        var s = starsIn(k, localStorage.getItem(k)); if (s) { per[k] = s; total += s; }
      }
    } catch (e) {}
    return { total: total, per: per };
  }
  var last = -1, timer = null;
  function report(force) {
    var e = earned();
    if (!force && e.total === last) return Promise.resolve(e.total);
    last = e.total;
    // A plain text body keeps this a simple request (no preflight). A home screen that is not listening is fine.
    try {
      return fetch(BASE + '/stars', { method: 'POST', body: JSON.stringify({ earned: e.total }) })
        .then(function () { return e.total; }, function () { return e.total; });
    } catch (err) { return Promise.resolve(e.total); }
  }
  // Report after any save, a moment later so a burst of saves sends one report.
  try {
    var set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      set.apply(this, arguments);
      if (this === window.localStorage && !/^kid-avatar/.test(String(k))) { clearTimeout(timer); timer = setTimeout(report, 800); }
    };
  } catch (e) {}
  window.KID_STARS = { earned: function () { return earned().total; }, breakdown: function () { return earned().per; }, report: report, starsIn: starsIn, base: BASE };
  setTimeout(function () { report(true); }, 1500);
})();
