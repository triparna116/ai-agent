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

/**
 * Direct fetch check to see if we can even talk to Google's API
 */
async function checkApiHealth(apiKey) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    if (r.ok) {
      const data = await r.json();
      console.log(`[GEMINI] API Health OK. Found ${data.models?.length} models.`);
      return true;
    }
    console.log(`[GEMINI] API Health Check Failed: ${r.status} ${r.statusText}`);
    return false;
  } catch (e) {
    console.error("[GEMINI] Network Error during Health Check:", e.message);
    return false;
  }
}

export async function extractStructuredMenuFromImage(imagePath) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return null;

  // Run a quick health check once in logs
  await checkApiHealth(apiKey);

  const genAI = new GoogleGenerativeAI(apiKey);

  // Try stable v1 FIRST, then v1beta. Try 1.5-flash then 1.5-pro
  const configs = [
    { model: "gemini-1.5-flash", version: "v1" },
    { model: "gemini-1.5-flash", version: "v1beta" },
    { model: "gemini-1.5-flash-latest", version: "v1beta" },
    { model: "gemini-1.5-pro", version: "v1" }
  ];

  const data = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  const imagePart = { inlineData: { data: data.toString("base64"), mimeType } };

  for (const config of configs) {
    try {
      console.log(`[GEMINI] Attempting Vision: ${config.model} (${config.version})...`);
      const model = genAI.getGenerativeModel({ model: config.model }, { apiVersion: config.version });

      const prompt = `
        You are an AI Menu Digitizer. Analyze this image.
        Extract every food/drink item into a clean JSON array of objects.
        Required fields: "name", "price", "description" (optional, use "" if missing).
        Return ONLY valid JSON. Keep dish names clean and professional.
      `;

      const result = await model.generateContent([prompt, imagePart]);
      const res = await result.response;
      const text = res.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const items = JSON.parse(jsonMatch[0]);
      console.log(`[GEMINI] SUCCESS! Extracted ${items.length} items using ${config.model}.`);
      return items;
    } catch (err) {
      console.log(`[GEMINI] ${config.model} (${config.version}) failed: ${err.message}`);
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
  if (!apiKey) {
    return parseMenuTextToItems(rawText).map(n => ({ name: n, price: "—", description: "API Key Not Set" }));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const configs = [
    { model: "gemini-1.5-flash", version: "v1" },
    { model: "gemini-1.0-pro", version: "v1" }
  ];

  for (const config of configs) {
    try {
      console.log(`[GEMINI] Trying Text: ${config.model} (${config.version})...`);
      const model = genAI.getGenerativeModel({ model: config.model }, { apiVersion: config.version });
      const prompt = `Extract menu names, prices, and descriptions as JSON from this text: ${rawText}`;
      const result = await model.generateContent(prompt);
      const res = await result.response;
      const text = res.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.log(`[GEMINI] Text ${config.model} failed: ${err.message}`);
    }
  }

  return parseMenuTextToItems(rawText).map(name => ({ name, price: "—", description: "AI Busy/Error" }));
}

export function parseMenuTextToItems(text) {
  if (!text) return [];
  return text.split("\n")
    .map(l => l.trim().replace(/[|_~`^<>\\]+/g, "").replace(/\s+/g, " "))
    .filter(l => l.length > 3)
    .slice(0, 30);
}

export function fuzzySearch(rows, q) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const qn = norm(q);
  return rows.filter(r => norm(r.name).includes(qn));
}
