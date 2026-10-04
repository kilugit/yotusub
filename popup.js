(() => {
  let cues = [];
  let settings = { fontSize: 22, font: "Roboto, Arial, sans-serif", color: "#ffffff", background: 60, position: "bottom", outline: true };

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
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function renderCues(filter = "") {
    const list = $("cuesList");
    const q = filter.trim().toLowerCase();
    const matches = cues.filter((c) => !q || c.text.toLowerCase().includes(q));

    if (!cues.length) {
      list.innerHTML = `<div class="empty-msg">No subtitles loaded</div>`;
      return;
    }
    if (!matches.length) {
      list.innerHTML = `<div class="empty-msg">No matching dialogue</div>`;
      return;
    }

    list.innerHTML = matches
      .slice(0, 80)
      .map(
        (c) =>
          `<div class="cue-row" data-time="${c.start}">
            <span class="cue-time">${formatTime(c.start)}</span>
            <span class="cue-text">${c.text.replace(/<[^>]*>/g, "").replace(/\n/g, " ")}</span>
          </div>`
      )
      .join("");
  }

  function updateStatus(res) {
    if (!res) return;
    cues = res.cues || [];
    const hasSubs = Boolean(res.name && cues.length);

    $("loadedCard").style.display = hasSubs ? "block" : "none";
    $("uploadCard").style.display = hasSubs ? "none" : "block";

    if (hasSubs) {
      $("fileName").textContent = res.name;
      $("fileMeta").textContent = `${cues.length} cues`;
    }

    const off = res.offset || 0;
    $("syncVal").textContent = off ? `${off > 0 ? "+" : ""}${off.toFixed(1)}s` : "0.0s";
    $("syncVal").style.color = off ? "var(--red)" : "var(--green)";

    renderCues($("searchInput").value);
  }

  function applySettings() {
    $("sizeRange").value = settings.fontSize;
    $("sizeVal").textContent = `${settings.fontSize}px`;
    $("bgRange").value = settings.background;
    $("bgVal").textContent = `${settings.background}%`;
    $("outlineCheck").checked = settings.outline;

    $$(".swatch").forEach((s) => s.classList.toggle("active", s.dataset.color === settings.color));
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.pos === settings.position));

    const preview = $("preview");
    preview.className = "preview-box" + (settings.outline ? " outline" : "");
    preview.style.fontSize = `${settings.fontSize}px`;
    preview.style.color = settings.color;
    preview.style.background = `rgba(0, 0, 0, ${settings.background / 100})`;
  }

  function saveSettings() {
    applySettings();
    chrome.storage.sync.set({ settings });
  }

  // Navigation
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach((b) => b.classList.remove("active"));
      $$(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
    });
  });

  // Power toggle
  $("powerToggle").addEventListener("change", (e) => {
    chrome.storage.sync.set({ enabled: e.target.checked });
  });

  // File loading
  $("dropBox").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const content = await file.text();
      updateStatus(await send({ type: "load", content, name: file.name }));
    }
  });

  // Drag & drop onto popup
  $("dropBox").addEventListener("dragover", (e) => {
    e.preventDefault();
    $("dropBox").classList.add("dragover");
  });
  $("dropBox").addEventListener("dragleave", () => $("dropBox").classList.remove("dragover"));
  $("dropBox").addEventListener("drop", async (e) => {
    e.preventDefault();
    $("dropBox").classList.remove("dragover");
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const content = await file.text();
      updateStatus(await send({ type: "load", content, name: file.name }));
    }
  });

  // URL fetch
  $("fetchBtn").addEventListener("click", async () => {
    const url = $("urlInput").value.trim();
    if (!url) return;
    try {
      $("fetchBtn").textContent = "...";
      const res = await fetch(url);
      const content = await res.text();
      const name = url.split("/").pop().split("?")[0] || "subtitles.srt";
      updateStatus(await send({ type: "load", content, name }));
      $("urlInput").value = "";
    } catch {
      alert("Failed to load subtitle from URL");
    } finally {
      $("fetchBtn").textContent = "Load";
    }
  });

  // Unload
  $("unloadBtn").addEventListener("click", async () => {
    updateStatus(await send({ type: "unload" }));
  });

  // Sync buttons
  $$(".sync-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const delta = parseFloat(btn.dataset.delta);
      updateStatus(await send({ type: "shift", delta }));
    });
  });

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

  // Dialogue search & seek
  $("searchInput").addEventListener("input", (e) => renderCues(e.target.value));
  $("cuesList").addEventListener("click", (e) => {
    const row = e.target.closest(".cue-row");
    if (row?.dataset.time) send({ type: "seek", time: parseFloat(row.dataset.time) });
  });

  // Status updates & initial load
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "changed") send({ type: "status" }).then(updateStatus);
  });

  chrome.storage.sync.get(["enabled", "settings"]).then((data) => {
    if (data.enabled !== undefined) $("powerToggle").checked = data.enabled;
    if (data.settings) Object.assign(settings, data.settings);
    applySettings();
  });

  send({ type: "status" }).then(updateStatus);
})();
