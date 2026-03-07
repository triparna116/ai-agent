import Tesseract from "tesseract.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

export async function recognizeImage(filePath) {
  try {
    const result = await Tesseract.recognize(filePath, "eng", {
      logger: () => { },
      tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -'&().₹$",
      psm: 6,
    });
    return result.data.text || "";
  } catch (err) {
    console.error("[TESSERACT ERROR]", err);
    return "";
  }
}

export async function extractStructuredMenuFromImage(imagePath) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();

  if (!apiKey.startsWith("AIza")) {
    console.log("**************************************************");
    console.log("[GEMINI] CRITICAL WARNING: Your API Key does NOT look like a real Gemini key.");
    console.log(`[GEMINI] Key starts with: "${apiKey.substring(0, 8)}..."`);
    console.log("[GEMINI] A real key must start with 'AIza'. Did you paste the NAME of the key by mistake?");
    console.log("**************************************************");
    return null;
  }

  console.log(`[GEMINI] API Key looks valid (starts with ${apiKey.substring(0, 4)}). Waking up AI...`);

  const genAI = new GoogleGenerativeAI(apiKey);

  // Try stable versions and models
  const configs = [
    { model: "gemini-1.5-flash", version: "v1beta" },
    { model: "gemini-1.5-flash", version: "v1" },
    { model: "gemini-1.5-pro", version: "v1beta" },
    { model: "gemini-pro-vision", version: "v1beta" }
  ];

  const data = fs.readFileSync(imagePath).toString("base64");
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

  const imagePart = {
    inlineData: {
      data,
      mimeType
    }
  };

  const prompt = `
    Analyze this restaurant menu image. 
    Extract a JSON list of all dishes. 
    Required fields: "name", "price", "description".
    Return ONLY a JSON array. If nothing found, return [].
  `;

  for (const config of configs) {
    try {
      console.log(`[GEMINI] Attempting Vision: ${config.model} (${config.version})...`);
      const model = genAI.getGenerativeModel({ model: config.model }, { apiVersion: config.version });
      const result = await model.generateContent([prompt, imagePart]);
      const res = await result.response;
      const text = res.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]);
        if (items.length > 0) {
          console.log(`[GEMINI] SUCCESS with ${config.model}!`);
          return items;
        }
      }
    } catch (err) {
      console.log(`[GEMINI] ${config.model} failed: ${err.message}`);
    }
  }
  return null;
}

export async function extractStructuredMenuWithLLM(imagePath = null, rawText = "") {
  if (imagePath && fs.existsSync(imagePath)) {
    const visionItems = await extractStructuredMenuFromImage(imagePath);
    if (visionItems && visionItems.length > 0) return visionItems;
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (apiKey && rawText) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Clean this messy OCR text into a JSON menu list (name, price, description): ${rawText}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log("[GEMINI] Text Extract failed, using smart fallback.");
    }
  }

  return parseMenuTextToItems(rawText);
}

export function parseMenuTextToItems(text) {
  if (!text) return [];
  const lines = text.split(/\n/);
  const items = [];

  // Words that indicate a header or meta-information rather than a dish
  const HEADER_WORDS = /menu|restaurant|food|card|today|special|welcome|phone|mobile|address|email|price|list|item|opening|hours|since|established|visit|website/i;
  // Garbage OCR patterns (mostly single letters or nonsense)
  const NOISE_WORDS = /\b(boda|jes|mn|iy|raa|os|fr|ng|dpe|ay|ze|pa|sr|tt|ii|ll|oo)\b/i;

  for (let line of lines) {
    line = line.trim().replace(/[|_~`^<>\\]+/g, "").replace(/\s+/g, " ");

    // Skip very short lines
    if (line.length < 4) continue;

    // Skip obvious headers (unless they are long enough to be a dish)
    if (HEADER_WORDS.test(line) && line.split(" ").length < 4) continue;

    // Skip nonsense OCR noise
    if (NOISE_WORDS.test(line) && line.length < 15) continue;

    // Skip lines with too many special characters
    const alphaCount = (line.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount / line.length < 0.4) continue;

    // Find Price patterns
    const priceMatch = line.match(/([₹$]|Rs\.?)\s?(\d+)|(\d+)\s?(\/\-)/i);
    let name = line;
    let price = "—";

    if (priceMatch) {
      price = priceMatch[0];
      name = line.replace(priceMatch[0], "").trim();
    }

    // Clean up the name
    name = name.replace(/[^\w\s'&().-]/g, " ").replace(/\s+/g, " ").trim();

    if (name.length > 5 && !HEADER_WORDS.test(name)) {
      items.push({
        name,
        price,
        description: "AI Offline (Check API Key in Render Logs)"
      });
    }
  }
  // Return the best 40 items
  return items.slice(0, 40);
}

export function fuzzySearch(rows, q) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const qn = norm(q);
  return rows.filter(r => norm(r.name).includes(qn));
}
