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
  if (!apiKey) return null;

  const data = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  const imagePart = { inlineData: { data: data.toString("base64"), mimeType } };
  const prompt = "EXTRACT MENU ITEMS. Return a JSON array of objects with 'name', 'price', and 'description'. Output ONLY JSON.";

  // Versions and models to try in sequence to fix 404 errors
  const configs = [
    { model: "gemini-1.5-flash", version: "v1beta" },
    { model: "gemini-1.5-flash", version: "v1" },
    { model: "gemini-1.5-flash-latest", version: "v1beta" },
    { model: "gemini-pro-vision", version: "v1beta" },
    { model: "gemini-1.5-pro", version: "v1beta" }
  ];

  for (const config of configs) {
    try {
      console.log(`[GEMINI] Trying Vision: ${config.model} (${config.version})...`);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: config.model }, { apiVersion: config.version });

      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const items = JSON.parse(jsonMatch[0]);
      console.log(`[GEMINI] SUCCESS with ${config.model}!`);
      return items;
    } catch (err) {
      console.log(`[GEMINI] Vision ${config.model} (${config.version}) failed: ${err.message}`);
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
  const models = ["gemini-1.5-flash", "gemini-pro"];
  const versions = ["v1beta", "v1"];

  for (const version of versions) {
    for (const modelName of models) {
      try {
        console.log(`[GEMINI] Trying Text: ${modelName} (${version})...`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: version });
        const prompt = `Convert this OCR into JSON menu: ${rawText}`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } catch (err) {
        console.log(`[GEMINI] Text ${modelName} (${version}) failed: ${err.message}`);
      }
    }
  }

  return parseMenuTextToItems(rawText).map(name => ({ name, price: "—", description: "AI Error" }));
}

export function parseMenuTextToItems(text) {
  if (!text) return [];
  return text.split("\n")
    .map(l => l.trim().replace(/[|_~`^<>\\]+/g, ""))
    .filter(l => l.length > 3)
    .slice(0, 30);
}

export function fuzzySearch(rows, q) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const qn = norm(q);
  return rows.filter(r => norm(r.name).includes(qn));
}
