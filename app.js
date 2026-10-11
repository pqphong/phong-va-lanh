(function () {
  "use strict";

  const { COUPLE, getSnapshot } = window.LoveCounter;
  const root = document.documentElement;
  root.lang = "vi";
  root.dataset.layout = "timeline";
  delete root.dataset.style;
  const byId = (id) => document.getElementById(id);
  const stage = byId("layout-stage");
  const timeline = stage.querySelector(".love-timeline");
  const fields = Object.fromEntries([...stage.querySelectorAll("[id]")].map((element) => [element.id, element]));
  const sceneAnimations = new Map();
  const numbers = new Intl.NumberFormat("vi-VN");
  const dateFormat = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: COUPLE.timeZone,
  });
  const datePartsFormat = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: COUPLE.timeZone,
  });
  const themeMedia = matchMedia("(prefers-color-scheme: dark)");
  const motionMedia = matchMedia("(prefers-reduced-motion: reduce)");
  const forcedColorsMedia = matchMedia("(forced-colors: active)");
  const dialog = byId("share-dialog");
  const shareBackground = document.querySelector(".preview-shell");
  let backgroundWasInert = false;
  let backgroundAriaHidden;
  const canvas = byId("celebration");
  const context = canvas.getContext("2d");
  let timer;
  let celebrationFrame;
  let celebrationReset;
  let savedTheme;
  let savedMotion;
  let revealObserver;
  let revealTargets = [];
  let pageSuspended = false;

  try {
    savedTheme = localStorage.getItem("phong-lanh-layout-theme");
    savedMotion = localStorage.getItem("phong-lanh-motion");
  } catch { /* The page remains usable when browser storage is blocked. */ }
  root.dataset.theme = savedTheme === "dark" ? "dark" : "light";

  function motionEnabled() {
    return savedMotion !== "off" && !motionMedia.matches;
  }

  function animate(element, frames, options = {}) {
    if (!motionEnabled() || document.hidden || pageSuspended || !element.isConnected || typeof element.animate !== "function") return;
    const bounds = element.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= innerHeight) return;
    sceneAnimations.get(element)?.cancel();
    const animation = element.animate(frames, {
      duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards", ...options,
    });
    sceneAnimations.set(element, animation);
    const release = () => {
      if (sceneAnimations.get(element) === animation) sceneAnimations.delete(element);
    };
    animation.onfinish = release;
    animation.oncancel = release;
  }

  function clearSceneMotion() {
    revealObserver?.disconnect();
    revealObserver = undefined;
    for (const animation of sceneAnimations.values()) animation.cancel();
    sceneAnimations.clear();
    for (const element of revealTargets) delete element.dataset.reveal;
    revealTargets = [];
  }

  function reveal(element, delay = 0) {
    if (element.dataset.reveal === "shown") return;
    element.dataset.reveal = "shown";
    revealObserver?.unobserve(element);
    animate(element, [{ opacity: 0, translate: "0 16px" }, { opacity: 1, translate: "0 0" }], { delay });
  }

  function prepareScene() {
    clearSceneMotion();
    if (!motionEnabled() || typeof Element.prototype.animate !== "function") return;
    revealTargets = [...stage.querySelectorAll(".timeline-portrait > *, .love-timeline > li, .timeline-epilogue")]
      .filter((element) => element.getClientRects().length);
    if (document.hidden || pageSuspended || typeof IntersectionObserver !== "function") {
      for (const element of revealTargets) element.dataset.reveal = "shown";
      return;
    }
    revealObserver = new IntersectionObserver((entries) => {
      let index = 0;
      for (const entry of entries) {
        if (entry.isIntersecting) reveal(entry.target, Math.min(index++ * 65, 260));
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -20px 0px" });
    for (const element of revealTargets) {
      element.dataset.reveal = "waiting";
      revealObserver.observe(element);
    }
  }

  function syncMotionVisibility() {
    const paused = document.hidden || pageSuspended;
    root.dataset.motionPaused = String(paused);
    for (const [element, animation] of sceneAnimations) {
      if (!element.isConnected) animation.cancel();
      else if (paused) animation.pause();
      else if (animation.playState === "paused") animation.play();
    }
  }

  function updateMotion() {
    const enabled = motionEnabled();
    root.dataset.motion = enabled ? "on" : "off";
    window.LovePhotos?.setMotion(enabled);
    byId("motion-pause").hidden = !enabled;
    byId("motion-play").hidden = enabled;
    const button = byId("motion-toggle");
    const label = motionMedia.matches ? "Hiệu ứng đã tắt theo cài đặt giảm chuyển động"
      : enabled ? "Tạm dừng hiệu ứng chuyển động" : "Bật hiệu ứng chuyển động";
    button.disabled = motionMedia.matches;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(enabled));
    button.title = label;
    stopCelebration();
    syncMotionVisibility();
    prepareScene();
  }

  function setText(element, text) {
    if (element.textContent === text) return;
    const wasNumber = /^\d/.test(element.textContent);
    // Commit every value immediately; only the day total gets a change animation.
    element.textContent = text;
    if (wasNumber && element.id === "total-days") {
      animate(element, [{ opacity: 0.65, translate: "0 -3px" }, { opacity: 1, translate: "0 0" }], { duration: 260 });
    }
  }

  function displayDate(iso) {
    return dateFormat.format(new Date(`${iso}T00:00:00+07:00`));
  }

  function update() {
    const now = new Date();
    const snapshot = getSnapshot(now);
    const { years, months, days } = snapshot.duration;
    setText(fields["total-days"], numbers.format(snapshot.totalDays));
    setText(fields["calendar-duration"], `${years} năm · ${months} tháng · ${days} ngày`);
    for (const unit of ["hours", "minutes", "seconds"]) {
      setText(fields[unit], String(snapshot[unit]).padStart(2, "0"));
    }
    setText(fields["monthly-title"], `${numbers.format(snapshot.monthlyAnniversary.months)} tháng bên nhau`);
    setText(fields["monthly-date"], displayDate(snapshot.monthlyAnniversary.date));
    fields["monthly-date"].dateTime = snapshot.monthlyAnniversary.date;
    setText(fields["monthly-countdown"], snapshot.monthlyAnniversary.daysUntil === 0
      ? "Hôm nay!" : `Còn ${numbers.format(snapshot.monthlyAnniversary.daysUntil)} ngày`);
    setText(fields["anniversary-title"], `${snapshot.anniversary.years} năm bên nhau`);
    setText(fields["anniversary-date"], displayDate(snapshot.anniversary.date));
    fields["anniversary-date"].dateTime = snapshot.anniversary.date;
    setText(fields["anniversary-countdown"], snapshot.anniversary.daysUntil === 0
      ? "Hôm nay!" : `Còn ${numbers.format(snapshot.anniversary.daysUntil)} ngày`);
    setText(fields["milestone-title"], `${numbers.format(snapshot.milestone.days)} ngày yêu`);
    setText(fields["milestone-date"], displayDate(snapshot.milestone.date));
    fields["milestone-date"].dateTime = snapshot.milestone.date;
    setText(fields["milestone-countdown"], `Còn ${numbers.format(snapshot.milestone.daysUntil)} ngày`);
    setText(fields["today-date"], dateFormat.format(now));
    const parts = Object.fromEntries(datePartsFormat.formatToParts(now).map((part) => [part.type, part.value]));
    fields["today-date"].dateTime = `${parts.year}-${parts.month}-${parts.day}`;
    const order = [
      { event: "monthly", date: snapshot.monthlyAnniversary.date, priority: 0 },
      { event: "anniversary", date: snapshot.anniversary.date, priority: 1 },
      { event: "milestone", date: snapshot.milestone.date, priority: 2 },
    ].sort((left, right) => left.date.localeCompare(right.date) || left.priority - right.priority)
      .map(({ event }) => event);
    if (timeline.dataset.order !== order.join("-")) {
      for (const event of order) timeline.append(stage.querySelector(`[data-timeline-event="${event}"]`));
      timeline.dataset.order = order.join("-");
    }
  }

  function isDark() {
    return root.dataset.theme === "dark" || (!root.dataset.theme && themeMedia.matches);
  }

  function updateTheme() {
    const dark = isDark();
    byId("theme-moon").hidden = dark;
    byId("theme-sun").hidden = !dark;
    const button = byId("theme-toggle");
    button.disabled = false;
    button.setAttribute("aria-label", dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
    button.setAttribute("aria-pressed", String(dark));
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = getComputedStyle(root).getPropertyValue("--bg").trim();
  }

  function stopCelebration() {
    cancelAnimationFrame(celebrationFrame);
    celebrationFrame = undefined;
    clearTimeout(celebrationReset);
    canvas.hidden = true;
    context?.clearRect(0, 0, canvas.width, canvas.height);
    byId("celebration-status").textContent = "";
    stage.querySelector("[data-love-label]").textContent = "Thả một chút yêu";
  }

  function heartPath(x, y, size) {
    context.beginPath();
    context.moveTo(x, y + size * 0.3);
    context.bezierCurveTo(x - size, y - size * 0.3, x - size * 0.5, y - size, x, y - size * 0.5);
    context.bezierCurveTo(x + size * 0.5, y - size, x + size, y - size * 0.3, x, y + size * 0.3);
    context.fill();
  }

  function celebrate() {
    stopCelebration();
    byId("celebration-status").textContent = "Thêm một chút yêu cho ngày hôm nay ♥";
    stage.querySelector("[data-love-label]").textContent = "Thương thêm một chút ♥";
    celebrationReset = setTimeout(stopCelebration, 2500);
    if (!motionEnabled() || document.hidden || pageSuspended || forcedColorsMedia.matches || !context) return;

    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const palette = getComputedStyle(root);
    const colors = ["--accent", "--secondary"].map((key) => palette.getPropertyValue(key).trim());
    const button = stage.querySelector('[data-action="celebrate"]').getBoundingClientRect();
    const origin = { x: button.left + button.width / 2, y: button.top + button.height / 2 };
    const hearts = Array.from({ length: 24 }, (_, index) => ({
      angle: -Math.PI + index * Math.PI / 23,
      speed: 90 + Math.random() * 160,
      size: 5 + Math.random() * 6,
      color: colors[index % colors.length],
    }));
    const start = performance.now();
    canvas.hidden = false;
    function draw(now) {
      if (!motionEnabled() || document.hidden || pageSuspended || forcedColorsMedia.matches) {
        stopCelebration();
        return;
      }
      const elapsed = (now - start) / 1000;
      context.clearRect(0, 0, innerWidth, innerHeight);
      for (const heart of hearts) {
        context.globalAlpha = Math.max(0, 1 - elapsed / 2);
        context.fillStyle = heart.color;
        heartPath(origin.x + Math.cos(heart.angle) * heart.speed * elapsed,
          origin.y + Math.sin(heart.angle) * heart.speed * elapsed + 50 * elapsed ** 2, heart.size);
      }
      context.globalAlpha = 1;
      if (elapsed < 2) celebrationFrame = requestAnimationFrame(draw);
      else { canvas.hidden = true; celebrationFrame = undefined; }
    }
    celebrationFrame = requestAnimationFrame(draw);
  }

  function openShare() {
    const snapshot = getSnapshot();
    byId("share-message").value = `${COUPLE.firstName} & ${COUPLE.secondName} ♥\nTừ ngày 14/02/2022, chúng mình đã có ${numbers.format(snapshot.totalDays)} ngày bên nhau.\nThật may vì trong những ngày của mình, luôn có người thương.\nHôm nay thương, ngày mai vẫn thương.`;
    byId("copy-status").textContent = "";
    if (dialog.hasAttribute("open")) return;
    try { dialog.showModal(); }
    catch {
      dialog.dataset.fallback = "true";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("open", "");
      backgroundWasInert = shareBackground.hasAttribute("inert");
      backgroundAriaHidden = shareBackground.getAttribute("aria-hidden");
      byId("close-share").focus();
      shareBackground.setAttribute("inert", "");
      shareBackground.setAttribute("aria-hidden", "true");
    }
    animate(dialog, [{ opacity: 0, translate: "0 12px", scale: 0.98 }, { opacity: 1, translate: "0 0", scale: 1 }], { duration: 320 });
  }

  function closeShare() {
    if (dialog.dataset.fallback === "true") {
      dialog.removeAttribute("open");
      dialog.removeAttribute("role");
      dialog.removeAttribute("aria-modal");
      delete dialog.dataset.fallback;
      shareBackground.toggleAttribute("inert", backgroundWasInert);
      if (backgroundAriaHidden === null) shareBackground.removeAttribute("aria-hidden");
      else shareBackground.setAttribute("aria-hidden", backgroundAriaHidden);
    } else dialog.close();
    byId("open-share").focus();
  }

  byId("theme-toggle").addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    stopCelebration();
    updateTheme();
    try { localStorage.setItem("phong-lanh-layout-theme", root.dataset.theme); }
    catch { /* Theme selection remains usable without storage. */ }
  });
  themeMedia.addEventListener("change", updateTheme);
  motionMedia.addEventListener("change", updateMotion);
  forcedColorsMedia.addEventListener("change", stopCelebration);
  byId("motion-toggle").addEventListener("click", () => {
    savedMotion = motionEnabled() ? "off" : "on";
    try { localStorage.setItem("phong-lanh-motion", savedMotion); }
    catch { /* Motion selection remains usable without storage. */ }
    updateMotion();
    byId("motion-status").textContent = motionEnabled() ? "Đã bật hiệu ứng chuyển động."
      : "Đã tạm dừng hiệu ứng. Bộ đếm vẫn cập nhật bình thường.";
  });
  stage.addEventListener("focusin", (event) => {
    // A focused control can sit inside a waiting portrait/photo wrapper.
    const element = event.target.closest('[data-reveal="waiting"]');
    if (element) reveal(element);
  });
  for (const button of stage.querySelectorAll("[data-action]")) button.disabled = false;
  stage.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "celebrate") celebrate();
    if (button.dataset.action === "share") openShare();
  });
  byId("close-share").addEventListener("click", closeShare);
  dialog.addEventListener("keydown", (event) => {
    if (dialog.dataset.fallback !== "true") return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeShare();
    } else if (event.key === "Tab") {
      const controls = [...dialog.querySelectorAll('button:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length);
      const target = event.shiftKey ? controls.at(-1) : controls[0];
      if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
        event.preventDefault();
        target?.focus();
      }
    }
  });
  document.addEventListener("focusin", (event) => {
    if (dialog.dataset.fallback === "true" && !dialog.contains(event.target)) byId("close-share").focus();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeShare();
  });
  byId("copy-message").addEventListener("click", async () => {
    const field = byId("share-message");
    try {
      await navigator.clipboard.writeText(field.value);
      byId("copy-status").textContent = "Đã sao chép. Bạn có thể dán lời nhắn và gửi cho người thương.";
    } catch {
      field.focus();
      field.select();
      byId("copy-status").textContent = "Trình duyệt chưa cho phép sao chép. Lời nhắn đã được chọn; nhấn Ctrl+C / ⌘C hoặc chạm giữ để sao chép.";
    }
  });

  function resumeTimer() {
    clearInterval(timer);
    update();
    if (!document.hidden && !pageSuspended) timer = setInterval(update, 1000);
  }
  document.addEventListener("visibilitychange", () => {
    syncMotionVisibility();
    if (document.hidden) {
      clearInterval(timer);
      stopCelebration();
    } else resumeTimer();
  });
  window.addEventListener("pagehide", () => {
    pageSuspended = true;
    syncMotionVisibility();
    clearInterval(timer);
    stopCelebration();
    clearSceneMotion();
  });
  window.addEventListener("pageshow", (event) => {
    pageSuspended = false;
    root.lang = "vi";
    root.dataset.layout = "timeline";
    syncMotionVisibility();
    resumeTimer();
    if (event.persisted) prepareScene();
  });
  window.addEventListener("resize", stopCelebration);

  updateTheme();
  resumeTimer();
  updateMotion();
})();
