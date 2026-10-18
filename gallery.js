(function () {
  "use strict";

  const media = (query) => typeof matchMedia === "function" ? matchMedia(query) : { matches: false };
  const reducedMotion = media("(prefers-reduced-motion: reduce)");
  const forcedColors = media("(forced-colors: active)");
  const supports3D = typeof CSS !== "undefined" && typeof CSS.supports === "function"
    && CSS.supports("transform-style", "preserve-3d") && CSS.supports("perspective", "600px");
  const galleries = new Map();
  const broken = new Set();
  const delay = 3000;
  const turn = Math.PI * 2;
  let selected;
  let paused = false;
  let motion = true;
  let suspended = false;
  try { paused = localStorage.getItem("phong-lanh-slideshow") === "off"; } catch { /* Photos do not require browser storage. */ }

  function photoSource(source, embedded) {
    if (typeof source !== "string") return null;
    if (embedded && /^data:image\/(?:jpeg|png|webp|avif);base64,[a-zA-Z0-9+/=]+$/.test(source)) return source;
    if (!source.startsWith("photos/")) return null;
    try {
      const name = decodeURIComponent(source.slice(7));
      return !name.startsWith(".") && !/[/\\\u0000-\u001f\u007f]/.test(name)
        && /\.(?:jpe?g|png|webp|avif)$/i.test(name) && source === `photos/${encodeURIComponent(name)}` ? source : null;
    } catch { return null; }
  }

  function cleanText(value, limit) {
    if (typeof value !== "string") return undefined;
    const text = value.trim();
    return text && text.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) ? text : undefined;
  }

  function variantSource(source, width) {
    if (typeof source !== "string") return null;
    const match = source.match(/^photo-variants\/[a-f0-9]{16}-([1-9]\d*)\.webp$/);
    return match && Number(match[1]) === width ? source : null;
  }

  function normalizePhoto(photo, embedded = false) {
    const src = photoSource(photo?.src, embedded);
    if (!src) return null;
    const record = { src };
    for (const [field, limit] of Object.entries({ alt: 500, caption: 1000, date: 80, location: 200 })) {
      const value = cleanText(photo[field], limit);
      if (value) record[field] = value;
    }
    if (Number.isInteger(photo.width) && Number.isInteger(photo.height)
      && photo.width > 0 && photo.height > 0 && photo.width <= 100000 && photo.height <= 100000) {
      record.width = photo.width;
      record.height = photo.height;
    }
    if (!embedded && Array.isArray(photo.variants)) {
      const sources = new Set();
      record.variants = photo.variants.map((variant) => {
        if (!Number.isInteger(variant?.width) || !Number.isInteger(variant?.height)
          || variant.width < 1 || variant.height < 1 || variant.width > 100000 || variant.height > 100000
          || variant.type !== "image/webp") return null;
        const source = variantSource(variant.src, variant.width);
        if (!source || sources.has(source)) return null;
        sources.add(source);
        return { src: source, width: variant.width, height: variant.height, type: "image/webp" };
      }).filter(Boolean).sort((left, right) => left.width - right.width).slice(0, 12);
      if (!record.variants.length) delete record.variants;
    }
    return record;
  }

  const roleSizes = {
    thumbnail: "54px",
    card: "(max-width: 680px) 60vw, 300px",
    gallery: "(max-width: 680px) 60vw, 480px",
    lightbox: "(max-width: 680px) calc(100vw - 32px), 920px",
  };
  function roleVariants(record, role) {
    const variants = record?.variants || [];
    if (role === "thumbnail") return variants.filter((variant) => variant.width <= 320);
    if (role === "card") return variants.filter((variant) => variant.width <= 960);
    return variants;
  }

  function applyPhotoSource(image, record, role = "gallery", originalOnly = false) {
    const variants = originalOnly ? [] : roleVariants(record, role);
    image.dataset ||= {};
    image.dataset.photoSource = record.src;
    image.dataset.photoRole = role;
    delete image.dataset.originalFallback;
    if (variants.length) {
      image.srcset = variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ");
      image.sizes = roleSizes[role];
      image.src = record.src;
    } else {
      image.srcset = "";
      image.sizes = "";
      image.removeAttribute?.("srcset");
      image.removeAttribute?.("sizes");
      image.src = record.src;
    }
    if (record.width && record.height) {
      image.width = record.width;
      image.height = record.height;
    }
    return image;
  }

  function retryOriginal(image, record) {
    if (!record?.variants?.length || image.dataset?.originalFallback === "true") return false;
    image.dataset.originalFallback = "true";
    image.srcset = "";
    image.sizes = "";
    image.removeAttribute?.("srcset");
    image.removeAttribute?.("sizes");
    image.src = record.src;
    return true;
  }

  function displayDate(value) {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  }

  const library = (async () => {
    try {
      const embedded = document.getElementById("photo-library");
      let data;
      if (embedded) data = JSON.parse(embedded.textContent);
      else {
        const request = new AbortController();
        const timeout = setTimeout(() => request.abort(), 8000);
        try {
          const response = await fetch("photos.json", { cache: "no-store", signal: request.signal });
          if (!response.ok) throw new Error("Album unavailable");
          data = await response.json();
        } finally { clearTimeout(timeout); }
      }
      if (!Array.isArray(data?.photos)) throw new Error("Invalid album");
      const records = new Map();
      for (const photo of data.photos) {
        const record = normalizePhoto(photo, Boolean(embedded));
        if (record && !records.has(record.src)) records.set(record.src, record);
      }
      return [...records.values()];
    } catch { return null; }
  })();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function icon(path) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(svg.namespaceURI, "path");
    shape.setAttribute("d", path);
    svg.append(shape);
    return svg;
  }

  function button(className, label, path, text) {
    const node = element("button", className);
    node.type = "button";
    node.setAttribute("aria-label", label);
    node.title = label;
    node.append(icon(path));
    if (text) node.append(element("span", "", text));
    return node;
  }

  function restoreAttribute(node, name, value) {
    if (value === null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  }

  function focus(node) {
    try { node?.focus({ preventScroll: true }); } catch { node?.focus(); }
  }

  // The shortest signed arc is also used at the last/first boundary.
  function circularDelta(from, to, count, direction = 1) {
    if (count < 2) return 0;
    let delta = ((to - from) % count + count) % count;
    if (delta > count / 2 || (delta === count / 2 && direction < 0)) delta -= count;
    return delta;
  }

  // Billboard-like photo frames lie on a horizontal circle in actual X/Z space.
  // Negative Z makes rear photos smaller through the viewer's perspective.
  function ringPose(angle, width, height) {
    const side = Math.sin(angle);
    const depth = 1 - Math.cos(angle);
    return `translate(-50%, -50%) translate3d(${(side * width * 0.32).toFixed(3)}px, ${(-depth * height * 0.105).toFixed(3)}px, ${(-depth * width * 0.52).toFixed(3)}px) rotateY(${(-side * 24).toFixed(3)}deg)`;
  }

  function dialogsOpen() {
    return Boolean(document.querySelector("dialog[open]"));
  }

  function otherDialogsOpen(except) {
    return [...(document.querySelectorAll?.("dialog[open]") || [])].some((dialog) => dialog !== except);
  }

  function syncAll() {
    for (const gallery of galleries.values()) gallery.sync();
  }

  function setPaused(value) {
    paused = value;
    try { localStorage.setItem("phong-lanh-slideshow", value ? "off" : "on"); } catch { /* Pause works without storage. */ }
    syncAll();
  }

  // A fragment preview need not have an html/head/body skeleton. Prefer a stable
  // document host, otherwise use the mounting fragment/top-level element.
  function dialogHost(container) {
    const doc = container.ownerDocument || document;
    if (doc.body) return doc.body;
    const root = container.getRootNode();
    if (root.nodeType === 11) return root;
    return doc.documentElement || container.parentNode || container;
  }

  class Gallery {
    constructor(container) {
      this.container = container;
      this.viewer = container.querySelector(".gallery-viewer");
      this.image = container.querySelector("[data-gallery-image]");
      this.panel = container.querySelector(".gallery-panel");
      this.empty = container.querySelector(".gallery-empty");
      this.original = {
        viewerChildren: [...this.viewer.childNodes], panelChildren: [...this.panel.childNodes],
        imageAttributes: [...this.image.attributes].map(({ name, value }) => [name, value]),
        panelHidden: this.panel.hidden, emptyHidden: this.empty.hidden,
        tabIndex: this.viewer.getAttribute("tabindex"), label: this.viewer.getAttribute("aria-label"),
        viewerStyle: this.viewer.getAttribute("style"),
        containerAttributes: ["data-gallery-mode", "data-gallery-state", "data-gallery-count", "data-gallery-current", "aria-busy"]
          .map((name) => [name, container.getAttribute(name)]),
      };
      this.photos = [];
      this.records = new Map();
      this.cards = new Map();
      this.index = 0;
      this.onScreen = true;
      this.alive = true;
      this.animations = [];
      this.request = 0;
      this.events = new AbortController();
      const options = { signal: this.events.signal };
      const controls = element("div", "gallery-controls");
      this.previous = button("gallery-previous", "Ảnh trước", "m15 6-6 6 6 6");
      this.next = button("gallery-next", "Ảnh tiếp theo", "m9 6 6 6-6 6");
      this.toggle = button("gallery-toggle", "Bật slideshow tự động", "m8 5 11 7-11 7V5Z");
      this.toggleLabel = element("span", "gallery-toggle-label", "Tự chạy");
      this.toggle.append(this.toggleLabel);
      this.enlarge = button("gallery-enlarge", "Phóng to ảnh đang chọn", "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5", "Phóng to");
      this.enlarge.disabled = true;
      this.enlarge.setAttribute("aria-haspopup", "dialog");
      this.position = element("span", "gallery-position");
      this.position.setAttribute("aria-live", "off");
      controls.append(this.previous, this.position, this.next, this.enlarge, this.toggle);
      this.strip = element("div", "gallery-strip");
      this.strip.setAttribute("role", "group");
      this.strip.setAttribute("aria-label", "Chọn ảnh trong album");
      this.story = element("div", "gallery-story");
      this.storyCaption = element("p", "gallery-story-caption");
      this.storyMeta = element("p", "gallery-story-meta");
      this.story.append(this.storyCaption, this.storyMeta);
      this.story.hidden = true;
      this.note = element("p", "gallery-note");
      this.announcement = element("p", "sr-only");
      this.announcement.setAttribute("role", "status");
      this.panel.replaceChildren(controls, this.strip, this.story, this.note, this.announcement);
      this.ring = element("div", "gallery-ring");
      this.ring.hidden = true;
      this.viewer.append(this.ring);
      this.viewer.tabIndex = 0;
      this.viewer.setAttribute("aria-label", "Album ảnh. Kéo ngang hoặc dùng phím trái, phải, Home, End để chọn; bấm ảnh đang chọn để phóng to.");
      this.createLightbox(options);
      this.previous.addEventListener("click", () => this.navigate(-1), options);
      this.next.addEventListener("click", () => this.navigate(1), options);
      this.enlarge.addEventListener("click", () => this.openLightbox(this.enlarge), options);
      this.toggle.addEventListener("click", () => {
        this.focusPlayback = paused;
        setPaused(!paused);
      }, options);
      this.strip.addEventListener("click", (event) => {
        const thumbnail = event.target.closest("[data-photo-source]");
        if (!thumbnail || !this.strip.contains(thumbnail)) return;
        setPaused(true);
        this.show(this.photos.indexOf(thumbnail.dataset.photoSource), "manual");
      }, options);
      this.viewer.addEventListener("click", (event) => {
        if (event.detail !== 0 && this.suppressClick && performance.now() < this.suppressClick) {
          this.suppressClick = 0;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const card = event.target.closest(".gallery-card");
        if (!card || !this.ring.contains(card)) return;
        if (card.dataset.photoSource === this.currentSource) this.openLightbox(card);
        else {
          setPaused(true);
          this.show(this.photos.indexOf(card.dataset.photoSource), "manual");
        }
      }, { ...options, capture: true });
      container.addEventListener("keydown", (event) => {
        this.handleNavigationKey(event, "gallery");
        if ((event.key === "Enter" || event.key === " ") && event.target === this.viewer) {
          event.preventDefault();
          this.openLightbox(this.viewer);
        }
      }, options);
      this.viewer.addEventListener("pointerdown", (event) => this.startDrag(event), options);
      document.addEventListener("pointermove", (event) => this.moveDrag(event), { ...options, passive: false });
      document.addEventListener("pointerup", (event) => this.endDrag(event), options);
      document.addEventListener("pointercancel", (event) => { this.cancelDrag(event.pointerId); this.sync(); }, options);
      this.viewer.addEventListener("lostpointercapture", (event) => {
        if (this.viewer.hasPointerCapture?.(event.pointerId)) return;
        this.cancelDrag(event.pointerId);
        this.sync();
      }, options);
      this.viewer.addEventListener("dragstart", (event) => event.preventDefault(), options);
      container.addEventListener("mouseenter", () => { this.hovered = true; this.sync(); }, options);
      container.addEventListener("mouseleave", () => { this.hovered = false; this.sync(); }, options);
      container.addEventListener("focusin", () => {
        this.focused = true;
        this.focusPlayback = false;
        this.sync();
      }, options);
      container.addEventListener("focusout", (event) => {
        if (!container.contains(event.relatedTarget)) {
          this.focused = false;
          this.focusPlayback = false;
          this.sync();
        }
      }, options);
      if (typeof IntersectionObserver === "function") {
        this.observer = new IntersectionObserver(([entry]) => {
          if (!entry) return;
          this.onScreen = entry.isIntersecting;
          this.sync();
        });
        this.observer.observe(container);
      }
      if (typeof ResizeObserver === "function") {
        this.resizeObserver = new ResizeObserver(() => {
          this.cancelDrag();
          this.renderRing();
          this.sync();
        });
        this.resizeObserver.observe(this.viewer);
      } else window.addEventListener("resize", () => { this.cancelDrag(); this.renderRing(); this.sync(); }, options);
      this.sync();
      library.then((records) => {
        if (!this.alive) return;
        const embedded = Boolean(document.getElementById("photo-library"));
        const fallbackSource = photoSource(this.image.getAttribute("src"), embedded);
        const fallback = fallbackSource ? normalizePhoto({ src: fallbackSource, alt: this.image.alt }, embedded) : null;
        for (const record of records ?? (fallback ? [fallback] : [])) this.records.set(record.src, record);
        this.photos = [...this.records.keys()].filter((source) => !broken.has(source));
        this.drawPhotos();
        const remembered = this.photos.indexOf(selected);
        this.show(remembered < 0 ? 0 : remembered, "initial");
      });
    }

    record(source) {
      return this.records?.get(source) || { src: source };
    }

    updateStory(record = this.record(this.currentSource)) {
      const details = [record.date ? displayDate(record.date) : "", record.location || ""].filter(Boolean);
      this.storyCaption.textContent = record.caption || "";
      this.storyMeta.textContent = details.join(" · ");
      this.story.hidden = !record.caption && !details.length;
      if (this.lightboxCaption) {
        this.lightboxCaption.textContent = record.caption || "";
        this.lightboxMeta.textContent = details.join(" · ");
        this.lightboxStory.hidden = !record.caption && !details.length;
      }
    }

    canMove() {
      return this.alive && motion && supports3D && !reducedMotion.matches && !forcedColors.matches && !document.hidden && !suspended && !dialogsOpen();
    }

    autoplayAllowed() {
      return this.canMove() && !paused && !dialogsOpen() && this.onScreen && !this.hovered
        && !this.drag && (!this.focused || this.focusPlayback);
    }

    canPlay() {
      return this.autoplayAllowed() && this.ready && !this.loading && this.photos.length > 1;
    }

    sync() {
      clearTimeout(this.timer);
      this.timer = undefined;
      if (!this.alive) return;
      if (this.lightboxOpen && (!this.lightbox.hasAttribute("open") || !this.lightbox.isConnected)) this.closeLightbox();
      const mode = supports3D && !reducedMotion.matches && !forcedColors.matches && this.photos.length > 1 ? "3d" : "flat";
      if (this.container.dataset.galleryMode !== mode) {
        this.container.dataset.galleryMode = mode;
        this.cancelDrag();
        this.renderRing();
      }
      if (document.hidden || suspended || dialogsOpen()) this.cancelDrag();
      if (!this.canMove()) {
        this.finishTransition();
        if (this.drag?.horizontal) this.renderRing();
      }
      const disabled = !motion || reducedMotion.matches || forcedColors.matches || !supports3D || this.photos.length < 2;
      this.toggle.disabled = disabled;
      this.toggleLabel.textContent = paused ? "Tự chạy" : "Dừng";
      const label = disabled ? "Tự chạy đã tắt · vẫn có thể chọn ảnh"
        : paused ? "Bật slideshow tự động" : "Tạm dừng slideshow";
      this.toggle.setAttribute("aria-label", label);
      this.toggle.setAttribute("aria-pressed", String(!paused));
      this.toggle.title = label;
      this.toggle.querySelector("path").setAttribute("d", paused ? "m8 5 11 7-11 7V5Z" : "M8 5v14M16 5v14");
      this.panel.hidden = this.photos.length === 0;
      this.previous.disabled = this.next.disabled = this.photos.length < 2;
      this.enlarge.disabled = !this.ready;
      this.lightboxPrevious.disabled = this.lightboxNext.disabled = this.photos.length < 2;
      this.container.setAttribute("aria-busy", String(Boolean(this.loading)));
      this.lightbox.setAttribute("aria-busy", String(Boolean(this.loading && this.lightboxOpen)));
      const playing = this.canPlay();
      this.container.dataset.galleryState = playing ? "playing" : "paused";
      this.container.dataset.galleryCount = String(this.photos.length);
      const instruction = mode === "3d" && this.photos.length > 1 ? "Kéo ngang để xoay · chạm ảnh để chọn hoặc phóng to. " : "Ảnh giữ trọn khung · bấm Phóng to để xem rõ. ";
      this.note.textContent = instruction + (this.photos.length === 1 ? "Một khoảnh khắc của hai đứa."
        : disabled ? "Tự chuyển đã tắt theo cài đặt chuyển động."
          : paused ? "Đang dừng · Tự chạy khi bạn muốn."
            : playing ? "Tự chuyển mỗi 3 giây."
              : "Tạm dừng khi tương tác, mở hộp thoại hoặc ra ngoài màn hình.");
      if (playing) this.timer = setTimeout(() => {
        // Recheck synchronous dialog/lifecycle changes before starting a request.
        if (this.canPlay()) this.show((this.index + 1) % this.photos.length, "auto");
        else this.sync();
      }, delay);
    }

    drawPhotos() {
      const thumbnails = document.createDocumentFragment();
      const cards = document.createDocumentFragment();
      for (const [source, card] of this.cards) {
        if (!this.photos.includes(source)) {
          if (card.contains(this.image)) this.viewer.prepend(this.image);
          card.remove();
          this.cards.delete(source);
        }
      }
      this.photos.forEach((source, index) => {
        let card = this.cards.get(source);
        if (!card) {
          card = element("button", "gallery-card");
          card.type = "button";
          card.dataset.photoSource = source;
          const preview = new Image();
          preview.className = "gallery-card-image";
          preview.alt = "";
          preview.loading = "lazy";
          preview.decoding = "async";
          preview.addEventListener("error", () => {
            if (!retryOriginal(preview, this.record(source))) preview.hidden = true;
          });
          applyPhotoSource(preview, this.record(source), "card");
          card.preview = preview;
          card.badge = element("span", "gallery-card-number");
          card.badge.setAttribute("aria-hidden", "true");
          card.append(preview, card.badge);
          this.cards.set(source, card);
        }
        card.badge.textContent = String(index + 1).padStart(2, "0");
        cards.append(card);
        const thumbnail = element("button", "gallery-thumbnail", String(index + 1));
        thumbnail.type = "button";
        thumbnail.dataset.photoSource = source;
        thumbnail.setAttribute("aria-label", `Chọn ảnh ${index + 1}`);
        const image = new Image();
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => {
          if (!retryOriginal(image, this.record(source))) image.hidden = true;
        });
        applyPhotoSource(image, this.record(source), "thumbnail");
        thumbnail.append(image);
        thumbnails.append(thumbnail);
      });
      this.ring.replaceChildren(cards);
      this.strip.replaceChildren(thumbnails);
      const committed = this.photos.indexOf(this.currentSource);
      if (committed >= 0) this.index = committed;
      this.renderRing();
      if (this.ready) this.updatePosition(false);
    }

    updatePosition(announce) {
      const position = `Ảnh ${this.index + 1} trên ${this.photos.length}`;
      this.position.textContent = `${String(this.index + 1).padStart(2, "0")} / ${String(this.photos.length).padStart(2, "0")}`;
      this.position.setAttribute("aria-label", position);
      const record = this.record(this.currentSource);
      const alt = record.alt || `${position} trong album của Quốc Phong và Ngọc Lành`;
      this.image.alt = alt;
      this.updateStory(record);
      this.container.dataset.galleryCurrent = String(this.index + 1);
      for (const thumbnail of this.strip.children) {
        thumbnail.setAttribute("aria-current", String(thumbnail.dataset.photoSource === this.currentSource));
      }
      this.photos.forEach((source, index) => {
        const card = this.cards.get(source);
        const active = source === this.currentSource;
        card.setAttribute("aria-current", String(active));
        card.setAttribute("aria-label", active ? `${position}. Phóng to ảnh` : `Chọn ảnh ${index + 1} trên ${this.photos.length}`);
        card.tabIndex = active ? 0 : -1;
      });
      if (announce) this.announcement.textContent = position;
      const thumbnail = this.strip.children[this.index];
      if (thumbnail) {
        const left = thumbnail.offsetLeft - this.strip.offsetLeft;
        if (left < this.strip.scrollLeft) this.strip.scrollLeft = left;
        else if (left + thumbnail.offsetWidth > this.strip.scrollLeft + this.strip.clientWidth) {
          this.strip.scrollLeft = left + thumbnail.offsetWidth - this.strip.clientWidth;
        }
      }
      if (this.lightboxOpen) this.updateLightbox();
    }

    angle(index, current = this.index) {
      if (this.photos.length < 2) return 0;
      // Two antipodal billboards would completely hide one another. Keep the
      // second frame on the rear-side arc of the same circle instead.
      if (this.photos.length === 2) return index === current ? 0 : (this.lastDirection || 1) * turn / 3;
      return (index - current) * turn / this.photos.length;
    }

    finishTransition() {
      for (const animation of this.animations) animation.cancel();
      this.animations = [];
    }

    renderRing(delta = 0, animate = false, dragAngle = 0) {
      if (!this.ring || !this.alive) return;
      const bounds = this.viewer.getBoundingClientRect();
      const width = bounds.width || this.viewer.clientWidth || 280;
      const height = bounds.height || width * 0.75;
      const snapshots = new Map();
      if (animate && this.canMove()) {
        for (const card of this.cards.values()) snapshots.set(card, { transform: getComputedStyle(card).transform, angle: card.poseAngle });
      }
      this.finishTransition();
      this.viewer.style.setProperty("--gallery-perspective", `${(width * 1.65).toFixed(2)}px`);
      this.photos.forEach((source, index) => {
        const card = this.cards.get(source);
        if (!card) return;
        const angle = this.angle(index) + dragAngle;
        const transform = ringPose(angle, width, height);
        card.style.transform = transform;
        card.poseAngle = angle;
        // Explicit stack order also keeps a useful, selectable arrangement in
        // engines which flatten preserve-3d at an overflow boundary.
        card.style.zIndex = String(Math.round((Math.cos(angle) + 1) * 100));
        card.dataset.depth = Math.cos(angle).toFixed(3);
        if (animate && this.canMove() && typeof card.animate === "function" && this.container.dataset.galleryMode === "3d") {
          const snapshot = snapshots.get(card);
          let arc = this.photos.length > 2 && delta ? delta * turn / this.photos.length : (snapshot?.angle ?? angle) - angle;
          if (!delta || this.photos.length === 2) arc = ((arc + Math.PI) % turn + turn) % turn - Math.PI;
          const frames = [];
          for (let sample = 0; sample <= 8; sample++) {
            const progress = sample / 8;
            frames.push({ transform: ringPose(angle + arc * (1 - progress), width, height), offset: progress });
          }
          // Continue from the actual rendered pose if a prior finite transition
          // or drag was interrupted, rather than snapping back to its beginning.
          const current = snapshot?.transform;
          if (current && current !== "none") frames[0].transform = current;
          try {
            const animation = card.animate(frames, { duration: 480 + Math.min(Math.abs(delta), 4) * 35, easing: "cubic-bezier(.22,.65,.28,1)" });
            this.animations.push(animation);
            const release = () => { this.animations = this.animations.filter((item) => item !== animation); };
            animation.onfinish = release;
            animation.oncancel = release;
          } catch { /* A partial animation API still leaves the final manual selection in place. */ }
        }
      });
    }

    load(source, role = "gallery") {
      this.cancelLoad?.();
      return new Promise((resolve) => {
        const image = new Image();
        image.decoding = "async";
        const record = this.record(source);
        let finished = false;
        const finish = (value) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          image.onload = image.onerror = null;
          if (this.cancelLoad === cancel) this.cancelLoad = null;
          resolve(value);
        };
        const cancel = () => finish(null);
        const timeout = setTimeout(() => finish(null), 10000);
        this.cancelLoad = cancel;
        image.onload = () => finish(image.naturalWidth && image.naturalHeight ? image : null);
        image.onerror = () => { if (!retryOriginal(image, record)) finish(null); };
        applyPhotoSource(image, record, role);
      });
    }

    cancelSelection() {
      this.request += 1;
      this.cancelLoad?.();
      this.loading = false;
      this.loadingOrigin = null;
      this.requestedSource = this.currentSource;
    }

    navigate(step, origin = "gallery") {
      if (this.photos.length < 2) return;
      setPaused(true);
      const pending = this.photos.indexOf(this.requestedSource);
      const base = pending >= 0 ? pending : this.index;
      this.show((base + step + this.photos.length) % this.photos.length, "manual", origin, step);
    }

    handleNavigationKey(event, origin) {
      if (!this.photos.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        || event.altKey || event.ctrlKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") this.navigate(event.key === "ArrowLeft" ? -1 : 1, origin);
      else {
        setPaused(true);
        this.show(event.key === "Home" ? 0 : this.photos.length - 1, "manual", origin);
      }
    }

    async show(index, reason, origin = "gallery", direction = 1) {
      if (!this.alive || index < 0) return;
      clearTimeout(this.timer);
      const request = ++this.request;
      this.cancelLoad?.();
      this.loading = true;
      this.loadingOrigin = origin;
      this.requestedSource = this.photos[index];
      this.sync();
      let loaded = null;
      while (this.photos.length && !loaded) {
        index = Math.max(0, Math.min(index, this.photos.length - 1));
        const candidate = this.photos[index];
        loaded = this.ready && this.currentSource === candidate ? this.image : await this.load(candidate);
        if (!this.alive || request !== this.request) return;
        if (!loaded) {
          broken.add(candidate);
          this.photos.splice(index, 1);
          if (direction < 0) index = Math.max(0, index - 1);
          this.drawPhotos();
        }
      }
      if (!this.alive || request !== this.request) return;
      this.loading = false;
      this.loadingOrigin = null;
      // The autoplay request may have begun before a pause, dialog or pagehide.
      // A successful decode is not permission to commit a now-stale selection.
      if (reason === "auto" && !this.autoplayAllowed()) {
        this.requestedSource = this.currentSource;
        this.sync();
        return;
      }
      if (!loaded) {
        this.image.hidden = true;
        this.ring.hidden = true;
        this.empty.hidden = false;
        this.ready = false;
        this.currentSource = this.requestedSource = undefined;
        if (this.storyCaption) this.storyCaption.textContent = "";
        if (this.storyMeta) this.storyMeta.textContent = "";
        if (this.story) this.story.hidden = true;
        delete this.container.dataset.galleryCurrent;
        if (this.lightboxOpen) this.closeLightbox();
        this.sync();
        return;
      }
      const oldIndex = this.index;
      const source = this.photos[index];
      const changed = source !== this.currentSource;
      const oldCard = this.cards.get(this.currentSource);
      const card = this.cards.get(source);
      if (oldCard && changed) oldCard.preview.hidden = false;
      card.preview.hidden = true;
      // Only a fully loaded, non-stale source becomes the committed photograph.
      // Keep the original data-gallery-image node stable across navigation too.
      if (changed) {
        const record = this.record(source);
        applyPhotoSource(this.image, record, "gallery", loaded.dataset?.originalFallback === "true");
        if (!record.width || !record.height) {
          this.image.width = loaded.naturalWidth;
          this.image.height = loaded.naturalHeight;
        }
      }
      this.image.classList.add("gallery-card-image");
      card.prepend(this.image);
      this.image.hidden = false;
      this.empty.hidden = true;
      this.ring.hidden = false;
      this.index = index;
      this.currentSource = this.requestedSource = source;
      this.ready = true;
      selected = source;
      const delta = circularDelta(oldIndex, index, this.photos.length, direction);
      if (delta) this.lastDirection = Math.sign(delta);
      this.updatePosition(reason === "manual");
      this.renderRing(delta, changed && reason !== "initial");
      this.sync();
    }

    startDrag(event) {
      this.suppressClick = false;
      if (!this.ready || this.photos.length < 2 || event.isPrimary === false || (event.button !== undefined && event.button !== 0) || this.lightboxOpen) return;
      this.cancelDrag();
      this.drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, horizontal: false };
      this.sync();
    }

    moveDrag(event) {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.horizontal) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { this.cancelDrag(); this.sync(); return; }
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        drag.horizontal = true;
        this.suppressClick = performance.now() + 800;
        setPaused(true);
        this.cancelSelection();
        this.sync();
        try { this.viewer.setPointerCapture?.(drag.id); } catch { /* Document listeners also handle uncaptured pointers. */ }
      }
      drag.dx = dx;
      if (event.cancelable) event.preventDefault();
      this.viewer.dataset.dragging = "true";
      if (this.canMove()) this.renderRing(0, false, Math.max(-1.1, Math.min(1.1, dx / Math.max(this.viewer.clientWidth, 1) * 2.2)));
    }

    releaseDrag(drag) {
      if (drag.horizontal) this.suppressClick = performance.now() + 800;
      this.drag = null;
      delete this.viewer.dataset.dragging;
      try {
        if (this.viewer.hasPointerCapture?.(drag.id)) this.viewer.releasePointerCapture(drag.id);
      } catch { /* Capture may already have been released by the browser. */ }
    }

    endDrag(event) {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      this.releaseDrag(drag);
      if (drag.horizontal && Math.abs(drag.dx) >= Math.max(26, this.viewer.clientWidth * 0.12)) this.navigate(drag.dx < 0 ? 1 : -1);
      else { this.renderRing(0, drag.horizontal); this.sync(); }
    }

    cancelDrag(pointerId) {
      const drag = this.drag;
      if (!drag || (pointerId !== undefined && drag.id !== pointerId)) return;
      this.releaseDrag(drag);
      this.renderRing();
    }

    createLightbox(options) {
      this.lightbox = element("dialog", "gallery-lightbox");
      this.lightbox.setAttribute("aria-label", "Album của hai đứa · ảnh phóng to");
      this.lightbox.tabIndex = -1;
      const heading = element("div", "gallery-lightbox-heading");
      heading.append(element("h2", "", "Một khoảnh khắc của hai đứa"));
      this.lightboxClose = button("gallery-lightbox-close", "Đóng ảnh phóng to", "m6 6 12 12M6 18 18 6");
      heading.append(this.lightboxClose);
      this.lightboxFigure = element("div", "gallery-lightbox-figure");
      this.lightboxStory = element("div", "gallery-lightbox-story");
      this.lightboxCaption = element("p", "gallery-lightbox-caption");
      this.lightboxMeta = element("p", "gallery-lightbox-meta");
      this.lightboxStory.append(this.lightboxCaption, this.lightboxMeta);
      this.lightboxStory.hidden = true;
      const controls = element("div", "gallery-lightbox-controls");
      this.lightboxPrevious = button("gallery-lightbox-previous", "Ảnh trước", "m15 6-6 6 6 6");
      this.lightboxNext = button("gallery-lightbox-next", "Ảnh tiếp theo", "m9 6 6 6-6 6");
      this.lightboxPosition = element("span", "gallery-lightbox-position");
      this.lightboxPosition.setAttribute("role", "status");
      controls.append(this.lightboxPrevious, this.lightboxPosition, this.lightboxNext);
      this.lightbox.append(heading, this.lightboxFigure, this.lightboxStory, controls);
      this.lightboxShade = element("div", "gallery-lightbox-shade");
      this.lightboxShade.hidden = true;
      this.lightboxShade.setAttribute("aria-hidden", "true");
      dialogHost(this.container).append(this.lightboxShade, this.lightbox);
      this.lightboxShade.addEventListener("click", () => this.closeLightbox(), options);
      this.lightboxClose.addEventListener("click", () => this.closeLightbox(), options);
      this.lightboxPrevious.addEventListener("click", () => this.navigate(-1, "lightbox"), options);
      this.lightboxNext.addEventListener("click", () => this.navigate(1, "lightbox"), options);
      this.lightbox.addEventListener("cancel", (event) => { event.preventDefault(); this.closeLightbox(); }, options);
      this.lightbox.addEventListener("close", () => { if (!this.lightbox.hasAttribute("open")) this.closeLightbox(); }, options);
      this.lightbox.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); this.closeLightbox(); }
        else if (event.key === "Tab") this.trapFocus(event);
        else this.handleNavigationKey(event, "lightbox");
      }, options);
      this.lightbox.addEventListener("click", (event) => {
        if (event.target !== this.lightbox) return;
        const bounds = this.lightbox.getBoundingClientRect();
        if (this.lightbox.dataset.fallback === "true" || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.closeLightbox();
      }, options);
      document.addEventListener("focusin", (event) => {
        if (this.lightboxOpen && this.lightbox.dataset.fallback === "true" && !otherDialogsOpen(this.lightbox) && !this.lightbox.contains(event.target)) focus(this.lightboxClose);
      }, options);
      const blockBackgroundScroll = (event) => {
        if (this.lightboxOpen && !this.lightbox.contains(event.target) && event.cancelable) event.preventDefault();
      };
      document.addEventListener("wheel", blockBackgroundScroll, { ...options, capture: true, passive: false });
      document.addEventListener("touchmove", blockBackgroundScroll, { ...options, capture: true, passive: false });
    }

    updateLightbox() {
      if (!this.lightboxOpen || !this.lightbox.hasAttribute("open") || !this.ready) return;
      const record = this.record(this.currentSource);
      if (this.lightboxImage?.dataset.photoSource !== this.currentSource) {
        const image = new Image();
        image.className = "gallery-lightbox-image";
        image.decoding = "async";
        image.addEventListener("error", () => { retryOriginal(image, record); });
        applyPhotoSource(image, record, "lightbox");
        image.hidden = false;
        this.lightboxFigure.replaceChildren(image);
        this.lightboxImage = image;
      }
      this.lightboxImage.alt = record.alt || this.image.alt;
      this.updateStory(record);
      this.lightboxPosition.textContent = `Ảnh ${this.index + 1} trên ${this.photos.length}`;
    }

    trapFocus(event) {
      const controls = [...this.lightbox.querySelectorAll("button:not(:disabled), [tabindex]:not([tabindex='-1'])")]
        .filter((node) => !node.hidden && node.getClientRects().length);
      const first = controls[0] || this.lightbox;
      const last = controls.at(-1) || this.lightbox;
      const active = document.activeElement;
      if (!controls.includes(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        focus(event.shiftKey ? last : first);
      }
    }

    hideBackground() {
      this.background = [];
      let branch = this.lightbox;
      // Walk sibling branches instead of assuming that a preview-shell exists.
      while (branch.parentNode && branch.parentNode.nodeType !== 9) {
        for (const sibling of branch.parentNode.children || []) {
          if (sibling === branch || sibling === this.lightboxShade || /^(DIALOG|SCRIPT|STYLE|LINK|META|TITLE)$/.test(sibling.tagName)) continue;
          this.background.push({ node: sibling, inert: sibling.getAttribute("inert"), hidden: sibling.getAttribute("aria-hidden") });
          sibling.setAttribute("inert", "");
          sibling.setAttribute("aria-hidden", "true");
        }
        branch = branch.parentNode;
      }
    }

    lockScroll() {
      const doc = this.container.ownerDocument || document;
      const body = doc.body;
      const scroller = doc.scrollingElement || doc.documentElement || this.lightbox.parentElement;
      const nodes = [...new Set([scroller, body].filter((node) => node?.style))];
      this.scrollRestore = {
        x: window.scrollX || 0, y: window.scrollY || 0,
        nodes: nodes.map((node) => ({ node, style: node.getAttribute("style") })),
      };
      if (scroller?.style) {
        scroller.style.setProperty("overflow", "hidden", "important");
        scroller.style.setProperty("overscroll-behavior", "none", "important");
      }
      if (body?.style) {
        body.style.setProperty("position", "fixed", "important");
        body.style.setProperty("top", `${-this.scrollRestore.y}px`, "important");
        body.style.setProperty("left", `${-this.scrollRestore.x}px`, "important");
        body.style.setProperty("width", "100%", "important");
        body.style.setProperty("overflow", "hidden", "important");
      }
    }

    openLightbox(opener) {
      if (!this.alive || !this.ready || this.lightboxOpen || dialogsOpen()) return;
      this.cancelDrag();
      this.cancelSelection();
      this.opener = opener || document.activeElement;
      this.lightboxOpen = true;
      this.lightbox.setAttribute("aria-modal", "true");
      this.lightbox.setAttribute("role", "dialog");
      this.lockScroll();
      try {
        if (typeof this.lightbox.showModal !== "function") throw new Error("Native dialog unavailable");
        this.lightbox.showModal();
        if (!this.lightbox.hasAttribute("open")) throw new Error("Native dialog did not open");
      } catch {
        this.lightbox.dataset.fallback = "true";
        this.lightbox.setAttribute("open", "");
        if (this.lightboxShade) this.lightboxShade.hidden = false;
        // Move focus before aria-hiding the element containing the opener.
        focus(this.lightboxClose);
        this.hideBackground();
      }
      this.updateLightbox();
      focus(this.lightboxClose);
      syncAll();
    }

    closeLightbox() {
      if (!this.lightboxOpen) return;
      this.lightboxOpen = false;
      if (this.loadingOrigin === "lightbox") this.cancelSelection();
      try {
        if (this.lightbox.dataset.fallback !== "true" && typeof this.lightbox.close === "function" && this.lightbox.hasAttribute("open")) this.lightbox.close();
      } catch { /* Removing open also handles a detached/partially supported dialog. */ }
      this.lightbox.removeAttribute("open");
      this.lightbox.removeAttribute("role");
      this.lightbox.removeAttribute("aria-modal");
      delete this.lightbox.dataset.fallback;
      if (this.lightboxShade) this.lightboxShade.hidden = true;
      for (const { node, inert, hidden } of this.background || []) {
        restoreAttribute(node, "inert", inert);
        restoreAttribute(node, "aria-hidden", hidden);
      }
      this.background = [];
      if (this.scrollRestore) {
        const { nodes, x, y } = this.scrollRestore;
        for (const { node, style } of nodes) restoreAttribute(node, "style", style);
        try { window.scrollTo({ left: x, top: y, behavior: "instant" }); } catch { /* A fragment host may not provide scrollTo. */ }
        this.scrollRestore = null;
      }
      const opener = this.opener;
      this.opener = null;
      if (!dialogsOpen()) {
        if (opener?.isConnected && opener.getClientRects().length && !opener.closest?.("[inert]")) focus(opener);
        else if (this.alive) focus(this.enlarge);
      }
      // Remove the clone so no pending modal image can become visible on a later
      // open. Only the current committed photograph will be cloned next time.
      this.lightboxFigure.replaceChildren();
      this.lightboxImage = null;
      if (this.lightboxCaption) this.lightboxCaption.textContent = "";
      if (this.lightboxMeta) this.lightboxMeta.textContent = "";
      if (this.lightboxStory) this.lightboxStory.hidden = true;
      syncAll();
    }

    destroy() {
      this.alive = false;
      this.cancelSelection();
      clearTimeout(this.timer);
      this.cancelDrag();
      this.finishTransition();
      this.closeLightbox();
      this.observer?.disconnect();
      this.resizeObserver?.disconnect();
      this.events.abort();
      this.lightbox.remove();
      this.lightboxShade?.remove();
      this.viewer.replaceChildren(...this.original.viewerChildren);
      for (const { name } of [...this.image.attributes]) this.image.removeAttribute(name);
      for (const [name, value] of this.original.imageAttributes) this.image.setAttribute(name, value);
      this.panel.replaceChildren(...this.original.panelChildren);
      this.panel.hidden = this.original.panelHidden;
      this.empty.hidden = this.original.emptyHidden;
      restoreAttribute(this.viewer, "style", this.original.viewerStyle);
      delete this.viewer.dataset.dragging;
      restoreAttribute(this.viewer, "tabindex", this.original.tabIndex);
      restoreAttribute(this.viewer, "aria-label", this.original.label);
      for (const [name, value] of this.original.containerAttributes) restoreAttribute(this.container, name, value);
      this.cards.clear();
    }
  }

  function mount(scope = document) {
    const containers = [...scope.querySelectorAll("[data-photo-gallery]")];
    if (scope.matches?.("[data-photo-gallery]")) containers.unshift(scope);
    for (const container of containers) {
      if (!galleries.has(container) && container.querySelector(".gallery-viewer") && container.querySelector("[data-gallery-image]")
        && container.querySelector(".gallery-panel") && container.querySelector(".gallery-empty")) {
        galleries.set(container, new Gallery(container));
      }
    }
  }

  window.LovePhotos = Object.freeze({
    mount,
    unmount(scope = document) {
      for (const [container, gallery] of galleries) {
        if (scope === container || scope.contains(container)) { gallery.destroy(); galleries.delete(container); }
      }
    },
    setMotion(enabled) {
      motion = Boolean(enabled);
      syncAll();
    },
  });
  // Observe dynamically mounted lightboxes as well as the existing share dialog.
  // Filter mutations so our own labels/styles do not create a sync feedback loop.
  const dialogs = new MutationObserver((records) => {
    if (records.some((record) => record.type === "attributes" && record.target.tagName === "DIALOG"
      || record.type === "childList" && [...record.addedNodes, ...record.removedNodes]
        .some((node) => node.nodeType === 1 && (node.tagName === "DIALOG" || node.querySelector?.("dialog"))))) syncAll();
  });
  dialogs.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
  const watchMedia = (query) => {
    if (typeof query.addEventListener === "function") query.addEventListener("change", syncAll);
    else query.addListener?.(syncAll);
  };
  watchMedia(reducedMotion);
  watchMedia(forcedColors);
  document.addEventListener("visibilitychange", syncAll);
  window.addEventListener("pagehide", () => { suspended = true; syncAll(); });
  window.addEventListener("pageshow", () => { suspended = false; syncAll(); });
  mount();
})();
