import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import { addImage, findRestaurantById } from "../repositories/restaurants.js";
import { addIfNotExistsMany } from "../repositories/menuItems.js";
import { recognizeImage, extractStructuredMenuWithLLM } from "../services/ocr.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, unique + ext);
  },
});
export const uploader = multer({ storage });
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/jfif"]);

export async function uploadAndOcr(req, res) {
  try {
    const id = Number(req.params.id);
    const r = findRestaurantById(id);
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
    await addImage(id, url);
    const text = await recognizeImage(f.path);
    const items = await extractStructuredMenuWithLLM(f.path, text);
    const added = await addIfNotExistsMany(id, items, text);
    res.json({ imageUrl: url, added, extracted: items.length, itemsPreview: items });
  } catch {
    res.status(500).json({ error: "upload_failed" });
  }
}
