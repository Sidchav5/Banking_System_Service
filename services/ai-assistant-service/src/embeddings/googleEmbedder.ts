import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:embedder');

// ─── Google Embedding Client ──────────────────────────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set. Cannot generate embeddings.');
    }
    _genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return _genAI;
}

/**
 * Embed a single text string.
 * Returns a 768-dimensional vector via text-embedding-004.
 */
export async function embedText(text: string): Promise<number[]> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: config.embeddingModel });

  let attempts = 0;
  while (true) {
    try {
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (err: any) {
      attempts++;
      if (attempts >= 5) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
      logger.warn(`embedText failed, retry in ${delay}ms`, { attempt: attempts, error: err.message });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Embed multiple texts using batchEmbedContents (up to 100 per request).
 * Splits into sub-batches and retries each batch independently on failure.
 */
export async function embedBatch(
  texts: string[],
  batchSize: number = 50,
): Promise<number[][]> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: config.embeddingModel });
  const allEmbeddings: number[][] = [];
  const totalBatches = Math.ceil(texts.length / batchSize);

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    logger.info(`Embedding batch ${batchNum}/${totalBatches}`, { size: batch.length });

    let attempts = 0;
    while (true) {
      try {
        const requests = batch.map((text) => ({
          content: { parts: [{ text }], role: 'user' },
        }));
        const batchResult = await model.batchEmbedContents({ requests });
        allEmbeddings.push(...batchResult.embeddings.map((e) => e.values));
        break;
      } catch (err: any) {
        attempts++;
        if (attempts >= 5) throw err;
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
        logger.warn(`Batch ${batchNum} failed, retry in ${delay}ms`, {
          attempt: attempts,
          error: err.message,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Rate-limit buffer between batches
    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return allEmbeddings;
}
