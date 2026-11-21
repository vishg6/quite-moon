/*
 * Cycle — applies the saved Light/Dark choice before the page paints, so there
 * is no flash of the wrong theme. Only the theme name is kept here.
 * Author: Vishal Gangaram
 */
(function () {
  try {
    var t = localStorage.getItem('cycle.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable: follow the system theme */ }
})();
