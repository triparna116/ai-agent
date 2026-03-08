import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import Tesseract from "tesseract.js";
import { recognizeImage, extractStructuredMenuWithLLM } from "./src/services/ocr.js";
import { fileURLToPath } from "url";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change";

const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5173"].filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "uploads")));
const clientDist = path.join(__dirname, "dist");
app.use(express.static(clientDist));
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, unique + ext);
  },
});
const upload = multer({ storage });
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);

const dbFile = path.join(__dirname, "db.json");
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { users: [], restaurants: [], menu_items: [] });
await db.read();
if (!db.data) db.data = { users: [], restaurants: [], menu_items: [] };
// Ensure schema exists even if old db.json lacked users key
if (!db.data.users) db.data.users = [];
if (!db.data.restaurants) db.data.restaurants = [];
if (!db.data.menu_items) db.data.menu_items = [];
await db.write();

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "unauthorized" });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "invalid_body" });
  const exists = db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (exists) return res.status(409).json({ error: "user_exists" });
  const hash = bcrypt.hashSync(password, 10);
  const id = Date.now();
  db.data.users.push({ id, username, passwordHash: hash });
  await db.write();
  res.json({ id, username });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "invalid_body" });
  const user = db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(401).json({ error: "invalid_credentials" });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });
  const token = jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

app.post("/api/restaurants", auth, async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name_required" });
  const exists = db.data.restaurants.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (exists) return res.status(409).json({ error: "restaurant_exists" });
  const id = Date.now();
  db.data.restaurants.push({ id, name, images: [] });
  await db.write();
  res.json({ id, name });
});

app.get("/api/restaurants", async (req, res) => {
  const list = db.data.restaurants.map((r) => ({ id: r.id, name: r.name }));
  res.json({ restaurants: list });
});

app.get("/api/restaurants/:id/menu", async (req, res) => {
  const id = Number(req.params.id);
  const r = db.data.restaurants.find((x) => x.id === id);
  if (!r) return res.status(404).json({ error: "not_found" });
  const items = db.data.menu_items.filter((mi) => mi.restaurant_id === id);
  res.json({ restaurant: { id: r.id, name: r.name }, items });
});

app.put("/api/restaurants/:id/menu/:menuId", auth, async (req, res) => {
  const id = Number(req.params.id);
  const mid = Number(req.params.menuId);
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name_required" });
  const idx = db.data.menu_items.findIndex((mi) => mi.restaurant_id === id && mi.id === mid);
  if (idx === -1) return res.status(404).json({ error: "not_found" });
  db.data.menu_items[idx].name = name;
  await db.write();
  res.json({ ok: true, item: db.data.menu_items[idx] });
});

app.post("/api/restaurants/:id/upload", auth, upload.single("image"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = db.data.restaurants.find((x) => x.id === id);
    if (!r) {
      if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch { }
      return res.status(404).json({ error: "not_found" });
    }
    const f = req.file;
    if (!f) return res.status(400).json({ error: "image_required" });
    if (!ALLOWED_MIME.has(f.mimetype)) {
      try { fs.unlinkSync(f.path); } catch { }
      return res.status(415).json({ error: "unsupported_media_type", allowed: Array.from(ALLOWED_MIME) });
    }
    const url = `/uploads/${path.basename(f.path)}`;
    r.images = r.images || [];
    r.images.push({ url });
    
    const ocrData = await recognizeImage(f.path);
    const { items, guardrail, source } = await extractStructuredMenuWithLLM(f.path, ocrData);
    
    const existingNames = new Set(
      db.data.menu_items.filter((mi) => mi.restaurant_id === id).map((mi) => mi.name.toLowerCase())
    );
    let inserted = 0;
    for (const item of items) {
      if (!existingNames.has(item.name.toLowerCase())) {
        db.data.menu_items.push({
          id: Date.now() + Math.random(),
          restaurant_id: id,
          name: item.name,
          price: item.price || "",
          description: item.description || "",
          raw_text: ocrData.text,
        });
        inserted++;
      }
    }
    await db.write();
    res.json({
      imageUrl: url,
      added: inserted,
      extracted: items.length,
      itemsPreview: items,
      guardrail,
      source
    });
  } catch {
    res.status(500).json({ error: "upload_failed" });
  }
});
function parseMenuTextToItems(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
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
    for (const sw of STOPWORDS) {
      if (lc === sw || lc.includes(sw)) { cleaned = ""; break; }
    }
    if (!cleaned) continue;
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
    // Single-word uppercase headings like DESSERTS
    if (tokens.length === 1 && tokens[0].toUpperCase() === tokens[0] && tokens[0].length > 3) continue;
    if (tokens.every((t) => t.length <= 2)) continue;
    cleaned = tokens
      .map((t) => (t.length <= 1 ? "" : t))
      .filter(Boolean)
      .join(" ")
      .trim();
    if (cleaned.length < 4) continue;
    items.push(cleaned);
  }
  // Deduplicate and cap
  const uniq = Array.from(new Set(items.map((s) => s.replace(/\s+/g, " ").trim())));
  return uniq.slice(0, 200);
}

app.post("/api/ingest", upload.array("images", 8), async (req, res) => {
  try {
    const restaurantName = (req.body.restaurantName || "").trim();
    if (!restaurantName) {
      return res.status(400).json({ error: "restaurantName is required" });
    }
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "at least one image required" });
    }
    const bad = files.filter((f) => !ALLOWED_MIME.has(f.mimetype));
    if (bad.length > 0) {
      for (const f of files) {
        try { fs.unlinkSync(f.path); } catch { }
      }
      return res
        .status(415)
        .json({ error: "unsupported_media_type", allowed: Array.from(ALLOWED_MIME) });
    }

    const existing = db.data.restaurants.find(
      (r) => r.name.toLowerCase() === restaurantName.toLowerCase()
    );
    let restaurantId;
    if (existing) {
      restaurantId = existing.id;
    } else {
      restaurantId = Date.now();
      db.data.restaurants.push({ id: restaurantId, name: restaurantName });
    }

    const ocrResults = [];
    for (const f of files) {
      try {
        const result = await Tesseract.recognize(f.path, "eng", {
          logger: () => { },
          tessedit_char_whitelist:
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ -'&().",
          psm: 6,
          preserve_interword_spaces: "1",
        });
        ocrResults.push(result.data.text || "");
      } catch (err) {
        // Clean up and report a readable error
        try { fs.unlinkSync(f.path); } catch { }
        return res.status(422).json({ error: "ocr_failed", details: "Could not read image" });
      } finally {
        try { fs.unlinkSync(f.path); } catch { }
      }
    }
    const combinedText = ocrResults.join("\n");
    const items = parseMenuTextToItems(combinedText);

    db.data.menu_items = db.data.menu_items.filter(
      (mi) => mi.restaurant_id !== restaurantId
    );
    for (const item of items) {
      db.data.menu_items.push({
        id: Date.now() + Math.random(),
        restaurant_id: restaurantId,
        name: item,
        raw_text: combinedText,
      });
    }
    await db.write();

    res.json({
      restaurantId,
      restaurantName,
      itemsCount: items.length,
      itemsPreview: items.slice(0, 50),
    });
  } catch (e) {
    res.status(500).json({ error: "ingest_failed" });
  }
});

app.get("/api/search", (req, res) => {
  const q = (req.query.query || "").trim();
  if (!q) return res.json({ query: q, results: [] });
  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  };
  const qn = normalize(q);
  const rows = [];
  for (const mi of db.data.menu_items) {
    const name = mi.name;
    const nn = normalize(name);
    let ok = false;
    if (nn.includes(qn)) ok = true;
    if (!ok && qn.length >= 4) {
      const words = nn.split(" ").filter(Boolean);
      for (const w of words) {
        if (lev(qn, w) <= 2) {
          ok = true;
          break;
        }
      }
      if (!ok && lev(qn, nn) <= 2) ok = true;
    }
    if (ok) {
      const r = db.data.restaurants.find((rr) => rr.id === mi.restaurant_id);
      if (r) rows.push({ restaurantName: r.name, itemName: mi.name });
    }
  }
  rows.sort((a, b) =>
    a.restaurantName.localeCompare(b.restaurantName) ||
    a.itemName.localeCompare(b.itemName)
  );
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.restaurantName]) grouped[row.restaurantName] = [];
    grouped[row.restaurantName].push(row.itemName);
  }
  const results = Object.entries(grouped).map(([restaurantName, items]) => ({
    restaurantName,
    items,
  }));
  res.json({ query: q, results });
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "not_found" });
  }
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`server on http://localhost:${PORT}`);
});
