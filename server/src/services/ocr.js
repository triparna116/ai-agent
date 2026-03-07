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
    console.log("[GEMINI] CRITICAL CONFIG ERROR");
    console.log(`[GEMINI] Your key starts with: "${apiKey.substring(0, 10)}..."`);
    console.log("[GEMINI] A valid code MUST start with 'AIza'.");
    console.log("[GEMINI] You likely pasted the 'Key Name' by mistake.");
    console.log("**************************************************");
    return [{
      name: "⚠️ AI Key Config Error",
      price: "HELP",
      description: "You pasted the KEY NAME. Please paste the AIza-code into Render."
    }];
  }

  console.log(`[GEMINI] API Key looks valid (starts with ${apiKey.substring(0, 4)}). Waking up AI...`);

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

  const prompt = `
    Analyze this restaurant menu image. 
    Extract a JSON list of all dishes. 
    Required fields: "name", "price", "description".
    Return ONLY a JSON array.
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
      console.log(`[GEMINI] ${config.model} Library Failure: ${err.message}`);

      // Fallback: Direct REST call (sometimes works when library fails)
      try {
        console.log(`[GEMINI] Attempting Direct REST Fallback for ${config.model}...`);
        const url = `https://generativelanguage.googleapis.com/${config.version}/models/${config.model}:generateContent?key=${apiKey}`;
        const restBody = {
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: data } }] }]
        };
        const restRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(restBody)
        });

        if (restRes.ok) {
          const restData = await restRes.json();
          const restText = restData.candidates?.[0]?.content?.parts?.[0]?.text;
          const restJsonMatch = restText?.match(/\[[\s\S]*\]/);
          if (restJsonMatch) {
            console.log(`[GEMINI] REST SUCCESS with ${config.model}!`);
            return JSON.parse(restJsonMatch[0]);
          }
        } else {
          console.log(`[GEMINI] REST Failure: ${restRes.status} ${restRes.statusText}`);
        }
      } catch (restErr) {
        console.log(`[GEMINI] REST Critical Error: ${restErr.message}`);
      }
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
  if (apiKey && apiKey.startsWith("AIza") && rawText) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Extract menu items (name, price, description) as JSON from: ${rawText}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log("[GEMINI] Text Extract failed.");
    }
  }

  return parseMenuTextToItems(rawText);
}

export function parseMenuTextToItems(text) {
  if (!text) return [];
  const lines = text.split(/\n/);
  const items = [];

  const HEADER_WORDS = /menu|restaurant|food|card|today|special|welcome|phone|mobile|address|email|price|list|item|opening|hours|since|established|visit|website|dish/i;
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

    if (name.length > 5 && !HEADER_WORDS.test(name)) {
      items.push({
        name,
        price,
        description: "AI Offline (Review Render Logs)"
      });
    }
  }

  if (items.length === 0) {
    items.push({
      name: "No items detected",
      price: "Check Key",
      description: "AI failed and OCR was too messy. Please verify your Gemini Key in Render."
    });
  }

  return items.slice(0, 40);
}

export function fuzzySearch(rows, q) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const qn = norm(q);
  return rows.filter(r => norm(r.name).includes(qn));
}
