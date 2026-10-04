function parseSubtitles(text) {
  const time = /(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})/;
  const seconds = (m) => (m[1] || 0) * 3600 + m[2] * 60 + +m[3] + m[4].padEnd(3, "0") / 1000;
  const cues = [];

  for (const block of text.replace(/^\uFEFF/, "").split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const i = lines.findIndex((line) => line.includes("-->"));
    if (i < 0) continue;

    const [from, to] = lines[i].split("-->").map((part) => time.exec(part));
    const body = lines
      .slice(i + 1)
      .join("\n")
      .replace(/\{\\[^}]*\}|<(?!\/?[biu]>)[^>]*>/gi, "")
      .trim();
    if (from && to && body) cues.push({ start: seconds(from), end: seconds(to), text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
}
