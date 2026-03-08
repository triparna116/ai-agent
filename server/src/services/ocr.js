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
    return {
      text: result.data.text || "",
      confidence: result.data.confidence || 0,
      words: result.data.words?.map(w => ({ text: w.text, bbox: w.bbox })) || []
    };
  } catch (err) {
    console.error("[TESSERACT ERROR]", err);
    return { text: "", confidence: 0, words: [] };
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
 * DOOR DASH CONCEPT: Guardrail Model (Refined)
 * This acts as a classifier to predict if the transcription meets the accuracy bar.
 * Features: Image-level (blur/glare), OCR-derived (confidence/tokens), LLM-output (consistency).
 */
export async function runGuardrailAudit(imagePath, extractedItems, ocrData = null) {
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

    const ocrSnippet = ocrData?.text ? ocrData.text.substring(0, 800) : "No OCR text";
    const ocrConfidence = ocrData?.confidence || "N/A";

    const auditPrompt = `
      Perform a 'Multi-view' Guardrail Audit as described by DoorDash Engineering.
      Analyze the interaction between the Photo, OCR, and LLM output.

      [VIEW 1: Image-level Features]: Analyze the photo for quality, lighting, glare, and cropping.
      [VIEW 2: OCR-derived Features]: 
        - Raw OCR: ${ocrSnippet}
        - Tesseract Confidence: ${ocrConfidence}
      [VIEW 3: LLM-output Features]: 
        - Extracted Items: ${JSON.stringify(extractedItems.slice(0, 10))}
        - Internal consistency of categories/prices.

      Return strictly JSON: 
      { 
        "score": (0-10), 
        "needsReview": boolean, 
        "reason": "specific failure mode if any",
        "features": { "imageQuality": "string", "ocrReliability": "string", "outputConsistency": "string" }
      }
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

export async function extractStructuredMenuWithLLM(imagePath = null, ocrData = null) {
  const rawText = ocrData?.text || "";
  let items = [];
  let guardrailResult = { score: 0, needsReview: true };

  // 1. Multimodal Stage (Vision Transformer / Gemini Vision)
  if (imagePath && fs.existsSync(imagePath)) {
    console.log("[PIPELINE] Stage 1: Multimodal Vision extraction...");
    const visionItems = await extractStructuredMenuFromImage(imagePath);
    
    if (visionItems && visionItems.length > 0) {
      items = visionItems;
      // 2. Guardrail Inference (DoorDash "Routing Decision")
      guardrailResult = await runGuardrailAudit(imagePath, items, ocrData);

      if (!guardrailResult.needsReview && guardrailResult.score >= 8) {
        console.log(`[PIPELINE] High confidence (${guardrailResult.score}). Automated deployment.`);
        return { items, guardrail: guardrailResult, source: "vision" };
      }
      console.log(`[PIPELINE] Moderate confidence or failure predicted (${guardrailResult.score}). Escalating...`);
    }
  }

  // 3. OCR + LLM Correction Stage (James Chen: "Correcting and Enhancing OCR Results")
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (apiKey.startsWith("AIza") && rawText) {
    try {
      console.log("[PIPELINE] Stage 2: OCR + LLM Hybrid Correction...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
        You are an AI assistant specialized in correcting OCR for restaurant menus.
        Task: Review the following OCR text and extracted items. Correct misspellings, mislinked prices, and layout errors.
        
        OCR Text: ${rawText}
        Existing Extraction: ${JSON.stringify(items)}
        
        Return the final structured menu as a JSON array (name, price, description, category).
      `;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const hybridItems = JSON.parse(jsonMatch[0]);
        if (hybridItems.length > 0) {
          items = hybridItems;
          // Re-audit the corrected items
          const secondAudit = await runGuardrailAudit(imagePath, items, ocrData);
          return { items, guardrail: secondAudit, source: "ocr_llm_corrected" };
        }
      }
    } catch (e) {
      console.error("[HYBRID ERROR]", e.message);
    }
  }

  // Final fallback to heuristic parser
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
