import Tesseract from "tesseract.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

/**
 * Diagnoses what models are actually available to your key
 */
async function listAvailableModels(apiKey) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    if (r.ok) {
      const data = await r.json();
      const names = data.models?.map(m => m.name.split('/').pop()) || [];
      console.log("--------------------------------------------------");
      console.log("[GEMINI DIAGNOSTIC] Available models for your key:");
      console.log(names.join(", "));
      console.log("--------------------------------------------------");
      return names;
    }
    console.log(`[GEMINI] Model Listing Failed: ${r.status}`);
  } catch (e) {
    console.log(`[GEMINI] Diagnostic Error: ${e.message}`);
  }
  return [];
}

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
    console.log("[GEMINI] CRITICAL: Invalid API Key format.");
    return [{
      name: "⚠️ AI Key Config Error",
      price: "HELP",
      description: "You pasted the KEY NAME. Please paste the AIza-code into Render."
    }];
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const configs = [
    { model: "gemini-1.5-flash", version: "v1beta" },
    { model: "gemini-1.5-flash", version: "v1" },
    { model: "gemini-1.5-pro", version: "v1beta" },
    { model: "gemini-pro-vision", version: "v1beta" }
  ];

  const data = fs.readFileSync(imagePath).toString("base64");
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  const imagePart = { inlineData: { data, mimeType } };

  const prompt = `Analyze this menu image. Extract JSON list of dishes with "name", "price", "description". Return ONLY JSON.`;

  for (const config of configs) {
    try {
      console.log(`[GEMINI] Attempting Vision: ${config.model} (${config.version})...`);
      const model = genAI.getGenerativeModel({ model: config.model }, { apiVersion: config.version });
      const result = await model.generateContent([prompt, imagePart]);
      const res = await result.response;
      const text = res.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.log(`[GEMINI] ${config.model} Library Failure: ${err.message}`);

      try {
        const url = `https://generativelanguage.googleapis.com/${config.version}/models/${config.model}:generateContent?key=${apiKey}`;
        const restRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: data } }] }] })
        });
        if (restRes.ok) {
          const restData = await restRes.json();
          const restText = restData.candidates?.[0]?.content?.parts?.[0]?.text;
          const restJsonMatch = restText?.match(/\[[\s\S]*\]/);
          if (restJsonMatch) return JSON.parse(restJsonMatch[0]);
        }
      } catch (e) { }
    }
  }

  console.log("[GEMINI] Vision failed. Running diagnostics...");
  await listAvailableModels(apiKey);
  return null;
}

export async function extractStructuredMenuWithLLM(imagePath = null, rawText = "") {
  if (imagePath && fs.existsSync(imagePath)) {
    const visionItems = await extractStructuredMenuFromImage(imagePath);
    if (visionItems && visionItems.length > 0) return visionItems;
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (apiKey.startsWith("AIza") && rawText) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Extract menu JSON (name, price, description) from: ${rawText}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { }
  }

  return parseMenuTextToItems(rawText);
}

export function parseMenuTextToItems(text) {
  if (!text) return [];
  const lines = text.split(/\n/);
  const items = [];

  const HEADER_WORDS = /menu|restaurant|food|card|today|special|welcome|phone|address|email|price|list|item|opening|hours|since|established|visit|website|dish/i;
  const NOISE_WORDS = /\b(boda|jes|mn|iy|raa|os|fr|ng|dpe|ay|ze|pa|sr|tt|ii|ll|oo)\b|^in f\b|^in\b/i;

  for (let line of lines) {
    line = line.trim().replace(/[|_~`^<>\\]+/g, "").replace(/\s+/g, " ");
    if (line.length < 5) continue;

    if (HEADER_WORDS.test(line) && line.split(" ").length < 4) continue;
    if (NOISE_WORDS.test(line) && line.length < 15) continue;

    const alphaCount = (line.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount / line.length < 0.3) continue;

    const priceMatch = line.match(/([₹$]|Rs\.?)\s?(\d+)|(\d+)\s?(\/\-)/i);
    let name = line;
    let price = "—";

    if (priceMatch) {
      price = priceMatch[0];
      name = line.replace(priceMatch[0], "").trim();
    }

    name = name.replace(/[^\w\s'&().-]/g, " ").replace(/\s+/g, " ").trim();

    const generateDesc = (n) => {
      const l = n.toLowerCase();
      if (l.includes("burger")) return "Juicy flame-grilled burger with fresh toppings.";
      if (l.includes("sandwich")) return "Gourmet freshly-prepared sandwich on artisanal bread.";
      if (l.includes("chicken")) return "Tender chicken prepared with house-special spices.";
      if (l.includes("salad")) return "Fresh seasonal greens with zesty dressing.";
      if (l.includes("juice") || l.includes("shake") || l.includes("tea")) return "Refreshing chilled beverage.";
      return `Delicious ${n} prepared with fresh house ingredients.`;
    };

    if (name.length > 5 && !HEADER_WORDS.test(name)) {
      items.push({ name, price, description: generateDesc(name) });
    }
  }

  if (items.length === 0) {
    items.push({
      name: "No items detected",
      price: "Check Log",
      description: "AI failed and OCR was too messy. Please verify your Gemini Key."
    });
  }

  return items.slice(0, 40);
}

export function fuzzySearch(rows, q) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const qn = norm(q);
  return rows.filter(r => norm(r.name).includes(qn));
}
