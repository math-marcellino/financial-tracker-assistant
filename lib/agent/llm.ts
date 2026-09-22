import Groq from "groq-sdk";

// Built on first use, not at module load. `next build` imports route modules to collect
// page data, so a module-level throw would fail the whole build rather than the one
// request that actually needs the key.
let client: Groq | undefined;

export const getGroq = (): Groq => {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set.");
    }

    client = new Groq({ apiKey });
  }

  return client;
};

// The largest tool-use-capable model this account can reach. Smaller models are
// noticeably worse at picking a category and expanding shorthand amounts.
export const LLM_MODEL = "openai/gpt-oss-120b";
