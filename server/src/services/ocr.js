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
  console.log(`[GEMINI] Using API Key starting with: ${apiKey.substring(0, 6)}... (Total Length: ${apiKey.length})`);

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

  const prompt = `
    Analyze this restaurant menu image and extract a structured JSON list of dishes.
    For each dish, include:
    - "name": The name of the dish.
    - "price": The exact price (e.g., "$10.00", "₹250").
    - "description": A short description based on visible details or standard menu context.
    - "category": The menu section it belongs to (e.g., "Appetizers", "Main Course").

    Return ONLY a valid JSON array of objects. Do not include markdown formatting or extra text.
  `;

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

  console.log("[GEMINI] Vision failed (library & rest). Running diagnostics...");
  await listAvailableModels(apiKey);
  return null;
}

/**
 * DOOR DASH CONCEPT: Guardrail Model (Enhanced)
 * Verifies if the extracted menu items reasonably match the image context.
 * Direct implementation of "Multi-view approach" (Image, OCR, LLM features).
 */
export async function runGuardrailAudit(imagePath, extractedItems, ocrRawText = "") {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey.startsWith("AIza") || !extractedItems || extractedItems.length === 0) {
    return { score: 0, needsReview: true, reason: "AI not configured or no items extracted." };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const data = fs.readFileSync(imagePath).toString("base64");
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
    const imagePart = { inlineData: { data, mimeType } };

    const auditPrompt = `
      Perform a 'Multi-view' Guardrail Audit on this restaurant menu extraction.
      
      [1. Image-level Analysis]: check for blur, glare, lighting, or cropping issues.
      [2. OCR Verification]: Evaluate the raw text quality: ${ocrRawText.substring(0, 1000)}
      [3. Consistency Check]: Do these items make sense as a coherent menu?
      Extracted Items: ${JSON.stringify(extractedItems.slice(0, 15))}
      
      Rate accuracy from 0 to 10.
      Predict if human review is needed based on these features.
      Return strictly JSON: { "score": number, "needsReview": boolean, "reason": "string" }
    `;

    const result = await model.generateContent([auditPrompt, imagePart]);
    const res = await result.response;
    const jsonMatch = res.text().match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("[GUARDRAIL ERROR]", err.message);
  }
  return { score: 5, needsReview: true, reason: "Guardrail logic failed" };
}

export async function extractStructuredMenuWithLLM(imagePath = null, rawText = "") {
  let items = [];
  let guardrailResult = { score: 0, needsReview: true };

  // 1. Attempt Multimodal Vision (DoorDash high-efficiency path)
  if (imagePath && fs.existsSync(imagePath)) {
    const visionItems = await extractStructuredMenuFromImage(imagePath);
    if (visionItems && visionItems.length > 0) {
      items = visionItems;
      // 2. Run Guardrail (DoorDash quality check)
      guardrailResult = await runGuardrailAudit(imagePath, items, rawText);

      if (!guardrailResult.needsReview && guardrailResult.score >= 8) {
        return { items, guardrail: guardrailResult, source: "vision" };
      }
    }
  }

  // 3. Fallback to OCR + LLM (James Chen Enhancement: "Correcting and Enhancing OCR Results")
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (apiKey.startsWith("AIza") && rawText) {
    try {
      console.log("[HYBRID] Vision unsatisfactory. Falling back to OCR + LLM Correction...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
        You are an AI assistant specialized in understanding menu images and correcting OCR.
        Task: Review the following OCR text and extract a structured menu JSON (name, price, description, category).
        IMPORTANT: Correct common OCR artifacts, spelling errors, and layout misinterpretations based on context.
        OCR Text: ${rawText}
      `;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const llmItems = JSON.parse(jsonMatch[0]);
        // Simple comparative guardrail for LLM fallback
        if (llmItems.length > items.length || items.length === 0) {
          return { items: llmItems, guardrail: { score: 7, needsReview: true, reason: "OCR Correction applied" }, source: "ocr_llm_corrected" };
        }
      }
    } catch (e) { }
  }

  // Final fallback to heuristic parser (The "Intact" logic)
  if (items.length === 0) {
    items = parseMenuTextToItems(rawText);
  }

  return {
    items,
    guardrail: guardrailResult || { score: 3, needsReview: true, reason: "Heuristic fallback" },
    source: items.length > 0 ? "heuristic" : "failed"
  };
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

    name = name.replace(/[^\w\s'&().-]/g, " ").replace(/\s+/g, " ").replace(/-$/, "").trim();

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
