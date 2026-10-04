(async () => {
  let cues = [];
  let settings = { fontSize: 22, font: "Roboto, Arial, sans-serif", color: "#ffffff", background: 60, position: "bottom", outline: true };
  let lastCurrentTime = 0;
  let lastOffset = 0;

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  async function send(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      if (tab.url?.includes("youtube.com")) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["srt-parser.js", "content.js"],
        });
        return await chrome.tabs.sendMessage(tab.id, message).catch(() => null);
      }
      return null;
    }
  }

  function formatTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  }

  function highlight(text, q) {
    if (!q) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
  }

  function renderCues(filter = "") {
    const list = $("cuesList");
    if (!cues.length) {
      list.innerHTML = `<div class="empty-msg">No subtitles loaded</div>`;
      return;
    }
    const q = filter.trim().toLowerCase();
    const matches = [];
    for (let i = 0; i < cues.length && matches.length < 500; i++) {
      const c = cues[i];
      if (!q || c.text.toLowerCase().includes(q)) matches.push(c);
    }

    if (!matches.length) {
      list.innerHTML = `<div class="empty-msg">No matching dialogue</div>`;
      return;
    }

    const activeTime = lastCurrentTime - lastOffset;
    list.innerHTML = matches
      .map((c) => {
        const isActive = c.start <= activeTime && activeTime < c.end;
        const clean = c.text.replace(/<[^>]*>/g, "").replace(/\n/g, " ");
        return `<div class="cue-row ${isActive ? "active" : ""}" data-start="${c.start}" data-end="${c.end}" data-time="${c.start}">
          <span class="cue-time" title="Seek to this time">${formatTime(c.start)}</span>
          <span class="cue-text">${q ? highlight(clean, q) : clean}</span>
          <button class="cue-sync-btn" data-time="${c.start}" title="Sync subtitle so this line plays now">⚡</button>
        </div>`;
      })
      .join("");

    const activeRow = list.querySelector(".cue-row.active");
    if (activeRow && !filter) {
      activeRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function updateActiveCue() {
    const list = $("cuesList");
    const activeTime = lastCurrentTime - lastOffset;
    const currentActive = list.querySelector(".cue-row.active");
    if (currentActive) {
      const s = +currentActive.dataset.start;
      const e = +currentActive.dataset.end;
      if (s <= activeTime && activeTime < e) return;
      currentActive.classList.remove("active");
    }
    for (const row of list.children) {
      if (row.dataset.start) {
        const start = +row.dataset.start;
        const end = +row.dataset.end;
        if (start <= activeTime && activeTime < end) {
          row.classList.add("active");
          if (!$("searchInput").value) {
            row.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
          break;
        }
      }
    }
  }

  function updateStatus(res) {
    const hasVideo = Boolean(res);
    $("noVideoMsg").style.display = hasVideo ? "none" : "block";
    if (!res) return;

    cues = res.cues || [];
    lastCurrentTime = res.currentTime || 0;
    lastOffset = res.offset || 0;
    const hasSubs = Boolean(res.name && cues.length);

    $("loadedCard").style.display = hasSubs ? "block" : "none";
    $("uploadCard").style.display = hasSubs ? "none" : "block";

    if (hasSubs) {
      $("fileName").textContent = res.name;
      $("fileMeta").textContent = `${cues.length} cues`;
    }

    const off = res.offset || 0;
    $("syncInput").value = off.toFixed(1);
    $("syncInput").style.color = off ? "var(--red)" : "var(--green)";

    renderCues($("searchInput").value);
  }

  function applySettings() {
    $("sizeRange").value = settings.fontSize;
    $("sizeVal").textContent = `${settings.fontSize}px`;
    $("bgRange").value = settings.background;
    $("bgVal").textContent = `${settings.background}%`;
    $("outlineCheck").checked = settings.outline;
    if ($("fontSelect")) $("fontSelect").value = settings.font;

    $$(".swatch").forEach((s) => s.classList.toggle("active", s.dataset.color === settings.color));
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.pos === settings.position));

    const preview = $("preview");
    preview.className = "preview-box" + (settings.outline ? " outline" : "");
    preview.style.fontSize = `${settings.fontSize}px`;
    preview.style.color = settings.color;
    preview.style.fontFamily = settings.font;
    preview.style.background = `rgba(0, 0, 0, ${settings.background / 100})`;
  }

  let saveTimer;
  function saveSettings() {
    applySettings();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.sync.set({ settings }), 200);
  }

  // Navigation
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach((b) => b.classList.remove("active"));
      $$(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "tab-cues") renderCues($("searchInput").value);
    });
  });

  // Power toggle
  $("powerToggle").addEventListener("change", (e) => {
    chrome.storage.sync.set({ enabled: e.target.checked });
  });

  // File loading
  $("dropBox").addEventListener("click", () => $("fileInput").click());
  $("replaceBtn")?.addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const content = await file.text();
      updateStatus(await send({ type: "load", content, name: file.name }));
    }
  });

  // Drag & drop onto popup
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    $("dropBox")?.classList.add("dragover");
  });
  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) $("dropBox")?.classList.remove("dragover");
  });
  document.addEventListener("drop", async (e) => {
    e.preventDefault();
    $("dropBox")?.classList.remove("dragover");
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const content = await file.text();
      updateStatus(await send({ type: "load", content, name: file.name }));
    }
  });

  // URL fetch or raw SRT text
  $("fetchBtn").addEventListener("click", async () => {
    const val = $("urlInput").value.trim();
    if (!val) return;
    if (val.includes("-->") || val.includes("[Events]") || /(?:^|\r?\n)\s*Dialogue\s*:/i.test(val)) {
      updateStatus(await send({ type: "load", content: val, name: val.includes("-->") ? "pasted.srt" : "pasted.ass" }));
      $("urlInput").value = "";
      return;
    }
    try {
      $("fetchBtn").textContent = "...";
      const res = await fetch(val);
      const content = await res.text();
      const name = val.split("/").pop().split("?")[0] || "subtitles.srt";
      updateStatus(await send({ type: "load", content, name }));
      $("urlInput").value = "";
    } catch {
      alert("Failed to load subtitle from URL");
    } finally {
      $("fetchBtn").textContent = "Load";
    }
  });

  // Copy, Unload & Export
  $("copyBtn")?.addEventListener("click", async () => {
    if (!cues.length) return;
    const text = cues
      .map((c) => `[${formatTime(c.start)}] ${c.text.replace(/<[^>]*>/g, "").replace(/\n/g, " ")}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    const btn = $("copyBtn");
    btn.textContent = "✓";
    setTimeout(() => (btn.textContent = "📋"), 1200);
  });

  $("unloadBtn").addEventListener("click", async () => {
    updateStatus(await send({ type: "unload" }));
  });

  $("exportBtn")?.addEventListener("click", () => {
    if (!cues.length) return;
    const toSrtTime = (s) => {
      const totalMs = Math.round(Math.max(0, s) * 1000);
      const ms = String(totalMs % 1000).padStart(3, "0");
      const totalSec = Math.floor(totalMs / 1000);
      const sec = String(totalSec % 60).padStart(2, "0");
      const m = String(Math.floor(totalSec / 60) % 60).padStart(2, "0");
      const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
      return `${h}:${m}:${sec},${ms}`;
    };
    const content = cues
      .map((c, i) => `${i + 1}\n${toSrtTime(c.start + lastOffset)} --> ${toSrtTime(c.end + lastOffset)}\n${c.text}\n`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: ($("fileName").textContent || "subtitles").replace(/\.[^.]+$/, "") + "_synced.srt",
    });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Sync buttons & direct input
  $$(".sync-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const delta = parseFloat(btn.dataset.delta);
      updateStatus(await send({ type: "shift", delta }));
    });
  });

  const onSyncInput = async (e) => {
    const offset = parseFloat(e.target.value) || 0;
    updateStatus(await send({ type: "setOffset", offset }));
  };
  $("syncInput").addEventListener("input", onSyncInput);
  $("syncInput").addEventListener("change", onSyncInput);

  // Style inputs
  $("sizeRange").addEventListener("input", (e) => {
    settings.fontSize = +e.target.value;
    saveSettings();
  });
  $("bgRange").addEventListener("input", (e) => {
    settings.background = +e.target.value;
    saveSettings();
  });
  $("outlineCheck").addEventListener("change", (e) => {
    settings.outline = e.target.checked;
    saveSettings();
  });
  $("fontSelect")?.addEventListener("change", (e) => {
    settings.font = e.target.value;
    saveSettings();
  });
  $$(".swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      settings.color = swatch.dataset.color;
      saveSettings();
    });
  });
  $$(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.position = btn.dataset.pos;
      saveSettings();
    });
  });

  // Dialogue search, seek & cue sync
  let searchTimer;
  $("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderCues(e.target.value), 120);
  });
  $("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchTimer);
      renderCues(e.target.value);
      const first = $("cuesList").querySelector(".cue-row");
      if (first?.dataset.time) send({ type: "seek", time: parseFloat(first.dataset.time) });
    }
  });

  $("cuesList").addEventListener("click", async (e) => {
    const syncBtn = e.target.closest(".cue-sync-btn");
    if (syncBtn?.dataset.time) {
      e.stopPropagation();
      const targetTime = parseFloat(syncBtn.dataset.time);
      const res = await send({ type: "status" });
      if (res?.currentTime !== undefined) {
        const newOffset = Math.round((res.currentTime - targetTime) * 10) / 10;
        updateStatus(await send({ type: "setOffset", offset: newOffset }));
      }
      return;
    }
    const row = e.target.closest(".cue-row");
    if (row?.dataset.time) send({ type: "seek", time: parseFloat(row.dataset.time) });
  });

  // Periodic active cue tracking
  setInterval(async () => {
    if ($("tab-cues").classList.contains("active") && cues.length) {
      const res = await send({ type: "time" });
      if (res && Math.abs((res.currentTime || 0) - lastCurrentTime) > 0.4) {
        lastCurrentTime = res.currentTime || 0;
        lastOffset = res.offset || 0;
        updateActiveCue();
      }
    }
  }, 800);

  // Status updates & initial load
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "changed") updateStatus(await send({ type: "status" }));
  });

  const [data, status] = await Promise.all([
    chrome.storage.sync.get(["enabled", "settings"]),
    send({ type: "status" }),
  ]);
  if (data?.enabled !== undefined) $("powerToggle").checked = data.enabled;
  if (data?.settings) Object.assign(settings, data.settings);
  applySettings();
  updateStatus(status);
})();
