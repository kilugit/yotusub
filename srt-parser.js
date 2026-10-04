(() => {
  if (globalThis.parseSubtitles) return;

  const TIME_RE = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
  const ENTITY_MAP = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
  const seconds = (m) => (m[1] ? +m[1] * 3600 : 0) + m[2] * 60 + +m[3] + m[4].padEnd(3, "0") / 1000;

  function assColor(str) {
    const m = /&?H?([0-9a-f]{2})?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})&?/i.exec(str || "");
    if (!m) return "";
    const r = parseInt(m[4], 16), g = parseInt(m[3], 16), b = parseInt(m[2], 16);
    const a = m[1] ? (1 - parseInt(m[1], 16) / 255).toFixed(2) : 1;
    return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  }

  function assTextToHtml(raw) {
    let html = "";
    const parts = raw.replace(/\\N/gi, "\n").replace(/\\h/g, " ").split(/(\{[\s\S]*?\})/);
    let curColor = "", curSize = "", curItalic = false, curBold = false;
    for (const part of parts) {
      if (part.startsWith("{") && part.endsWith("}")) {
        const t = part.slice(1, -1);
        const cMatch = /\\(?:c|1c)&?H?([0-9a-f]+)&?/i.exec(t);
        if (cMatch) curColor = assColor(cMatch[1]);
        const sMatch = /\\fs(\d+)/.exec(t);
        if (sMatch) curSize = sMatch[1];
        if (/\\i1\b/.test(t)) curItalic = true;
        if (/\\i0\b/.test(t)) curItalic = false;
        if (/\\b1\b/.test(t)) curBold = true;
        if (/\\b0\b/.test(t)) curBold = false;
      } else if (part) {
        const styles = [];
        if (curColor) styles.push("color:" + curColor);
        if (curSize) styles.push("font-size:" + curSize + "px");
        if (curItalic) styles.push("font-style:italic");
        if (curBold) styles.push("font-weight:bold");
        const escaped = part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html += styles.length ? `<span style="${styles.join(";")}">${escaped}</span>` : escaped;
      }
    }
    return html.trim();
  }

  function cleanText(text) {
    let body = text.replace(/\\N/gi, "\n").replace(/\\h/g, " ");
    if (body.includes("{") || body.includes("<")) {
      body = body.replace(/\{[^}]*\}|<(?!\/?[biu]>)[^>]*>/gi, "");
    }
    if (body.includes("&")) {
      body = body.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (m) => ENTITY_MAP[m] || "'");
    }
    return body.trim();
  }

  function parseSubtitles(text) {
    if (!text) return [];
    const cues = [];

    if (text.includes("[Events]") || (!text.includes("-->") && /(?:^|\r?\n)\s*Dialogue\s*:/i.test(text))) {
      let startIdx = 1, endIdx = 2, styleIdx = 3, textIdx = 9, playResY = 0;
      const styles = {};
      let styleFields = ["name", "fontname", "fontsize", "primarycolour", "secondarycolour", "outlinecolour", "backcolour", "bold", "italic", "underline", "strikeout", "scalex", "scaley", "spacing", "angle", "borderstyle", "outline", "shadow"];
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^PlayResY\s*:\s*(\d+)/i.test(line)) {
          playResY = +RegExp.$1;
        } else if (/^Format\s*:/i.test(line)) {
          const f = line.replace(/^Format\s*:\s*/i, "").toLowerCase().split(/\s*,\s*/);
          if (f.includes("start") && f.includes("text")) {
            startIdx = f.indexOf("start");
            endIdx = f.indexOf("end");
            textIdx = f.indexOf("text");
            if (f.includes("style")) styleIdx = f.indexOf("style");
          } else {
            styleFields = f;
          }
        } else if (/^Style\s*:/i.test(line)) {
          const vals = line.replace(/^Style\s*:\s*/i, "").split(/\s*,\s*/);
          const s = {};
          styleFields.forEach((f, idx) => { s[f] = vals[idx]; });
          styles[s.name] = {
            font: s.fontname || "",
            size: +s.fontsize || 0,
            color: assColor(s.primarycolour),
            outlineColor: assColor(s.outlinecolour) || "#000",
            outline: +s.outline || 0,
            shadow: +s.shadow || 0,
            bold: s.bold === "-1" || s.bold === "1",
            italic: s.italic === "-1" || s.italic === "1",
            playResY
          };
        } else if (/^Dialogue\s*:/i.test(line)) {
          const raw = line.replace(/^Dialogue\s*:\s*/i, "");
          const parts = [];
          let lastIdx = 0;
          for (let c = 0; c < textIdx; c++) {
            const nextIdx = raw.indexOf(",", lastIdx);
            if (nextIdx === -1) break;
            parts.push(raw.slice(lastIdx, nextIdx).trim());
            lastIdx = nextIdx + 1;
          }
          parts.push(raw.slice(lastIdx));
          if (parts.length <= textIdx) continue;

          const from = TIME_RE.exec(parts[startIdx]);
          const to = TIME_RE.exec(parts[endIdx]);
          if (!from || !to) continue;

          const rawText = parts[textIdx];
          const fadMatch = /\\fad\((\d+)\s*,\s*(\d+)\)/.exec(rawText);
          const blurMatch = /\\blur([\d.]+)/.exec(rawText);
          const stName = parts[styleIdx];
          const style = styles[stName] || styles["Default"] || null;
          const body = assTextToHtml(rawText);
          if (body) {
            cues.push({
              start: seconds(from),
              end: seconds(to),
              text: body,
              fad: fadMatch ? [+fadMatch[1], +fadMatch[2]] : null,
              blur: blurMatch ? +blurMatch[1] : 0,
              style
            });
          }
        }
      }
      if (cues.length) return cues.sort((a, b) => a.start - b.start);
    }

    const blocks = text.split(/\r?\n\s*\r?\n/);

    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b];
      if (!block.includes("-->")) continue;

      const lines = block.split(/\r?\n/);
      const i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) continue;

      const parts = lines[i].split("-->");
      const from = TIME_RE.exec(parts[0]);
      const to = TIME_RE.exec(parts[1]);
      if (!from || !to) continue;

      const body = cleanText(lines.slice(i + 1).join("\n"));
      if (body) cues.push({ start: seconds(from), end: seconds(to), text: body });
    }

    return cues.sort((a, b) => a.start - b.start);
  }

  globalThis.parseSubtitles = parseSubtitles;
})();
