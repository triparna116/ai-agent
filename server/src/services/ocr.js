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

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro"];

  for (const modelName of modelsToTry) {
    try {
      console.log(`[GEMINI] Trying Vision with ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const data = fs.readFileSync(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

      const imagePart = {
        inlineData: { data: data.toString("base64"), mimeType },
      };

      const prompt = "EXTRACT MENU ITEMS. Return a JSON array of objects with 'name', 'price', and 'description'. Output ONLY JSON.";
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const items = JSON.parse(jsonMatch[0]);
      console.log(`[GEMINI] Success with ${modelName}!`);
      return items;
    } catch (err) {
      console.log(`[GEMINI] ${modelName} failed: ${err.message}`);
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
    return parseMenuTextToItems(rawText).map(n => ({ name: n, price: "—", description: "Set API Key" }));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.0-pro"];

  for (const modelName of modelsToTry) {
    try {
      console.log(`[GEMINI] Trying Text with ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const prompt = `Convert this OCR into JSON menu: ${rawText}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;
      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.log(`[GEMINI] Text ${modelName} failed: ${err.message}`);
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
