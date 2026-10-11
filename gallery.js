(function () {
  "use strict";

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const galleries = new Map();
  const broken = new Set();
  const delay = 6000;
  let selected;
  let paused = false;
  let motion = true;
  let suspended = false;
  try { paused = localStorage.getItem("phong-lanh-slideshow") === "off"; } catch { /* Viewing photos does not require browser storage. */ }

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
      if (!Array.isArray(data.photos)) throw new Error("Invalid album");
      return [...new Set(data.photos.map((photo) => photoSource(photo?.src, Boolean(embedded))).filter(Boolean))];
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

  function setPaused(value) {
    paused = value;
    try { localStorage.setItem("phong-lanh-slideshow", value ? "off" : "on"); } catch { /* The pause control also works without storage. */ }
    for (const gallery of galleries.values()) gallery.sync();
  }

  class Gallery {
    constructor(container) {
      this.container = container;
      this.viewer = container.querySelector(".gallery-viewer");
      this.image = container.querySelector("[data-gallery-image]");
      this.panel = container.querySelector(".gallery-panel");
      this.empty = container.querySelector(".gallery-empty");
      this.photos = [];
      this.index = 0;
      this.onScreen = true;
      this.alive = true;
      this.events = new AbortController();
      const options = { signal: this.events.signal };
      const button = (className, label, path) => {
        const node = element("button", className);
        node.type = "button";
        node.setAttribute("aria-label", label);
        node.title = label;
        node.append(icon(path));
        return node;
      };
      const controls = element("div", "gallery-controls");
      this.previous = button("gallery-previous", "Ảnh trước", "m15 6-6 6 6 6");
      this.next = button("gallery-next", "Ảnh tiếp theo", "m9 6 6 6-6 6");
      this.toggle = button("gallery-toggle", "Tạm dừng slideshow", "M8 5v14M16 5v14");
      this.toggleLabel = element("span", "gallery-toggle-label");
      this.toggle.append(this.toggleLabel);
      this.position = element("span", "gallery-position");
      this.position.setAttribute("aria-live", "off");
      controls.append(this.previous, this.position, this.next, this.toggle);
      this.strip = element("div", "gallery-strip");
      this.strip.setAttribute("role", "group");
      this.strip.setAttribute("aria-label", "Chọn ảnh trong album");
      this.note = element("p", "gallery-note");
      this.announcement = element("p", "sr-only");
      this.announcement.setAttribute("role", "status");
      this.panel.replaceChildren(controls, this.strip, this.note, this.announcement);
      this.viewer.tabIndex = 0;
      this.viewer.setAttribute("aria-label", "Ảnh của hai đứa. Dùng phím mũi tên trái hoặc phải để đổi ảnh.");
      this.previous.addEventListener("click", () => this.navigate(-1), options);
      this.next.addEventListener("click", () => this.navigate(1), options);
      this.toggle.addEventListener("click", () => {
        this.focusPlayback = paused;
        setPaused(!paused);
      }, options);
      this.strip.addEventListener("click", (event) => {
        const thumbnail = event.target.closest("[data-photo-source]");
        if (!thumbnail) return;
        setPaused(true);
        this.show(this.photos.indexOf(thumbnail.dataset.photoSource), "manual");
      }, options);
      container.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || this.photos.length < 2) return;
        event.preventDefault();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") this.navigate(event.key === "ArrowLeft" ? -1 : 1);
        else {
          setPaused(true);
          this.show(event.key === "Home" ? 0 : this.photos.length - 1, "manual");
        }
      }, options);
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
          this.onScreen = entry.isIntersecting;
          this.sync();
        });
        this.observer.observe(container);
      }
      library.then((photos) => {
        if (!this.alive) return;
        this.photos = (photos ?? [this.image.getAttribute("src")]).filter((source) => !broken.has(source));
        this.drawThumbnails();
        const remembered = this.photos.indexOf(selected);
        this.show(remembered < 0 ? 0 : remembered, "initial");
      });
    }

    canMove() {
      return this.alive && motion && !reducedMotion.matches && !document.hidden && !suspended;
    }

    canPlay() {
      return this.canMove() && !paused && this.ready && !this.loading && this.photos.length > 1
        && !document.querySelector("dialog[open]") && this.onScreen && !this.hovered && (!this.focused || this.focusPlayback);
    }

    sync() {
      clearTimeout(this.timer);
      if (!this.alive) return;
      if (!this.canMove()) this.finishTransition();
      const disabled = !motion || reducedMotion.matches;
      this.toggle.disabled = disabled;
      const play = paused;
      this.toggleLabel.textContent = play ? "Tự chạy" : "Dừng";
      const label = disabled ? "Slideshow đã dừng theo cài đặt giảm chuyển động" : play ? "Bật slideshow tự động" : "Tạm dừng slideshow";
      this.toggle.setAttribute("aria-label", label);
      this.toggle.title = label;
      this.toggle.querySelector("path").setAttribute("d", play ? "m8 5 11 7-11 7V5Z" : "M8 5v14M16 5v14");
      this.panel.hidden = this.photos.length < 2;
      this.previous.disabled = this.next.disabled = this.photos.length < 2;
      const playing = this.canPlay();
      this.container.dataset.galleryState = playing ? "playing" : "paused";
      this.container.dataset.galleryCount = String(this.photos.length);
      this.note.textContent = disabled ? "Tự chuyển ảnh đã tắt · vẫn có thể chọn ảnh."
        : paused ? "Đang dừng · bấm Tự chạy để xem lần lượt."
          : playing ? "Tự chuyển mỗi 6 giây · giữ lại từng khoảnh khắc."
            : "Tạm dừng khi bạn tương tác hoặc album ở ngoài màn hình.";
      if (playing) this.timer = setTimeout(() => this.show((this.index + 1) % this.photos.length, "auto"), delay);
    }

    drawThumbnails() {
      const fragment = document.createDocumentFragment();
      this.photos.forEach((source, index) => {
        const thumbnail = element("button", "gallery-thumbnail", String(index + 1));
        thumbnail.type = "button";
        thumbnail.dataset.photoSource = source;
        thumbnail.setAttribute("aria-label", `Xem ảnh ${index + 1}`);
        const image = new Image();
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => { image.hidden = true; }, { once: true });
        image.src = source;
        thumbnail.append(image);
        fragment.append(thumbnail);
      });
      this.strip.replaceChildren(fragment);
    }

    updatePosition(announce) {
      const position = `Ảnh ${this.index + 1} trên ${this.photos.length}`;
      this.position.textContent = `${String(this.index + 1).padStart(2, "0")} / ${String(this.photos.length).padStart(2, "0")}`;
      this.position.setAttribute("aria-label", position);
      this.image.alt = `${position} trong album của Quốc Phong và Ngọc Lành`;
      this.container.dataset.galleryCurrent = String(this.index + 1);
      for (const button of this.strip.children) {
        button.setAttribute("aria-current", String(button.dataset.photoSource === this.photos[this.index]));
      }
      if (announce) this.announcement.textContent = position;
      const thumbnail = this.strip.children[this.index];
      if (thumbnail && (thumbnail.offsetLeft < this.strip.scrollLeft || thumbnail.offsetLeft + thumbnail.offsetWidth > this.strip.scrollLeft + this.strip.clientWidth)) {
        this.strip.scrollLeft = thumbnail.offsetLeft - this.strip.offsetLeft;
      }
    }

    finishTransition() {
      this.transition?.cancel();
      this.transition = null;
      this.outgoing?.remove();
      this.outgoing = null;
    }

    load(source) {
      this.cancelLoad?.();
      return new Promise((resolve) => {
        const image = new Image();
        image.decoding = "async";
        const finish = (value) => {
          clearTimeout(timeout);
          image.onload = image.onerror = null;
          this.cancelLoad = null;
          resolve(value);
        };
        const timeout = setTimeout(() => finish(null), 10000);
        this.cancelLoad = () => finish(null);
        image.onload = () => finish(image.naturalWidth && image.naturalHeight ? image : null);
        image.onerror = () => finish(null);
        image.src = source;
      });
    }

    navigate(step) {
      if (this.photos.length < 2) return;
      setPaused(true);
      this.show((this.index + step + this.photos.length) % this.photos.length, "manual");
    }

    async show(index, reason) {
      if (!this.alive || index < 0) return;
      clearTimeout(this.timer);
      this.cancelLoad?.();
      const request = (this.request || 0) + 1;
      this.request = request;
      this.loading = true;
      this.sync();
      const source = this.photos[index];
      const same = this.ready && this.photos[this.index] === source;
      let image = same ? this.image : null;
      while (this.photos.length && !image) {
        index = Math.min(index, this.photos.length - 1);
        const candidate = this.photos[index];
        image = await this.load(candidate);
        if (!this.alive || request !== this.request) return;
        if (!image) {
          broken.add(candidate);
          this.photos.splice(index, 1);
          this.drawThumbnails();
        }
      }
      if (!this.alive || request !== this.request) return;
      this.loading = false;
      if (reason === "auto" && (!this.canMove() || paused || document.querySelector("dialog[open]")
        || !this.onScreen || this.hovered || (this.focused && !this.focusPlayback))) { this.sync(); return; }
      if (!image) {
        this.image.hidden = true;
        this.empty.hidden = false;
        this.ready = false;
        this.sync();
        return;
      }
      this.finishTransition();
      if (this.ready && !same && reason !== "initial" && this.canMove() && typeof this.image.animate === "function") {
        this.outgoing = this.image.cloneNode();
        this.outgoing.classList.remove("couple-image");
        delete this.outgoing.dataset.galleryImage;
        this.outgoing.classList.add("gallery-outgoing");
        this.outgoing.alt = "";
        this.outgoing.setAttribute("aria-hidden", "true");
        this.viewer.append(this.outgoing);
        this.transition = this.outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: "ease-in-out" });
        this.transition.onfinish = () => this.finishTransition();
      }
      if (!same) {
        image.className = this.image.className;
        image.dataset.galleryImage = "";
        image.width = image.naturalWidth;
        image.height = image.naturalHeight;
        this.image.replaceWith(image);
        this.image = image;
      }
      this.image.hidden = false;
      this.empty.hidden = true;
      this.index = index;
      this.ready = true;
      selected = this.photos[index];
      this.updatePosition(reason === "manual");
      this.sync();
    }

    destroy() {
      this.alive = false;
      this.request = (this.request || 0) + 1;
      clearTimeout(this.timer);
      this.cancelLoad?.();
      this.finishTransition();
      this.observer?.disconnect();
      this.events.abort();
    }
  }

  function mount(scope = document) {
    for (const container of scope.querySelectorAll("[data-photo-gallery]")) {
      if (!galleries.has(container)) galleries.set(container, new Gallery(container));
    }
  }

  window.LovePhotos = Object.freeze({
    mount,
    unmount(scope) {
      for (const [container, gallery] of galleries) {
        if (scope.contains(container)) { gallery.destroy(); galleries.delete(container); }
      }
    },
    setMotion(enabled) {
      motion = enabled;
      for (const gallery of galleries.values()) gallery.sync();
    },
  });
  const sync = () => { for (const gallery of galleries.values()) gallery.sync(); };
  const dialogs = new MutationObserver(sync);
  for (const dialog of document.querySelectorAll("dialog")) dialogs.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  reducedMotion.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", () => { suspended = true; sync(); });
  window.addEventListener("pageshow", () => { suspended = false; sync(); });
  mount();
})();
