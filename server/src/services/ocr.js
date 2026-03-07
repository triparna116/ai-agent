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
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const data = fs.readFileSync(imagePath);
    const imagePart = {
      inlineData: {
        data: data.toString("base64"),
        mimeType: "image/jpeg",
      },
    };

    const prompt = `
      Look at this restaurant menu image. 
      Extract ALL food and drink items in a professional list. 
      For each item: 
      - name: The full dish name
      - price: The exact price with currency (e.g. ₹200 or $5)
      - description: A short, simple 1-sentence description if the menu provides one, or a helpful guess based on the name.
      
      IMPORTANT: Only return a clean JSON array. No markdown, no text.
      Example: [{"name": "Pasta", "price": "$12", "description": "Creamy white sauce pasta"}]
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    return null;
  }
}

export async function extractStructuredMenuWithLLM(rawText, imagePath = null) {
  // Always try Vision if possible
  if (imagePath) {
    const results = await extractStructuredMenuFromImage(imagePath);
    if (results && Array.isArray(results) && results.length > 0) {
      return results;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return parseMenuTextToItems(rawText).map(name => ({ name, price: "", description: "" }));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  try {
    const prompt = `Extract dish name, price, description from this OCR text: ${rawText}. Return only JSON.`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
  } catch {
    return parseMenuTextToItems(rawText).map(name => ({ name, price: "", description: "" }));
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
