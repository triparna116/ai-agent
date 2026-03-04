import Tesseract from "tesseract.js";

export async function recognizeImage(path) {
  const result = await Tesseract.recognize(path, "eng", {
    logger: () => {},
    tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ -'&().",
    psm: 6,
    preserve_interword_spaces: "1",
  });
  return result.data.text || "";
}

export function parseMenuTextToItems(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const items = [];
  const hasVowel = (s) => /[aeiou]/i.test(s);
  const STOPWORDS = new Set([
    "menu",
    "dessert",
    "desserts",
    "starters",
    "beverages",
    "appetizers",
    "soups",
    "main course",
    "chef special",
    "specials",
    "combo",
    "always fresh",
    "always hot",
    "designed by",
    "name of dish",
    "hot",
  ]);
  for (const line of lines) {
    let cleaned = line
      .replace(/[|_~`^<>\\]+/g, " ")
      .replace(/[@#*•\-–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 4) continue;
    if (/^\d/.test(cleaned)) continue;
    if (/only|mrp|vat|tax|total|amount|service|rs\.?|₹|\$|tk|bdt/i.test(cleaned)) continue;
    if (/^\d+(\.\d{1,2})?$/.test(cleaned)) continue;
    const lc = cleaned.toLowerCase();
    let skip = false;
    for (const sw of STOPWORDS) {
      if (lc === sw || lc.includes(sw)) { skip = true; break; }
    }
    if (skip) continue;
    const letters = (cleaned.match(/[A-Za-z]/g) || []).length;
    const ratio = letters / cleaned.length;
    if (ratio < 0.5) continue;
    if (!hasVowel(cleaned)) continue;
    const tokens = cleaned.split(" ").filter(Boolean);
    if (tokens.length === 1) {
      const t = tokens[0];
      if (t.toUpperCase() === t && t.length > 3) continue;
      if (t.length < 5) continue;
    } else if (tokens.length < 2) continue;
    if (tokens.length === 1 && tokens[0].toUpperCase() === tokens[0] && tokens[0].length > 3) continue;
    if (tokens.every((t) => t.length <= 2)) continue;
    cleaned = tokens.map((t) => (t.length <= 1 ? "" : t)).filter(Boolean).join(" ").trim();
    if (cleaned.length < 4) continue;
    items.push(cleaned);
  }
  const uniq = Array.from(new Set(items.map((s) => s.replace(/\s+/g, " ").trim())));
  return uniq.slice(0, 200);
}

export function fuzzySearch(rows, q) {
  const normalize = (s) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const lev = (a, b) => {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  };
  const qn = normalize(q);
  const out = [];
  for (const mi of rows) {
    const nn = normalize(mi.name);
    let ok = false;
    if (nn.includes(qn)) ok = true;
    if (!ok && qn.length >= 4) {
      const words = nn.split(" ").filter(Boolean);
      for (const w of words) {
        if (lev(qn, w) <= 2) { ok = true; break; }
      }
      if (!ok && lev(qn, nn) <= 2) ok = true;
    }
    if (ok) out.push(mi);
  }
  return out;
}
