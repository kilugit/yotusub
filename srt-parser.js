const TIME_RE = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const ENTITY_MAP = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
const seconds = (m) => (m[1] ? +m[1] * 3600 : 0) + m[2] * 60 + +m[3] + m[4].padEnd(3, "0") / 1000;

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
    let startIdx = 1, endIdx = 2, textIdx = 9;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^Format\s*:/i.test(line)) {
        const f = line.replace(/^Format\s*:\s*/i, "").toLowerCase().split(/\s*,\s*/);
        if (f.includes("start") && f.includes("text")) {
          startIdx = f.indexOf("start");
          endIdx = f.indexOf("end");
          textIdx = f.indexOf("text");
        }
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

        const body = cleanText(parts[textIdx]);
        if (body) cues.push({ start: seconds(from), end: seconds(to), text: body });
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
