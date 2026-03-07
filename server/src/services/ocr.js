import Tesseract from "tesseract.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

export async function recognizeImage(path) {
  const result = await Tesseract.recognize(path, "eng", {
    logger: () => { },
    tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -'&().₹$",
    psm: 6,
    preserve_interword_spaces: "1",
  });
  return result.data.text || "";
}

export async function extractStructuredMenuFromImage(imagePath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[GEMINI] Missing API key - Vision disabled.");
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const data = fs.readFileSync(imagePath);
    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    console.log(`[GEMINI] Sending image to Vision (${mimeType})...`);

    const imagePart = {
      inlineData: {
        data: data.toString("base64"),
        mimeType: mimeType,
      },
    };

    const prompt = `
      You are a high-end restaurant menu digitizer. 
      Analyze this image and extract every single food and beverage item.
      For each item, return:
      - name: The clean, corrected name of the dish.
      - price: The price with currency (e.g. ₹150).
      - description: A short, appetizing 1-sentence description.
      
      IMPORTANT: Return ONLY a JSON array. If the image is not a menu, return [].
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text().replace(/```json|```/g, "").trim();

    const items = JSON.parse(text);
    console.log(`[GEMINI] Vision success! Extracted ${items.length} items.`);
    return items;
  } catch (error) {
    console.error("[GEMINI] Vision Error:", error.message);
    return null;
  }
}

export async function extractStructuredMenuWithLLM(imagePath = null, rawText = "") {
  // 1. Try Vision FIRST (Directly reading the image is much better than reading OCR text)
  if (imagePath) {
    const visionResults = await extractStructuredMenuFromImage(imagePath);
    if (visionResults && Array.isArray(visionResults) && visionResults.length > 0) {
      return visionResults;
    }
    console.log("[GEMINI] Vision gave no results, trying text-based extraction...");
  }

  // 2. Fallback to Text-based LLM (if we have OCR text)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !rawText) {
    console.log("[GEMINI] Simple fallback parser active (No Key or Text).");
    return parseMenuTextToItems(rawText).map(name => ({ name, price: "", description: "Automatic extraction" }));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  try {
    console.log("[GEMINI] Sending OCR text to Gemini...");
    const prompt = `Convert this messy OCR into a clean JSON menu: ${rawText}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
  } catch (err) {
    console.error("[GEMINI] Text Fallback Error:", err.message);
    return parseMenuTextToItems(rawText).map(name => ({ name, price: "", description: "Fallback" }));
  }
}

export function parseMenuTextToItems(text) {
  // Simple fallback parser (kept for safety)
  return text.split("\n").map(l => l.trim()).filter(l => l.length > 5).slice(0, 50);
}

export function fuzzySearch(rows, q) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const qn = normalize(q);
  return rows.filter(r => normalize(r.name).includes(qn));
}
