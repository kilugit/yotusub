(async () => {
  if (window.ytsubLoaded) return;
  window.ytsubLoaded = true;

  const settings = { fontSize: 22, font: "Roboto, Arial, sans-serif", color: "#ffffff", background: 60, position: "bottom", outline: true };
  const controller = new AbortController();
  const { signal } = controller;
  const style = document.createElement("style");
  let enabled = true;
  let cues = [];
  let raw = "";
  let name = "";
  let offset = 0;
  let videoId = null;
  let shown = "";
  let player, video, box, toast, overlay, toastTimer, saveTimer;
  let validStart = 0, validEnd = 0, lastAd = false;
  const invalidate = () => { validStart = 0; validEnd = 0; };

  style.textContent = `
    #ytsub-text {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      z-index: 50;
      width: max-content;
      max-width: 85%;
      padding: 0.2em 0.6em;
      border-radius: 6px;
      font-size: var(--size);
      line-height: 1.35;
      text-align: center;
      white-space: pre-line;
      cursor: grab;
      user-select: text;
    }
    #ytsub-text:active { cursor: grabbing; }
    #ytsub-text.bottom { bottom: 70px; transition: bottom 0.2s; }
    .ytp-autohide #ytsub-text.bottom { bottom: 30px; }
    #ytsub-text.top { top: 8%; }
    #ytsub-text.outline { text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 2px rgba(0, 0, 0, 0.8); }
    .ytp-fullscreen #ytsub-text { font-size: calc(var(--size) * 1.5); }
    #ytsub-toast {
      position: absolute;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      padding: 8px 16px;
      border-radius: 999px;
      background: rgba(15, 15, 15, 0.9);
      color: #fff;
      font: 500 14px Roboto, Arial, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    }
    #ytsub-toast.show { opacity: 1; }
    #ytsub-drop {
      position: absolute;
      inset: 12px;
      z-index: 1000;
      display: none;
      place-items: center;
      border: 2px dashed #fff;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      font: 500 20px Roboto, Arial, sans-serif;
      pointer-events: none;
    }
    #ytsub-drop.show { display: grid; }
    .html5-video-player:has(#ytsub-text:not([hidden])) .ytp-caption-window-container { display: none !important; }
  `;
  document.head.append(style);

  const currentVideoId = () =>
    new URLSearchParams(location.search).get("v") ||
    location.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1] ||
    "";

  function check() {
    if (!chrome.runtime?.id) return teardown();
    const p = document.getElementById("movie_player") ?? document.querySelector(".html5-video-player");
    if (p && (p !== player || !box?.isConnected)) mount(p);
    const v = player?.querySelector("video");
    if (v && v !== video) attach(v);
    const id = currentVideoId();
    if (id !== videoId) onVideoChange(id);
  }

  function mount(p) {
    document.querySelectorAll("#ytsub-text, #ytsub-toast, #ytsub-drop").forEach((el) => el.remove());
    player = p;
    box = Object.assign(document.createElement("div"), { id: "ytsub-text", hidden: true });
    toast = Object.assign(document.createElement("div"), { id: "ytsub-toast" });
    overlay = Object.assign(document.createElement("div"), { id: "ytsub-drop", textContent: "Drop subtitle file" });
    player.append(box, toast, overlay);

    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      box.setPointerCapture(e.pointerId);
      box.style.userSelect = "none";
      const r = box.getBoundingClientRect();
      const p = player.getBoundingClientRect();
      const dx = e.clientX - r.left + p.left;
      const dy = e.clientY - r.top + p.top;
      const bw = box.offsetWidth;
      const bh = box.offsetHeight;
      box.onpointermove = (ev) => {
        const nx = Math.max(0, Math.min(p.width - bw, ev.clientX - dx));
        const ny = Math.max(0, Math.min(p.height - bh, ev.clientY - dy));
        box.style.left = `${((nx / p.width) * 100).toFixed(2)}%`;
        box.style.top = `${((ny / p.height) * 100).toFixed(2)}%`;
        box.style.bottom = "auto";
        box.style.transform = "none";
      };
    });
    const stopDrag = () => {
      box.style.userSelect = "";
      box.onpointermove = null;
    };
    box.addEventListener("pointerup", stopDrag);
    box.addEventListener("pointercancel", stopDrag);
    box.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      resetPosition();
    });

    shown = null;
    invalidate();
    applyStyle();
    update();
  }

  function attach(v) {
    video = v;
    const onFrame = () => {
      if (video !== v) return;
      update();
      v.requestVideoFrameCallback(onFrame);
    };
    if ("requestVideoFrameCallback" in v) v.requestVideoFrameCallback(onFrame);
    v.addEventListener("timeupdate", update, { signal });
    v.addEventListener("seeked", update, { signal });
  }

  async function onVideoChange(id) {
    videoId = id;
    load();
    resetPosition();
    const key = `ytsub:${id}`;
    const saved = id && (await chrome.storage.local.get(key))[key];
    if (saved && id === videoId) {
      load(saved.content, saved.name, saved.offset);
      showToast(`Restored ${saved.name}`);
    }
    chrome.runtime.sendMessage({ type: "changed" }).catch(() => {});
  }

  function load(content = "", fileName = "", startOffset = 0) {
    cues = parseSubtitles(content);
    raw = content;
    name = fileName;
    offset = startOffset;
    shown = null;
    invalidate();
    update();
  }

  function loadFile(content, fileName) {
    load(content, fileName);
    if (!cues.length) return showToast(`No subtitles found in ${fileName}`);
    save();
    showToast(`Loaded ${fileName}`);
  }

  function save() {
    if (!videoId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const key = `ytsub:${videoId}`;
      if (raw) chrome.storage.local.set({ [key]: { name, content: raw, offset } });
      else chrome.storage.local.remove(key);
    }, 300);
  }

  function shift(delta) {
    if (!raw) return showToast("No subtitles loaded");
    offset = delta ? Math.round((offset + delta) * 10) / 10 : 0;
    invalidate();
    update();
    save();
    showToast(offset ? `Subtitles ${Math.abs(offset).toFixed(1)}s ${offset > 0 ? "later" : "earlier"}` : "Subtitles in sync");
  }

  function resize(step) {
    const fontSize = Math.min(48, Math.max(12, settings.fontSize + step));
    chrome.storage.sync.set({ settings: { ...settings, fontSize } });
    showToast(`Text size ${fontSize}px`);
  }

  function update() {
    if (!box) return;
    const isAd = Boolean(player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting") || player.getElementsByClassName("ytp-ad-player-overlay").length));
    const t = video ? video.currentTime - offset : 0;

    let vStart = 0;
    let vEnd = Infinity;
    const active = [];

    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      if (c.start <= t) {
        if (t < c.end) {
          active.push(c);
          if (c.end < vEnd) vEnd = c.end;
        } else if (c.end > vStart) {
          vStart = c.end;
        }
        if (c.start > vStart) vStart = c.start;
      } else {
        if (c.start < vEnd) vEnd = c.start;
        break;
      }
    }

    const primary = active[0];
    let opacity = 1;
    let fading = false;
    if (primary?.fad) {
      const [tin, tout] = primary.fad;
      const dtIn = (t - primary.start) * 1000;
      const dtOut = (primary.end - t) * 1000;
      if (tin > 0 && dtIn < tin) {
        opacity = Math.max(0, Math.min(1, dtIn / tin));
        fading = true;
      } else if (tout > 0 && dtOut < tout) {
        opacity = Math.max(0, Math.min(1, dtOut / tout));
        fading = true;
      }
    }

    if (!fading && isAd === lastAd && t >= validStart && t < validEnd) return;
    lastAd = isAd;

    if (!enabled || isAd) {
      validStart = 0;
      validEnd = isAd ? t + 1 : Infinity;
      if (shown !== "") {
        shown = "";
        box.hidden = true;
        box.textContent = "";
        applyStyle();
      }
      return;
    }

    validStart = fading ? 0 : vStart;
    validEnd = fading ? 0 : vEnd;

    if (!active.length) {
      if (shown !== "") {
        shown = "";
        box.hidden = true;
        box.textContent = "";
        applyStyle();
      }
      return;
    }

    box.style.opacity = opacity;

    const text = active.map((c) => c.text).join("\n");
    if (text === shown) return;
    shown = text;
    box.hidden = !text;

    if (primary?.style) {
      const s = primary.style;
      box.style.background = "transparent";
      box.style.color = s.color || settings.color;
      box.style.fontFamily = s.font ? `"${s.font}", ${settings.font}` : settings.font;
      const h = player?.offsetHeight || 720;
      const sz = s.size ? (s.playResY ? (s.size / s.playResY) * h : s.size) : settings.fontSize;
      box.style.fontSize = `${sz.toFixed(1)}px`;
      box.style.fontWeight = s.bold ? "bold" : "";
      box.style.fontStyle = s.italic ? "italic" : "";
      const blur = primary.blur ? `${primary.blur}px` : "0px";
      const o = s.outline || 0;
      const shadows = [];
      if (o > 0) {
        for (const dx of [-o, 0, o]) {
          for (const dy of [-o, 0, o]) {
            if (dx || dy) shadows.push(`${dx}px ${dy}px ${blur} ${s.outlineColor || "#000"}`);
          }
        }
      } else if (primary.blur) {
        shadows.push(`0 0 ${blur} ${s.outlineColor || "#000"}`);
      }
      if (s.shadow > 0) {
        shadows.push(`${s.shadow}px ${s.shadow}px ${blur} rgba(0,0,0,0.6)`);
      }
      box.style.textShadow = shadows.join(", ");
      box.classList.remove("outline");
    } else {
      applyStyle();
    }

    if (text) {
      if (text.includes("<")) box.replaceChildren(format(text));
      else box.textContent = text;
    } else {
      box.textContent = "";
    }
  }

  function format(text) {
    const root = document.createDocumentFragment();
    const stack = [root];
    for (const part of text.split(/(<[^>]+>)/)) {
      if (!part) continue;
      const close = /^<\/(\w+)>$/i.exec(part);
      if (close) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const open = /^<(\w+)([^>]*)>$/i.exec(part);
      if (open) {
        const el = document.createElement(open[1].toLowerCase());
        const styleMatch = /style="([^"]*)"/i.exec(open[2]);
        if (styleMatch) el.setAttribute("style", styleMatch[1]);
        stack[stack.length - 1].append(el);
        if (!/^(br|hr|img)$/i.test(open[1])) stack.push(el);
      } else {
        stack[stack.length - 1].append(part);
      }
    }
    return root;
  }

  function applyStyle() {
    if (!box) return;
    box.className = settings.position + (settings.outline ? " outline" : "");
    box.style.setProperty("--size", `${settings.fontSize}px`);
    box.style.fontSize = "";
    box.style.color = settings.color;
    box.style.fontFamily = settings.font;
    box.style.textShadow = "";
    box.style.fontWeight = "";
    box.style.fontStyle = "";
    box.style.opacity = "";
    box.style.background = `rgba(0, 0, 0, ${settings.background / 100})`;
  }

  function resetPosition() {
    if (box) Object.assign(box.style, { left: "", top: "", bottom: "", transform: "" });
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
  }

  function teardown() {
    clearInterval(timer);
    clearTimeout(toastTimer);
    clearTimeout(saveTimer);
    controller.abort();
    video = null;
    [style, box, toast, overlay].forEach((el) => el?.remove());
  }

  function seekCue(dir) {
    if (!video || !cues.length) return;
    const t = video.currentTime - offset;
    let target;
    if (dir > 0) {
      target = cues.find((c) => c.start > t + 0.1);
    } else {
      for (let i = cues.length - 1; i >= 0; i--) {
        if (cues[i].start < t - 0.5) { target = cues[i]; break; }
      }
      if (!target) target = cues[0];
    }
    if (target) {
      video.currentTime = Math.max(0, target.start + offset);
      update();
      const m = Math.floor(target.start / 60);
      const s = String(Math.floor(target.start % 60)).padStart(2, "0");
      showToast(`Cue at ${m}:${s}`);
    }
  }

  const shortcuts = {
    KeyT: () => chrome.storage.sync.set({ enabled: !enabled }),
    BracketLeft: (s) => shift(s ? -1.0 : -0.1),
    BracketRight: (s) => shift(s ? 1.0 : 0.1),
    Backslash: () => shift(0),
    ArrowUp: () => resize(2),
    ArrowDown: () => resize(-2),
    KeyP: () => seekCue(-1),
    KeyN: () => seekCue(1),
  };

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === "load") loadFile(message.content, message.name);
    if (message.type === "unload") {
      load();
      save();
      showToast("Subtitles removed");
    }
    if (message.type === "shift") shift(message.delta);
    if (message.type === "setOffset") {
      if (!raw) return showToast("No subtitles loaded");
      offset = Math.round(message.offset * 10) / 10;
      invalidate();
      update();
      save();
      showToast(offset ? `Subtitles ${Math.abs(offset).toFixed(1)}s ${offset > 0 ? "later" : "earlier"}` : "Subtitles in sync");
    }
    if (message.type === "seek" && video) {
      video.currentTime = message.time;
      update();
    }
    if (message.type === "time") {
      reply({ currentTime: video?.currentTime || 0, offset });
      return;
    }
    reply({ videoId, name, offset, cues, currentTime: video?.currentTime || 0 });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.settings) {
      Object.assign(settings, changes.settings.newValue);
      applyStyle();
    }
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      invalidate();
      update();
      showToast(enabled ? "Subtitles on" : "Subtitles off");
    }
  });

  const stored = await chrome.storage.sync.get(["settings", "enabled"]);
  Object.assign(settings, stored.settings);
  enabled = stored.enabled !== false;
  applyStyle();
  update();

  document.addEventListener(
    "keydown",
    (e) => {
      const action = e.altKey && !e.ctrlKey && !e.metaKey && shortcuts[e.code];
      if (!action || e.target.closest?.("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      action(e.shiftKey);
    },
    { signal }
  );

  document.addEventListener(
    "dragover",
    (e) => {
      if (!player?.contains(e.target) || !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      overlay.classList.add("show");
    },
    { signal }
  );

  document.addEventListener(
    "dragleave",
    (e) => {
      if (!player?.contains(e.relatedTarget)) overlay?.classList.remove("show");
    },
    { signal }
  );

  document.addEventListener(
    "drop",
    async (e) => {
      const file = e.dataTransfer.files[0];
      if (!file || !player?.contains(e.target)) return;
      e.preventDefault();
      overlay.classList.remove("show");
      loadFile(await file.text(), file.name);
    },
    { signal }
  );

  document.addEventListener("yt-navigate-finish", check, { signal });
  const timer = setInterval(check, 1000);
  check();
})();
