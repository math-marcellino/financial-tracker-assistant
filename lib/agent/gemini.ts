import { GoogleGenAI } from "@google/genai";

// Built on first use, not at module load. `next build` imports route modules to collect
// page data, so a module-level throw would fail the whole build rather than the one
// request that actually needs the key.
let client: GoogleGenAI | undefined;

export const getGemini = (): GoogleGenAI => {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set.");
    }

    client = new GoogleGenAI({ apiKey });
  }

  return client;
};

// The `-latest` alias tracks Google's current flash model rather than pinning one that
// eventually gets retired.
export const GEMINI_MODEL = "gemini-flash-latest";
