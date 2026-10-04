(() => {
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
  let player, video, box, toast, overlay, toastTimer;

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
      cursor: move;
      user-select: none;
    }
    #ytsub-text.bottom { bottom: 70px; transition: bottom 0.2s; }
    .ytp-autohide #ytsub-text.bottom { bottom: 30px; }
    #ytsub-text.top { top: 8%; }
    #ytsub-text.outline { text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; }
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
      const r = box.getBoundingClientRect();
      const p = player.getBoundingClientRect();
      const dx = e.clientX - r.left + p.left;
      const dy = e.clientY - r.top + p.top;
      box.onpointermove = (ev) =>
        Object.assign(box.style, { left: `${ev.clientX - dx}px`, top: `${ev.clientY - dy}px`, bottom: "auto", transform: "none" });
    });
    box.addEventListener("pointerup", () => (box.onpointermove = null));
    box.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      resetPosition();
    });

    shown = null;
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
    update();
  }

  function loadFile(content, fileName) {
    if (!parseSubtitles(content).length) return showToast(`No subtitles found in ${fileName}`);
    load(content, fileName);
    save();
    showToast(`Loaded ${fileName}`);
  }

  function save() {
    if (!videoId) return;
    const key = `ytsub:${videoId}`;
    if (raw) chrome.storage.local.set({ [key]: { name, content: raw, offset } });
    else chrome.storage.local.remove(key);
  }

  function shift(delta) {
    if (!raw) return showToast("No subtitles loaded");
    offset = delta ? Math.round((offset + delta) * 10) / 10 : 0;
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
    const t = video ? video.currentTime - offset : 0;
    const active = enabled && !player.classList.contains("ad-showing") ? cues.filter((c) => c.start <= t && t < c.end) : [];
    const text = [...new Set(active.map((c) => c.text))].join("\n");
    if (text === shown) return;
    shown = text;
    box.hidden = !text;
    box.replaceChildren(format(text));
  }

  function format(text) {
    const root = document.createDocumentFragment();
    const stack = [root];
    for (const part of text.split(/(<\/?[biu]>)/i)) {
      const tag = /^<(\/?)([biu])>$/i.exec(part);
      if (!tag) stack.at(-1).append(part);
      else if (!tag[1]) stack.push(stack.at(-1).appendChild(document.createElement(tag[2])));
      else if (stack.length > 1) stack.pop();
    }
    return root;
  }

  function applyStyle() {
    if (!box) return;
    box.className = settings.position + (settings.outline ? " outline" : "");
    box.style.setProperty("--size", `${settings.fontSize}px`);
    box.style.color = settings.color;
    box.style.fontFamily = settings.font;
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
    controller.abort();
    video = null;
    [style, box, toast, overlay].forEach((el) => el?.remove());
  }

  const shortcuts = {
    KeyT: () => chrome.storage.sync.set({ enabled: !enabled }),
    BracketLeft: () => shift(-0.1),
    BracketRight: () => shift(0.1),
    Backslash: () => shift(0),
    ArrowUp: () => resize(2),
    ArrowDown: () => resize(-2),
  };

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === "load") loadFile(message.content, message.name);
    if (message.type === "unload") {
      load();
      save();
      showToast("Subtitles removed");
    }
    if (message.type === "shift") shift(message.delta);
    if (message.type === "seek" && video) {
      video.currentTime = message.time;
      update();
    }
    reply({ videoId, name, offset, cues });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.settings) {
      Object.assign(settings, changes.settings.newValue);
      applyStyle();
    }
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      update();
      showToast(enabled ? "Subtitles on" : "Subtitles off");
    }
  });

  chrome.storage.sync.get(["settings", "enabled"]).then((stored) => {
    Object.assign(settings, stored.settings);
    enabled = stored.enabled !== false;
    applyStyle();
    update();
  });

  document.addEventListener(
    "keydown",
    (e) => {
      const action = e.altKey && !e.ctrlKey && !e.metaKey && shortcuts[e.code];
      if (!action || e.target.closest?.("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      action();
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
