import { GoogleGenerativeAI } from '@google/generative-ai';
import { QueryType } from '../schema/chunk';
import { config } from '../config';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:query-rewriter');

// ─── Query Rewriter ───────────────────────────────────────────────────────────
//
// Expands vague queries into multiple retrieval-optimised alternatives.
// Uses Gemini Flash (low temperature) to generate semantically related terms.
//
// CRITICAL RULE: Rewriting must NEVER alter financial parameters.
//   ✅ "Why is my money stuck?" → ["payment pending", "credit pending", ...]
//   ❌ "Transfer ₹5000" → should not be rewritten at all (FINANCIAL_ACTION)

const REWRITE_SYSTEM_PROMPT = `You are a search query expansion assistant for a banking knowledge base.
Given a user's banking question, generate 3-5 alternative search queries that would help retrieve relevant documentation.

STRICT RULES:
1. NEVER modify any financial amounts, account numbers, or transaction IDs.
2. NEVER add financial amounts if not in the original query.
3. Output ONLY a JSON array of strings. No explanation, no markdown, no other text.
4. Each alternative should be a short phrase (2-6 words), not a full sentence.
5. Focus on banking terminology and concepts, not user-specific data.

Example:
Input: "Why is my money stuck?"
Output: ["payment pending", "credit pending", "payment timeout", "reconciliation delay", "transaction stuck"]`;

// Domain-specific vague query expansions (fast path — no LLM needed)
const DOMAIN_EXPANSIONS: Record<string, string[]> = {
  'why is my money stuck':     ['payment pending', 'credit pending', 'payment timeout', 'reconciliation delay'],
  'transfer not working':      ['payment failed', 'debit failed', 'payment saga reversed', 'transfer error'],
  'payment failed':            ['payment saga reversed', 'insufficient balance', 'NEFT return', 'debit failed'],
  'what is pending':           ['payment pending status', 'credit pending state', 'DISPATCHED payment'],
  'why pending':               ['payment pending state', 'credit pending', 'awaiting acknowledgment'],
  'money not received':        ['credit pending', 'NEFT processing', 'payment dispatched', 'settlement delay'],
  'transaction failed':        ['payment saga reversal', 'atomic transaction failed', 'rollback', 'idempotency'],
  'payment reversed':          ['payment saga compensation', 'reversal', 'refund', 'NEFT return'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalise(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findDomainExpansion(query: string): string[] | null {
  const norm = normalise(query);
  for (const [key, expansions] of Object.entries(DOMAIN_EXPANSIONS)) {
    if (norm.includes(key)) return expansions;
  }
  return null;
}

// ─── Main rewriter ────────────────────────────────────────────────────────────

/**
 * Rewrite a query into multiple search alternatives.
 *
 * Returns:
 * - Original query always included as first element
 * - Domain expansions (fast, no API cost) when matched
 * - LLM-generated expansions for vague queries (when Gemini key available)
 * - Just the original query if rewriting is not needed/possible
 */
export async function rewriteQuery(
  query: string,
  queryType: QueryType,
): Promise<string[]> {
  // Financial actions and unsupported queries — NEVER rewrite
  if (queryType === 'FINANCIAL_ACTION' || queryType === 'UNSUPPORTED') {
    return [query];
  }

  // Direct/specific queries don't need expansion
  if (isSpecificQuery(query)) {
    logger.debug('Specific query — skipping rewrite', { query: query.substring(0, 60) });
    return [query];
  }

  // Fast path: known domain expansion
  const domainExpansion = findDomainExpansion(query);
  if (domainExpansion) {
    const result = [query, ...domainExpansion];
    logger.debug('Domain expansion applied', { original: query, alternatives: domainExpansion });
    return result;
  }

  // LLM path: only for vague queries and when API key is available
  if (isVagueQuery(query) && config.geminiApiKey) {
    try {
      const expanded = await llmExpandQuery(query);
      if (expanded.length > 0) {
        const result = [query, ...expanded];
        logger.debug('LLM query rewrite complete', {
          original: query.substring(0, 60),
          alternatives: expanded,
        });
        return result;
      }
    } catch (err: any) {
      logger.warn('LLM query rewrite failed — using original query', { error: err.message });
    }
  }

  return [query];
}

/**
 * Check if a query is specific enough to not need rewriting.
 * Specific queries reference exact terms, IDs, or acronyms.
 */
function isSpecificQuery(query: string): boolean {
  const specificPatterns = [
    /\b[A-Z]{3,6}\d{4,}\b/,           // Transaction IDs like TX1234, PAY456
    /\b(NEFT|RTGS|IMPS|UPI|IFSC)\b/i, // Banking acronyms
    /\b(credit_pending|debit_pending|dispatched)\b/i, // Exact state names
    /balance|beneficiar/i,             // Direct live-data queries
  ];
  return specificPatterns.some((p) => p.test(query));
}

/**
 * Check if a query is vague enough to benefit from rewriting.
 */
function isVagueQuery(query: string): boolean {
  const vagueIndicators = [
    /\b(stuck|not\s+working|doesn'?t\s+work|problem|issue|trouble|help)\b/i,
    /\bwhy\s+(is|are|did|does)\b/i,
    /\bwhat\s+happened\b/i,
    /\b(slow|delay|long|late)\b/i,
  ];
  return vagueIndicators.some((p) => p.test(query)) && query.split(' ').length <= 10;
}

/**
 * Use Gemini Flash to generate query alternatives.
 * Returns an empty array on failure rather than throwing.
 */
async function llmExpandQuery(query: string): Promise<string[]> {
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: config.chatModel,
    generationConfig: {
      temperature: 0.1,   // Low temp for consistent, focused expansions
      maxOutputTokens: 200,
    },
  });

  const prompt = `${REWRITE_SYSTEM_PROMPT}\n\nInput: "${query}"\nOutput:`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Parse JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((s) => typeof s === 'string' && s.length > 0 && s.length < 100)
    .slice(0, 5);
}
