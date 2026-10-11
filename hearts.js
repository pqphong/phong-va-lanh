(function () {
  "use strict";

  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const layer = document.createElement("div");
  layer.id = "floating-hearts";
  layer.className = "floating-hearts";
  layer.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 44; index++) {
    const heart = document.createElement("span");
    const lane = index % 3;
    const x = lane === 0 ? 2 + index * 5 % 11 : lane === 1 ? 88 + index * 5 % 11 : 16 + index * 17 % 68;
    const duration = 18 + index * 7 % 15;
    heart.className = "floating-heart";
    heart.style.setProperty("--heart-x", `${x}%`);
    heart.style.setProperty("--heart-size", `${14 + index * 3 % 19}px`);
    heart.style.setProperty("--heart-duration", `${duration}s`);
    heart.style.setProperty("--heart-delay", `${-(index * 13 % 44) / 44 * duration}s`);
    heart.style.setProperty("--heart-drift", `${(index % 2 ? 1 : -1) * (12 + index % 5 * 4)}px`);
    heart.style.setProperty("--heart-tilt", `${index % 2 ? 14 : -14}deg`);
    heart.style.setProperty("--heart-opacity", lane === 2 ? "0.10" : "0.30");
    heart.style.setProperty("--heart-sway", `${4 + index % 4}s`);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z");
    svg.append(path);
    heart.append(svg);
    layer.append(heart);
  }
  document.body.prepend(layer);

  // app.js owns the motion preference, control and page lifecycle.
  // This layer only renders that state; it never adds another toggle handler.
  function sync() {
    layer.dataset.enabled = String(root.dataset.motion === "on" && !reducedMotion.matches);
    layer.dataset.paused = String(root.dataset.motionPaused === "true" || document.hidden);
  }
  new MutationObserver(sync).observe(root, {
    attributes: true, attributeFilter: ["data-motion", "data-motion-paused"],
  });
  reducedMotion.addEventListener("change", sync);
  sync();
})();
