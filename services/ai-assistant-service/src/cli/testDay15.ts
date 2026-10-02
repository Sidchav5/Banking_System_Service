#!/usr/bin/env ts-node
/**
 * testDay15.ts — Validates Day 15 modules (prompt builder, abstention guard,
 * conversation manager, and chat handler compile check).
 * Does NOT call Gemini API or Qdrant — fully offline.
 */

import { buildPrompt, formatConversationHistory, ABSTENTION_RESPONSE } from '../llm/promptBuilder';
import { shouldAbstain, buildAbstentionResponse } from '../grounding/abstentionGuard';

const PASS = '✅'; const FAIL = '❌';
function assert(cond: boolean, label: string) {
  console.log(`  ${cond ? PASS : FAIL} ${label}`);
  if (!cond) process.exitCode = 1;
}

// ─── Test Prompt Builder ──────────────────────────────────────────────────────

function testPromptBuilder() {
  console.log('\n── Prompt Builder Tests ─────────────────────────────');

  const ctx = `=== KNOWLEDGE BASE CONTEXT ===\n\n[SOURCE 1] Banking Fundamentals (Page 1)\nNEFT stands for National Electronic Funds Transfer.\n\n=== END CONTEXT ===`;

  // General banking query
  const p1 = buildPrompt('What is NEFT?', 'GENERAL_BANKING', ctx);
  assert(p1.systemPrompt.includes('BankFlow AI Assistant'), 'Base system prompt included');
  assert(p1.systemPrompt.includes('[SOURCE 1]'), 'Context block included in prompt');
  assert(p1.systemPrompt.includes('FOCUS'), 'Query type FOCUS instruction included in prompt');
  assert(p1.userMessage === 'What is NEFT?', 'User message preserved');
  assert(p1.estimatedTokens > 0, `Estimated tokens > 0 (got ${p1.estimatedTokens})`);

  // Financial action query — should contain hard-block instructions
  const p2 = buildPrompt('Transfer ₹5000 to Bob', 'FINANCIAL_ACTION', ctx);
  assert(p2.systemPrompt.includes('NEVER execute'), 'Financial action guardrail in prompt');

  // With live data
  const liveCtx = '=== LIVE BANKING DATA ===\n[GET_BALANCE] {"balance": 50000}\n=== END LIVE DATA ===';
  const p3 = buildPrompt('What is my balance?', 'LIVE_ACCOUNT_DATA', ctx, liveCtx);
  assert(p3.systemPrompt.includes('LIVE BANKING DATA'), 'Live data block included');

  // Conversation history
  const history = [
    { role: 'user'      as const, content: 'What is NEFT?' },
    { role: 'assistant' as const, content: 'NEFT is the National Electronic Funds Transfer system.' },
  ];
  const histText = formatConversationHistory(history);
  assert(histText.includes('Customer: What is NEFT?'), 'User message formatted as Customer');
  assert(histText.includes('Assistant: NEFT is'), 'Assistant message formatted correctly');

  const p4 = buildPrompt('Tell me more', 'GENERAL_BANKING', ctx, undefined, histText);
  assert(p4.systemPrompt.includes('CONVERSATION HISTORY'), 'History block injected into prompt');

  console.log(`  Prompt token estimate: ${p1.estimatedTokens} (general query)`);
  console.log(`  Prompt token estimate: ${p3.estimatedTokens} (with live data)`);
}

// ─── Test Abstention Guard ────────────────────────────────────────────────────

function testAbstentionGuard() {
  console.log('\n── Abstention Guard Tests ───────────────────────────');

  // Should NOT abstain — high score, chunks present
  const d1 = shouldAbstain(0.85, 3, 'GENERAL_BANKING');
  assert(!d1.shouldAbstain, 'High score + chunks → do NOT abstain');
  assert(d1.maxScore === 0.85, 'Max score preserved');

  // Should abstain — score below threshold (0.35)
  const d2 = shouldAbstain(0.20, 3, 'GENERAL_BANKING');
  assert(d2.shouldAbstain, 'Low score (0.20 < 0.35) → abstain');
  assert(d2.reason.includes('below threshold'), 'Abstention reason mentions threshold');

  // Should abstain — no chunks
  const d3 = shouldAbstain(0, 0, 'BANKFLOW_DOCUMENTATION');
  assert(d3.shouldAbstain, 'Zero chunks → abstain');

  // Financial action — handled by prompt, NOT abstention
  const d4 = shouldAbstain(0, 0, 'FINANCIAL_ACTION');
  assert(!d4.shouldAbstain, 'FINANCIAL_ACTION → not abstained (handled by prompt)');

  // Unsupported — same
  const d5 = shouldAbstain(0, 0, 'UNSUPPORTED');
  assert(!d5.shouldAbstain, 'UNSUPPORTED → not abstained (handled by prompt)');

  // Build abstention response
  const resp = buildAbstentionResponse(d2);
  assert(resp.abstained, 'buildAbstentionResponse sets abstained=true');
  assert(resp.citations.length === 0, 'Abstention response has empty citations');
  assert(resp.answer === ABSTENTION_RESPONSE, 'Abstention response uses standard message');

  // Exact score at threshold
  const d6 = shouldAbstain(0.35, 2, 'GENERAL_BANKING');
  assert(!d6.shouldAbstain, 'Score AT threshold (0.35) → do NOT abstain');

  // Just below threshold
  const d7 = shouldAbstain(0.3499, 2, 'GENERAL_BANKING');
  assert(d7.shouldAbstain, 'Score 0.3499 < 0.35 → abstain');
}

// ─── Test Chat Handler compile (no actual requests) ───────────────────────────

async function testChatHandlerCompile() {
  console.log('\n── Chat Handler Compile Test ────────────────────────');
  try {
    const { handleChat, handleClearConversation } = await import('../api/chatHandler');
    assert(typeof handleChat === 'function', 'chatHandler exports handleChat function');
    assert(typeof handleClearConversation === 'function', 'chatHandler exports handleClearConversation');
  } catch (err: any) {
    assert(false, `chatHandler import failed: ${err.message}`);
  }
}

// ─── Test Gemini Client compile ────────────────────────────────────────────────

async function testGeminiClientCompile() {
  console.log('\n── Gemini Client Compile Test ───────────────────────');
  try {
    const { getChatModel, generateResponse } = await import('../llm/geminiClient');
    assert(typeof getChatModel === 'function', 'geminiClient exports getChatModel');
    assert(typeof generateResponse === 'function', 'geminiClient exports generateResponse');
  } catch (err: any) {
    assert(false, `geminiClient import failed: ${err.message}`);
  }
}

// ─── Run All ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  BankFlow RAG — Day 15 Tests');
  console.log('══════════════════════════════════════════════════════');

  testPromptBuilder();
  testAbstentionGuard();
  await testChatHandlerCompile();
  await testGeminiClientCompile();

  const code = process.exitCode ?? 0;
  console.log('\n══════════════════════════════════════════════════════');
  console.log(code === 0 ? '  ✅ ALL TESTS PASSED — Day 15 complete' : '  ❌ SOME TESTS FAILED');
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(code);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
