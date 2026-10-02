import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';
import { config } from '../config';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:gemini');

// ─── Gemini Client ────────────────────────────────────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;
let _chatModel: GenerativeModel | null = null;

const GENERATION_CONFIG: GenerationConfig = {
  temperature:      0.2,    // Low temp: factual, grounded answers
  topP:             0.9,
  topK:             40,
  maxOutputTokens:  2048,
};

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set. Cannot call Gemini.');
    }
    _genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return _genAI;
}

export function getChatModel(): GenerativeModel {
  if (!_chatModel) {
    _chatModel = getGenAI().getGenerativeModel({
      model:            config.chatModel,
      generationConfig: GENERATION_CONFIG,
    });
  }
  return _chatModel;
}

/**
 * Generate a response from Gemini given a fully-assembled prompt.
 * Returns the raw text response.
 */
export async function generateResponse(
  systemPrompt: string,
  userMessage:  string,
  history?:     Array<{ role: 'user' | 'model'; parts: string }>,
): Promise<string> {
  const model = getChatModel();

  let attempts = 0;
  while (true) {
    try {
      // Build the prompt as a single user turn with system context prepended
      const fullPrompt = `${systemPrompt}\n\n=== USER QUESTION ===\n${userMessage}`;

      const result = await model.generateContent(fullPrompt);
      const text   = result.response.text();

      logger.info('Gemini response generated', {
        promptChars:   fullPrompt.length,
        responseChars: text.length,
        tokensUsed:    result.response.usageMetadata?.totalTokenCount ?? 'unknown',
      });

      return text;
    } catch (err: any) {
      attempts++;
      if (attempts >= 3) throw err;
      const delay = 1000 * Math.pow(2, attempts);
      logger.warn(`Gemini call failed, retry in ${delay}ms`, { attempt: attempts, error: err.message });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
