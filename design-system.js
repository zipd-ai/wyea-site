/* /design-system only: prints each color token's resolved value under its
   swatch and the current viewport width in the bar, and refreshes both when
   the theme toggle or the window changes. */

(function () {
  "use strict";

  var swatches = [].slice.call(document.querySelectorAll("[data-token]"));
  var width = document.getElementById("ds-width");

  function hex(rgb) {
    var m = rgb.match(/\d+(\.\d+)?/g);
    if (!m) return rgb;
    var out = "#" + m.slice(0, 3).map(function (n) {
      return ("0" + Math.round(Number(n)).toString(16)).slice(-2);
    }).join("");
    return m.length > 3 && Number(m[3]) < 1 ? out + " at " + Math.round(Number(m[3]) * 100) + "%" : out;
  }

  function paint() {
    var probe = document.createElement("i");
    document.body.appendChild(probe);
    swatches.forEach(function (el) {
      probe.style.color = "var(" + el.getAttribute("data-token") + ")";
      el.textContent = hex(getComputedStyle(probe).color);
    });
    probe.remove();
  }

  function measure() {
    if (width) width.textContent = window.innerWidth + "px";
  }

  paint();
  measure();
  document.addEventListener("themechange", paint);
  var scheme = window.matchMedia("(prefers-color-scheme: dark)");
  if (scheme.addEventListener) scheme.addEventListener("change", paint);
  else if (scheme.addListener) scheme.addListener(paint);
  window.addEventListener("resize", measure);
})();
