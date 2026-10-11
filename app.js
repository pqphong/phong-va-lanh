(function () {
  "use strict";

  const { COUPLE, getSnapshot } = window.LoveCounter;
  const root = document.documentElement;
  root.lang = "vi";
  const byId = (id) => document.getElementById(id);
  const numberFormat = new Intl.NumberFormat("vi-VN");
  const dateFormat = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: COUPLE.timeZone,
  });
  const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fields = Object.fromEntries([
    "total-days", "hours", "minutes", "seconds", "calendar-duration",
    "anniversary-title", "anniversary-date", "anniversary-countdown",
    "milestone-title", "milestone-date", "milestone-countdown",
  ].map((id) => [id, byId(id)]));
  let lastDay = -1;
  let timer;
  let celebrationFrame;
  let celebrationTimer;

  function update() {
    const state = getSnapshot();
    for (const field of ["hours", "minutes", "seconds"]) {
      fields[field].textContent = String(state[field]).padStart(2, "0");
    }
    if (lastDay === state.totalDays) return;
    lastDay = state.totalDays;
    fields["total-days"].textContent = numberFormat.format(state.totalDays);
    const { years, months, days } = state.duration;
    fields["calendar-duration"].textContent = `${years} năm, ${months} tháng, ${days} ngày bên nhau`;
    fields["anniversary-title"].textContent = `${state.anniversary.years} năm bên nhau`;
    fields["anniversary-date"].textContent = dateFormat.format(new Date(`${state.anniversary.date}T00:00:00+07:00`));
    fields["anniversary-date"].dateTime = state.anniversary.date;
    fields["anniversary-countdown"].textContent = state.anniversary.daysUntil === 0 ? "Hôm nay!" : `Còn ${state.anniversary.daysUntil} ngày`;
    fields["milestone-title"].textContent = `${numberFormat.format(state.milestone.days)} ngày yêu`;
    fields["milestone-date"].textContent = dateFormat.format(new Date(`${state.milestone.date}T00:00:00+07:00`));
    fields["milestone-date"].dateTime = state.milestone.date;
    fields["milestone-countdown"].textContent = `Còn ${state.milestone.daysUntil} ngày`;
  }

  function colors() {
    const style = getComputedStyle(root);
    return {
      accent: style.getPropertyValue("--accent").trim(),
      line: style.getPropertyValue("--line").trim(),
      ink: style.getPropertyValue("--ink").trim(),
    };
  }

  function heartPath(context, x, y, size) {
    context.beginPath();
    context.moveTo(x, y + size * 0.3);
    context.bezierCurveTo(x - size * 0.65, y - size * 0.35, x - size * 0.8, y + size * 0.45, x, y + size);
    context.bezierCurveTo(x + size * 0.8, y + size * 0.45, x + size * 0.65, y - size * 0.35, x, y + size * 0.3);
  }

  function drawArt() {
    const canvas = byId("heart-art");
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    context.scale(pixelRatio, pixelRatio);
    const palette = colors();
    const scale = width / 440;
    context.scale(scale, height / 246);

    context.lineWidth = 1;
    context.strokeStyle = palette.line;
    context.setLineDash([3, 5]);
    context.beginPath();
    context.ellipse(208, 135, 154, 72, -0.2, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);

    context.save();
    context.translate(230, 17);
    context.rotate(-0.17);
    context.strokeStyle = palette.accent;
    context.lineWidth = 1.5;
    context.globalAlpha = 0.65;
    heartPath(context, 0, 0, 73);
    context.stroke();
    context.restore();

    context.save();
    context.translate(277, 21);
    context.rotate(0.19);
    context.strokeStyle = palette.accent;
    context.lineWidth = 1;
    context.globalAlpha = 0.35;
    heartPath(context, 0, 0, 65);
    context.stroke();
    context.restore();

    for (const [x, y, size] of [[63, 31, 4], [359, 64, 3], [335, 199, 3], [156, 56, 2]]) {
      context.globalAlpha = 0.55;
      context.strokeStyle = palette.accent;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x - size, y);
      context.lineTo(x + size, y);
      context.moveTo(x, y - size);
      context.lineTo(x, y + size);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function isDark() {
    return root.dataset.theme ? root.dataset.theme === "dark" : themeQuery.matches;
  }

  function updateTheme() {
    const dark = isDark();
    byId("theme-sun").hidden = !dark;
    byId("theme-moon").hidden = dark;
    byId("theme-toggle").setAttribute("aria-label", dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
    drawArt();
  }

  try {
    const savedTheme = localStorage.getItem("phong-lanh-theme");
    if (savedTheme === "light" || savedTheme === "dark") root.dataset.theme = savedTheme;
  } catch {}

  byId("theme-toggle").addEventListener("click", () => {
    const nextTheme = isDark() ? "light" : "dark";
    root.dataset.theme = nextTheme;
    try { localStorage.setItem("phong-lanh-theme", nextTheme); } catch {}
    updateTheme();
  });
  themeQuery.addEventListener("change", updateTheme);
  new MutationObserver(updateTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("resize", drawArt);

  function celebrate() {
    const button = byId("send-love");
    const status = byId("celebration-status");
    const buttonText = "Thêm một chút yêu, thêm một ngày thương.";
    clearTimeout(celebrationTimer);
    button.lastChild.textContent = buttonText;
    status.textContent = buttonText;
    celebrationTimer = setTimeout(() => {
      button.lastChild.textContent = "Thả một chút yêu";
      status.textContent = "";
    }, 2_500);
    if (motionQuery.matches) return;

    const canvas = byId("celebration");
    const context = canvas.getContext("2d");
    if (!context) return;
    cancelAnimationFrame(celebrationFrame);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    context.scale(pixelRatio, pixelRatio);
    const rect = button.getBoundingClientRect();
    const palette = colors();
    const particles = Array.from({ length: 30 }, () => ({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      vx: (Math.random() - 0.5) * 230,
      vy: -70 - Math.random() * 190,
      size: 6 + Math.random() * 10,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 2,
    }));
    let startTime;

    function frame(now) {
      startTime ??= now;
      const elapsed = (now - startTime) / 1_000;
      context.clearRect(0, 0, width, height);
      if (elapsed >= 2 || motionQuery.matches || document.hidden) return;
      context.fillStyle = palette.accent;
      context.globalAlpha = Math.max(0, 1 - elapsed / 2);
      for (const particle of particles) {
        context.save();
        context.translate(particle.x + particle.vx * elapsed, particle.y + particle.vy * elapsed - 20 * elapsed * elapsed);
        context.rotate(particle.angle + particle.spin * elapsed);
        heartPath(context, 0, 0, particle.size);
        context.fill();
        context.restore();
      }
      celebrationFrame = requestAnimationFrame(frame);
    }
    celebrationFrame = requestAnimationFrame(frame);
  }
  byId("send-love").addEventListener("click", celebrate);

  const dialog = byId("share-dialog");
  const message = byId("share-message");
  const copyStatus = byId("copy-status");
  byId("open-share").addEventListener("click", () => {
    const snapshot = getSnapshot();
    message.value = `${COUPLE.firstName} & ${COUPLE.secondName} ♥\n\nTừ 14/02/2022, chúng mình đã có ${numberFormat.format(snapshot.totalDays)} ngày bên nhau.\n\nKhông cần một câu chuyện hoàn hảo. Chỉ cần trong câu chuyện ấy, có chúng mình.`;
    copyStatus.textContent = "";
    dialog.showModal();
  });
  byId("close-share").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  byId("copy-message").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(message.value);
      copyStatus.textContent = "Đã sao chép. Bạn có thể dán lời nhắn để gửi cho người thương.";
    } catch {
      message.focus();
      message.select();
      copyStatus.textContent = "Trình duyệt chưa cho phép sao chép. Giữ để sao chép hoặc nhấn Ctrl+C / ⌘C.";
    }
  });

  function resumeTimer() {
    clearInterval(timer);
    update();
    if (!document.hidden) timer = setInterval(update, 1_000);
  }
  document.addEventListener("visibilitychange", resumeTimer);
  updateTheme();
  resumeTimer();
})();
