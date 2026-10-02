import { Citation } from '../schema/chunk';
import { ABSTENTION_RESPONSE } from '../llm/promptBuilder';
import { retrievalConfig } from '../config/retrievalConfig';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:abstention');

// ─── Abstention Guard ─────────────────────────────────────────────────────────
//
// Decides whether the LLM should answer or abstain.
// Abstention triggers when the retrieved context is not relevant enough,
// preventing hallucinated answers about topics not in the knowledge base.

export interface AbstentionDecision {
  shouldAbstain: boolean;
  reason:        string;
  maxScore:      number;
  threshold:     number;
}

/**
 * Evaluate whether to abstain from answering based on retrieval quality.
 *
 * Abstain if:
 * 1. No chunks were retrieved at all
 * 2. The top chunk's relevance score is below the abstention threshold
 * 3. The query type is FINANCIAL_ACTION or UNSUPPORTED (hard block)
 */
export function shouldAbstain(
  topChunkScore: number,
  chunkCount:    number,
  queryType:     string,
): AbstentionDecision {
  const threshold = retrievalConfig.abstentionThreshold;

  // Hard blocks — no retrieval needed
  if (queryType === 'FINANCIAL_ACTION' || queryType === 'UNSUPPORTED') {
    return {
      shouldAbstain: false,  // These have dedicated prompt instructions, not abstention
      reason:        `Hard-blocked query type: ${queryType}`,
      maxScore:      topChunkScore,
      threshold,
    };
  }

  // No context retrieved
  if (chunkCount === 0) {
    logger.warn('Abstaining: no chunks retrieved', { queryType });
    return {
      shouldAbstain: true,
      reason:        'No relevant context found in the knowledge base.',
      maxScore:      0,
      threshold,
    };
  }

  // Score below threshold
  if (topChunkScore < threshold) {
    logger.warn('Abstaining: top chunk score below threshold', {
      topChunkScore: topChunkScore.toFixed(4),
      threshold,
      queryType,
    });
    return {
      shouldAbstain: true,
      reason:        `Highest relevance score (${topChunkScore.toFixed(3)}) is below threshold (${threshold}).`,
      maxScore:      topChunkScore,
      threshold,
    };
  }

  logger.debug('Proceeding with answer', {
    topChunkScore: topChunkScore.toFixed(4),
    threshold,
    chunkCount,
  });

  return {
    shouldAbstain: false,
    reason:        'Sufficient context retrieved.',
    maxScore:      topChunkScore,
    threshold,
  };
}

/**
 * Build the abstention response for the API.
 */
export function buildAbstentionResponse(decision: AbstentionDecision): {
  answer:    string;
  citations: Citation[];
  abstained: boolean;
  reason:    string;
} {
  return {
    answer:    ABSTENTION_RESPONSE,
    citations: [],
    abstained: true,
    reason:    decision.reason,
  };
}
