import Tesseract from "tesseract.js";
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
 * Direct fetch to Google's REST API. Bypasses library issues.
 */
async function geminiDirect(url, apiKey, body) {
  try {
    const res = await fetch(`${url}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      console.log(`[GEMINI DIRECT ERROR] ${res.status}: ${JSON.stringify(data)}`);
      return null;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    console.error("[GEMINI DIRECT EXCEPTION]", e.message);
    return null;
  }
}

export async function extractStructuredMenuFromImage(imagePath) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return null;

  const data = fs.readFileSync(imagePath).toString("base64");

  const prompt = "EXTRACT MENU ITEMS. Return a JSON array of objects with 'name', 'price', and 'description'. Output ONLY JSON.";
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data } }
      ]
    }]
  };

  // Try different endpoints directly
  const urls = [
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent"
  ];

  for (const url of urls) {
    console.log(`[GEMINI] Trying Direct API: ${url.split('/').pop()}...`);
    const results = await geminiDirect(url, apiKey, body);
    if (results && results.length > 0) return results;
  }

  return null;
}

export async function extractStructuredMenuWithLLM(imagePath = null, rawText = "") {
  if (imagePath && fs.existsSync(imagePath)) {
    const visionItems = await extractStructuredMenuFromImage(imagePath);
    if (visionItems && visionItems.length > 0) return visionItems;
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (apiKey) {
    const body = { contents: [{ parts: [{ text: `Convert this OCR into clean JSON: ${rawText}` }] }] };
    const url = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";
    const results = await geminiDirect(url, apiKey, body);
    if (results) return results;
  }

  // Final Smart Fallback
  return parseMenuTextToItems(rawText);
}

/**
 * Smart Regex-based Fallback. Extracts Price even if AI fails.
 */
export function parseMenuTextToItems(text) {
  if (!text) return [];
  const lines = text.split(/\n/);
  const items = [];

  for (let line of lines) {
    line = line.trim().replace(/[|_~`^<>\\]+/g, "").replace(/\s+/g, " ");
    if (line.length < 3) continue;

    // Look for price patterns like $34, ₹250, Rs. 100, 250/-
    const priceMatch = line.match(/([₹$]|Rs\.?)\s?(\d+)|(\d+)\s?(\/\-)/i);
    let name = line;
    let price = "—";

    if (priceMatch) {
      price = priceMatch[0];
      name = line.replace(priceMatch[0], "").trim();
    }

    // Final clean name (remove noise)
    name = name.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

    if (name.length > 3 && !/menu|restaurant|page|card|price|phone/i.test(name)) {
      items.push({
        name,
        price,
        description: "AI Unavailable (Auto-Extracted)"
      });
    }
  }
  return items.slice(0, 40);
}

export function fuzzySearch(rows, q) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const qn = norm(q);
  return rows.filter(r => norm(r.name).includes(qn));
}
