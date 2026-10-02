import { RetrievedChunk } from '../schema/chunk';
import { TrackedSource, trackSources } from './sourceTracker';
import { retrievalConfig } from '../config/retrievalConfig';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:context-builder');

// ─── Context Builder ──────────────────────────────────────────────────────────
//
// Takes the top-N reranked chunks and assembles them into the structured
// context block injected into the LLM system prompt.
//
// Format used in the prompt:
//
//   === KNOWLEDGE BASE CONTEXT ===
//
//   [SOURCE 1] Banking Fundamentals (Page 3, Section: NEFT Overview)
//   NEFT (National Electronic Funds Transfer) is a nation-wide payment system...
//
//   [SOURCE 2] BankFlow Product Manual (Page 7, Section: Payment States)
//   CREDIT_PENDING indicates that the debit has been posted but...
//
//   === END CONTEXT ===

export interface BuiltContext {
  contextBlock: string;       // Full text injected into LLM prompt
  sources: TrackedSource[];   // Tracked sources for citation extraction
  totalTokens: number;        // Approximate token count of the context block
  truncated: boolean;         // True if some chunks were dropped due to token limit
}

/**
 * Build the LLM context block from a list of reranked chunks.
 *
 * Chunks are included in rerank order until the token budget is exhausted.
 * Each chunk is labelled [SOURCE N] for citation tracing.
 */
export function buildContext(chunks: RetrievedChunk[]): BuiltContext {
  if (chunks.length === 0) {
    return {
      contextBlock: '=== KNOWLEDGE BASE CONTEXT ===\n\n(No relevant context found)\n\n=== END CONTEXT ===',
      sources: [],
      totalTokens: 0,
      truncated: false,
    };
  }

  const maxTokens = retrievalConfig.maxContextTokens;
  const includedChunks: RetrievedChunk[] = [];
  let tokenBudget = maxTokens;
  let truncated = false;

  for (const chunk of chunks) {
    const chunkTokens = approxTokens(chunk.text);
    // Reserve ~50 tokens for the source header line
    if (chunkTokens + 50 > tokenBudget) {
      truncated = true;
      logger.debug('Context token budget exhausted', {
        includedChunks: includedChunks.length,
        droppedChunks: chunks.length - includedChunks.length,
      });
      break;
    }
    includedChunks.push(chunk);
    tokenBudget -= chunkTokens + 50;
  }

  // Build source tracking for included chunks
  const sources = trackSources(includedChunks);

  // Assemble context block
  const lines: string[] = ['=== KNOWLEDGE BASE CONTEXT ==='];

  for (const source of sources) {
    const { chunk, contextIndex, citation } = source;
    const header = buildSourceHeader(contextIndex, citation.docName, citation.page, citation.sectionHeading);
    lines.push('');
    lines.push(header);
    lines.push(chunk.text.trim());
  }

  lines.push('');
  lines.push('=== END CONTEXT ===');

  const contextBlock = lines.join('\n');
  const totalTokens = approxTokens(contextBlock);

  logger.info('Context built', {
    chunks: includedChunks.length,
    totalTokens,
    truncated,
    sources: sources.map((s) => `${s.citation.docName} p.${s.citation.page}`),
  });

  return { contextBlock, sources, totalTokens, truncated };
}

/**
 * Build the [SOURCE N] header line for each chunk in the context block.
 */
function buildSourceHeader(
  index: number,
  docName: string,
  page: number,
  sectionHeading: string,
): string {
  const section = sectionHeading ? `, Section: ${sectionHeading}` : '';
  return `[SOURCE ${index}] ${docName} (Page ${page}${section})`;
}

/**
 * Build a live-data context block to inject tool call results into the prompt.
 * Used for LIVE_ACCOUNT_DATA, LIVE_TRANSACTION_DATA, and HYBRID queries.
 */
export function buildLiveDataContext(toolResults: Record<string, unknown>): string {
  if (Object.keys(toolResults).length === 0) return '';

  const lines = ['=== LIVE BANKING DATA ===', ''];

  for (const [toolName, result] of Object.entries(toolResults)) {
    lines.push(`[${toolName.toUpperCase()}]`);
    lines.push(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    lines.push('');
  }

  lines.push('=== END LIVE DATA ===');
  return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
