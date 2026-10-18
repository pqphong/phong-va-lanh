(function () {
  "use strict";

  const button = document.getElementById("music-toggle");
  const label = document.getElementById("music-label");
  const icon = document.getElementById("music-icon");
  const status = document.getElementById("music-status");
  const slider = document.getElementById("music-volume");
  const volumeValue = document.getElementById("music-volume-value");
  const player = document.querySelector(".music-player");
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  let audio;
  let master;
  let source;
  let song;
  let busy = false;
  let leaving = false;
  let volume = 30;

  try {
    const stored = localStorage.getItem("phong-lanh-music-volume");
    if (stored !== null && stored.trim() !== "" && Number.isFinite(Number(stored))) {
      volume = Math.min(100, Math.max(0, Math.round(Number(stored))));
    }
  } catch { /* Playback must also work when browser storage is blocked. */ }
  slider.value = String(volume);
  volumeValue.value = `${volume}%`;

  function createSong(context) {
    const rate = 11025;
    const beat = 60 / 72;
    const bars = [
      { chord: [48, 55, 60, 64], melody: [[76, 0, 1], [79, 1, 0.5], [76, 1.5, 0.5], [74, 2, 1]] },
      { chord: [45, 52, 57, 60], melody: [[72, 0, 1.5], [76, 1.5, 0.5], [69, 2, 1]] },
      { chord: [41, 48, 53, 57], melody: [[69, 0, 1], [72, 1, 1], [77, 2, 1]] },
      { chord: [43, 50, 55, 59], melody: [[74, 0, 2], [71, 2, 0.5]] },
      { chord: [48, 55, 60, 64], melody: [[76, 0, 1.5], [79, 1.5, 0.5], [81, 2, 1]] },
      { chord: [45, 52, 57, 60], melody: [[79, 0, 1], [76, 1, 1], [72, 2, 1]] },
      { chord: [41, 48, 53, 57], melody: [[74, 0, 1], [72, 1, 0.5], [69, 1.5, 0.5], [72, 2, 1]] },
      { chord: [43, 50, 55, 59], melody: [[71, 0, 2.5]] },
      { chord: [45, 52, 57, 60], melody: [[72, 0, 1], [76, 1, 1], [81, 2, 1]] },
      { chord: [40, 47, 52, 55], melody: [[79, 0, 1.5], [76, 1.5, 0.5], [74, 2, 1]] },
      { chord: [41, 48, 53, 57], melody: [[77, 0, 1], [76, 1, 1], [72, 2, 1]] },
      { chord: [43, 50, 55, 59], melody: [[74, 0, 2], [79, 2, 0.5]] },
      { chord: [48, 55, 60, 64], melody: [[76, 0, 1], [74, 1, 0.5], [72, 1.5, 1.5]] },
      { chord: [41, 48, 53, 57], melody: [[69, 0, 1], [72, 1, 1], [77, 2, 1]] },
      { chord: [43, 50, 55, 59], melody: [[74, 0, 1.5], [71, 1.5, 1.5]] },
      { chord: [48, 55, 60, 64], melody: [[72, 0, 2.5]] },
    ];
    const buffer = context.createBuffer(2, Math.round(bars.length * 3 * beat * rate), rate);
    const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];

    function note(midi, onset, duration, strength, pan) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const start = Math.round(onset * rate);
      const length = Math.round((duration + 1.6) * rate);
      const gains = [Math.sqrt((1 - pan) / 2), Math.sqrt((1 + pan) / 2)];
      for (let sample = 0; sample < length; sample++) {
        const time = sample / rate;
        const phase = 2 * Math.PI * frequency * time;
        const attack = Math.min(1, time / 0.012);
        const release = time > duration ? Math.exp(-(time - duration) * 5) : 1;
        const envelope = attack * Math.exp(-time * 1.35) * release * strength;
        const tone = Math.sin(phase) + 0.3 * Math.sin(phase * 2.001) * Math.exp(-time * 2)
          + 0.1 * Math.sin(phase * 3) * Math.exp(-time * 3);
        const value = tone * envelope;
        for (let channel = 0; channel < 2; channel++) {
          // Wrap the release and echoes into the loop so its seam has no cut-off notes.
          channels[channel][(start + sample) % buffer.length] += value * gains[channel];
          channels[channel][(start + sample + Math.round(rate * 0.23)) % buffer.length] += value * 0.14 * gains[1 - channel];
          channels[channel][(start + sample + Math.round(rate * 0.41)) % buffer.length] += value * 0.07 * gains[channel];
        }
      }
    }

    bars.forEach(({ chord, melody }, bar) => {
      const start = bar * 3 * beat;
      const pattern = [0, 2, 1, 3, 2, 1];
      pattern.forEach((index, step) => note(chord[index], start + step * beat / 2, beat * 1.1, step ? 0.11 : 0.15, -0.25));
      melody.forEach(([pitch, offset, length]) => note(pitch, start + offset * beat + 0.018, length * beat, 0.24, 0.22));
    });
    let peak = 0;
    for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    if (peak) for (const channel of channels) for (let index = 0; index < channel.length; index++) channel[index] *= 0.72 / peak;
    return buffer;
  }

  let wantsPlayback = true;
  const unlockEvents = ["pointerdown", "keydown", "touchstart"];

  function updatePlayer() {
    const playing = audio?.state === "running" && !leaving;
    player.dataset.state = playing ? "playing" : "paused";
    label.textContent = playing ? "Tạm dừng" : "Bật nhạc";
    icon.setAttribute("href", playing ? "#icon-pause" : "#icon-play");
    button.setAttribute("aria-label", playing ? "Tạm dừng nhạc nền" : "Bật nhạc nền");
    if (playing) {
      status.textContent = volume === 0
        ? "Nhạc đang chạy với âm lượng 0%. Tăng âm lượng để nghe."
        : "Đang phát · Một ngày có nhau · lặp lại nhẹ nhàng.";
    } else if (wantsPlayback) {
      status.textContent = "Nhạc sẽ tự phát. Nếu trình duyệt đang chặn âm thanh, chỉ cần chạm vào trang một lần.";
    } else {
      status.textContent = "Nhạc đã tạm dừng. Bấm bật để nghe tiếp.";
    }
  }

  if (!AudioEngine) {
    button.disabled = true;
    slider.disabled = true;
    status.textContent = "Trình duyệt này chưa hỗ trợ nhạc nền. Bạn vẫn xem được toàn bộ trang.";
    return;
  }

  function ensureAudio() {
    if (audio && audio.state !== "closed") return audio;
    audio = new AudioEngine();
    audio.onstatechange = updatePlayer;
    master = audio.createGain();
    master.gain.value = (volume / 100) ** 1.6 * 0.65;
    master.connect(audio.destination);
    source = undefined;
    song = undefined;
    const preparedAudio = audio;
    const prepare = () => {
      if (audio !== preparedAudio || song || preparedAudio.state === "closed") return;
      try { prepareSong(); } catch { /* Playback can retry synthesis inside a later user gesture. */ }
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(prepare, { timeout: 1200 });
    else setTimeout(prepare, 0);
    return audio;
  }

  function prepareSong() {
    if (!song && audio && audio.state !== "closed") song = createSong(audio);
    return song;
  }

  function startSource() {
    if (source || !audio || audio.state !== "running") return;
    source = audio.createBufferSource();
    source.buffer = prepareSong();
    source.loop = true;
    source.connect(master);
    source.start();
  }

  function disarmUnlock() {
    for (const event of unlockEvents) document.removeEventListener(event, unlock, true);
  }

  function armUnlock() {
    for (const event of unlockEvents) document.addEventListener(event, unlock, true);
  }

  async function discardAudio() {
    const failed = audio;
    audio = undefined;
    master = undefined;
    source = undefined;
    song = undefined;
    if (!failed) return;
    failed.onstatechange = null;
    try { await failed.close(); } catch { /* A rejected or closed audio device needs no further cleanup. */ }
  }

  async function startMusic(automatic = false) {
    if (!wantsPlayback || leaving) return false;
    const current = ensureAudio();
    try {
      if (current.state !== "running") await current.resume();
      if (audio !== current || current.state !== "running" || !wantsPlayback || leaving) return false;
      startSource();
      disarmUnlock();
      updatePlayer();
      return true;
    } catch {
      if (audio === current) await discardAudio();
      armUnlock();
      updatePlayer();
      if (!automatic) status.textContent = "Chưa phát được nhạc. Bạn thử bấm bật lại hoặc kiểm tra quyền âm thanh của trình duyệt nhé.";
      return false;
    }
  }

  function unlock(event) {
    if (event.target instanceof Element && event.target.closest("#music-toggle")) return;
    void startMusic(true);
  }

  button.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      if (audio?.state === "running") {
        wantsPlayback = false;
        disarmUnlock();
        await audio.suspend();
      } else {
        wantsPlayback = true;
        armUnlock();
        await startMusic(false);
      }
      updatePlayer();
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  armUnlock();
  void startMusic(true);

  slider.addEventListener("input", () => {
    volume = Number(slider.value);
    volumeValue.value = `${volume}%`;
    if (master) master.gain.setTargetAtTime((volume / 100) ** 1.6 * 0.65, audio.currentTime, 0.08);
    try { localStorage.setItem("phong-lanh-music-volume", String(volume)); } catch { /* Volume changes do not require storage. */ }
    updatePlayer();
  });
  window.addEventListener("pagehide", () => {
    leaving = true;
    if (audio && audio.state !== "closed") audio.suspend().catch(() => {});
    updatePlayer();
  });
  window.addEventListener("pageshow", () => {
    leaving = false;
    updatePlayer();
    if (wantsPlayback) void startMusic(true);
  });
})();
