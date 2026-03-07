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
  if (!apiKey) {
    console.log("[GEMINI] Missing API key. Please check Render Environment Variables.");
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const data = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

    const imagePart = {
      inlineData: {
        data: data.toString("base64"),
        mimeType: mimeType,
      },
    };

    const prompt = `
      EXTRACT MENU ITEMS.
      Return a JSON array of objects. Each object MUST have:
      - name: The dish name (clean and corrected)
      - price: The price with currency
      - description: A 1-sentence description
      
      Output ONLY the JSON array. Don't say anything else.
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const rawResponse = response.text();

    // Safety: Extract only the part between [ and ]
    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AI did not return a valid list");

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("[GEMINI VISION ERROR]", error.message);
    return null;
  }
}

export async function extractStructuredMenuWithLLM(imagePath = null, rawText = "") {
  // Always try Vision first
  if (imagePath && fs.existsSync(imagePath)) {
    const visionItems = await extractStructuredMenuFromImage(imagePath);
    if (visionItems && Array.isArray(visionItems) && visionItems.length > 0) {
      return visionItems;
    }
  }

  // Text-based Fallback
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return parseMenuTextToItems(rawText).map(n => ({ name: n, price: "—", description: "Set API Key for AI" }));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  try {
    const prompt = `Convert this OCR into JSON menu: ${rawText}`;
    const result = await model.generateContent(prompt);
    const resText = result.response.text();
    const jsonMatch = resText.match(/\[[\s\S]*\]/);
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[GEMINI TEXT ERROR]", e.message);
    return parseMenuTextToItems(rawText).map(name => ({ name, price: "—", description: "AI Busy/Error" }));
  }
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
