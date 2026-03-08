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
    { model: "gemini-2.0-flash-lite", version: "v1beta" },
    { model: "gemini-2.0-flash", version: "v1beta" },
    { model: "gemini-1.5-flash", version: "v1beta" },
    { model: "gemini-1.5-flash", version: "v1" },
    { model: "gemini-1.5-pro", version: "v1beta" }
  ];

  const data = fs.readFileSync(imagePath).toString("base64");
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  const imagePart = { inlineData: { data, mimeType } };

  const prompt = `
    You are a specialized Multimodal Menu Transcription AI (DoorDash Vision Model candidate).
    Analyze this restaurant menu image and extract a structured JSON list of dishes.
    
    [GUIDELINES]:
    - Layout Interpretation: Menus may be multi-column or non-linear. Use visual cues to pair items with correct attributes.
    - Quality Compensation: If lighting is dim or there is glare, use surrounding context to infer missing characters.
    
    For each dish, include:
    - "name": The name of the dish.
    - "price": The exact price (e.g., "$10.00", "₹250").
    - "description": A short description based on visible details or standard menu context.
    - "category": The menu section it belongs to (e.g., "Appetizers", "Main Course").
    - "location_hint": A brief string describing where it is (e.g., "Top Left", "Bottom Right").

    Return ONLY a valid JSON array of objects. Do not include markdown formatting or extra text.
  `;

  let lastError = "";

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
      lastError = err.message;
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
        } else {
          const errData = await restRes.json().catch(() => ({}));
          lastError = errData.error?.message || restRes.statusText;
        }
      } catch (e) { }
    }
  }

  console.log("[GEMINI] Vision failed. Running diagnostics...");
  const available = await listAvailableModels(apiKey);
  
  if (lastError.includes("Quota") || lastError.includes("429")) {
    return [{
      name: "⚠️ AI Quota Exceeded",
      price: "LIMIT",
      description: `Your Gemini API Key has 0 quota or has reached its limit. Error: ${lastError.substring(0, 100)}`
    }];
  }
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const data = fs.readFileSync(imagePath).toString("base64");
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
    const imagePart = { inlineData: { data, mimeType } };

    const ocrSnippet = ocrData?.text ? ocrData.text.substring(0, 800) : "No OCR text";
    const ocrConfidence = ocrData?.confidence || "N/A";

    const auditPrompt = `
      Perform a 'Multi-view' Guardrail Audit as described by DoorDash Engineering.
      Your goal is to predict if this transcription will meet the high accuracy bar required for production.

      [VIEW 1: Image-level Features]: Check for failure modes like "Low photographic quality" (dark, blurry, glare).
      [VIEW 2: OCR-derived Features]: Analyze the raw extraction for "junk text", "fragments", and scrambling:
        - Raw OCR Snippet: ${ocrSnippet}
        - Tesseract Confidence: ${ocrConfidence}
      [VIEW 3: LLM-output Features]: Evaluate the structured transcription for "Inconsistent menu structures" or "Incomplete menus":
        - Extracted Items Sample: ${JSON.stringify(extractedItems.slice(0, 10))}

      FAILURE MODE TAXONOMY:
      - "Inconsistent Structure": OCR scrambled reading order (e.g. multi-column mixup).
      - "Incomplete Menu": Cropped photos or attributes without parent items.
      - "Low Quality": Dim lighting/glare making text unreadable.

      Return strictly JSON: 
      { 
        "score": (0-10), 
        "needsReview": boolean, 
        "reason": "Identify the primary failure mode if score < 7",
        "features": { "imageQuality": "high/med/low", "ocrReliability": "high/med/low", "outputConsistency": "high/med/low" }
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
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  let items = [];
  let guardrailResult = { score: 0, needsReview: true, reason: "Initializing..." };
  let lastError = "";

  // 1. Multimodal Stage (Vision Transformer / Gemini Vision)
  if (imagePath && fs.existsSync(imagePath)) {
    console.log("[PIPELINE] Stage 1: Multimodal Vision extraction...");
    
    // Inline the vision logic to capture errors/state better
    const genAI = new GoogleGenerativeAI(apiKey);
    const configs = [
      { model: "gemini-2.0-flash", version: "v1beta" },
      { model: "gemini-2.0-flash-lite", version: "v1beta" },
      { model: "gemini-2.5-flash", version: "v1beta" },
      { model: "gemini-1.5-flash", version: "v1beta" }
    ];

    const data = fs.readFileSync(imagePath).toString("base64");
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
    const imagePart = { inlineData: { data, mimeType } };

    const prompt = `
      You are a specialized Multimodal Menu Parser.
      [JAMES CHEN TECHNIQUE]: Use the following OCR text as an additional context layer to improve your interpretation of the image:
      "${rawText.substring(0, 500)}..."
      
      Extract a JSON array of objects: 
      { "name": string, "price": string, "description": string, "category": string, "source_score": number }
      Correct any spelling mistakes detected in the OCR using visual context from the image.
      Return ONLY valid JSON.
    `;

    let visionResult = { items: [], guardrail: null };
    for (const config of configs) {
      if (visionResult.items.length > 0) break;
      try {
        console.log(`[PIPELINE] Trying Vision: ${config.model}...`);
        const model = genAI.getGenerativeModel({ model: config.model }, { apiVersion: config.version });
        const result = await model.generateContent([prompt, imagePart]);
        const text = (await result.response).text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          visionResult.items = JSON.parse(jsonMatch[0]);
          visionResult.guardrail = await runGuardrailAudit(imagePath, visionResult.items, ocrData);
        }
      } catch (err) {
        lastError = err.message;
      }
    }
    
    // If vision is "Excellent" (Score 9+), return immediately to save latency (DoorDash Efficiency)
    if (visionResult.guardrail?.score >= 9) {
      return { items: visionResult.items, guardrail: visionResult.guardrail, source: "vision" };
    }

    // 3. OCR + LLM Correction Stage (Candidate Model 2)
    if (apiKey.startsWith("AIza") && rawText) {
      try {
        console.log("[PIPELINE] Stage 2: OCR + LLM Hybrid Correction...");
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const correctionPrompt = `
          You are an AI assistant specialized in understanding images and correcting OCR (James Chen Technique).
          Task: Review the following OCR text and extract a structured menu JSON.
          OCR Text: ${rawText}
          
          Correct any errors from OCR and return a clean JSON array of objects:
          { "name": string, "price": string, "description": string, "category": string }
          Return ONLY valid JSON.
        `;
        const result = await model.generateContent(correctionPrompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const ocrItems = JSON.parse(jsonMatch[0]);
          const ocrGuardrail = await runGuardrailAudit(imagePath, ocrItems, ocrData);
          
          // Arbitration: Pick the best one
          if (!visionResult.guardrail || ocrGuardrail.score > visionResult.guardrail.score) {
            console.log(`[PIPELINE] Arbitrator: OCR+LLM outperformed Vision (${ocrGuardrail.score} > ${visionResult.guardrail?.score || 0})`);
            return { items: ocrItems, guardrail: ocrGuardrail, source: "ocr_llm_corrected" };
          }
        }
      } catch (e) {
        lastError = e.message;
      }
    }
    
    // Arbitration Successor: If we reached here without returning, pick the best Vision outcome
    if (visionResult.items.length > 0) {
      items = visionResult.items;
      guardrailResult = visionResult.guardrail;
    }
  }

  // Final fallback to heuristic parser if AI failed
  if (items.length === 0) {
    items = parseMenuTextToItems(rawText);
  } else {
    // Post-process AI items to ensure they have all fields
    items = items.map(it => ({
      name: it.name || "Unknown Item",
      price: it.price || "—",
      description: it.description && it.description.length > 5 ? it.description : parseMenuTextToItems(it.name || "")[0]?.description || "Delicious dish."
    }));
  }

  const isQuotaError = lastError.includes("Quota") || lastError.includes("429");

  return {
    items,
    guardrail: guardrailResult.score > 0 ? guardrailResult : { 
      score: isQuotaError ? 0 : 3, 
      needsReview: true, 
      reason: isQuotaError ? "AI Quota Limit reached (0/0). Please use a NEW API Key." : "Heuristic fallback" 
    },
    source: isQuotaError ? "quota_limit_error" : (items.length > 1 ? "ocr_llm_corrected" : "heuristic")
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
