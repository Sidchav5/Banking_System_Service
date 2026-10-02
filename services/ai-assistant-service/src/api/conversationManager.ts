import { createClient } from 'redis';
import { config } from '../config';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:conversation');

// ─── Conversation Manager ─────────────────────────────────────────────────────
// Stores multi-turn conversation history in Redis with TTL.
// Falls back to an in-memory store if Redis is unavailable.

export interface Message {
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string;
}

export interface Conversation {
  conversationId: string;
  userId:         string;
  messages:       Message[];
  createdAt:      string;
  updatedAt:      string;
}

// ── In-memory fallback ────────────────────────────────────────────────────────

const memoryStore = new Map<string, Conversation>();

// ── Redis client (optional) ───────────────────────────────────────────────────

let redisClient: ReturnType<typeof createClient> | null = null;
let redisAvailable = false;

async function getRedis() {
  if (redisClient && redisAvailable) return redisClient;
  if (redisClient) return null;  // Already tried, failed

  try {
    redisClient = createClient({ url: config.redisUrl });
    redisClient.on('error', (e) => {
      if (redisAvailable) {
        logger.warn('Redis disconnected — using in-memory fallback', { error: e.message });
        redisAvailable = false;
      }
    });
    await redisClient.connect();
    redisAvailable = true;
    logger.info('Conversation store connected to Redis');
    return redisClient;
  } catch (e: any) {
    logger.warn('Redis unavailable — conversations stored in-memory', { error: e.message });
    redisAvailable = false;
    return null;
  }
}

const TTL = config.conversationTtlSeconds;
const KEY  = (id: string) => `bankflow:ai:conv:${id}`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get or create a conversation for the given conversationId.
 */
export async function getConversation(
  conversationId: string,
  userId: string,
): Promise<Conversation> {
  const redis = await getRedis();

  if (redis) {
    const raw = await redis.get(KEY(conversationId));
    if (raw) return JSON.parse(raw) as Conversation;
  } else {
    const existing = memoryStore.get(conversationId);
    if (existing) return existing;
  }

  // Create new conversation
  const conv: Conversation = {
    conversationId,
    userId,
    messages:  [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveConversation(conv);
  return conv;
}

/**
 * Append a user message and assistant response to the conversation.
 */
export async function appendMessages(
  conversationId: string,
  userId:         string,
  userMessage:    string,
  assistantReply: string,
): Promise<void> {
  const conv = await getConversation(conversationId, userId);
  const now  = new Date().toISOString();

  conv.messages.push(
    { role: 'user',      content: userMessage,    timestamp: now },
    { role: 'assistant', content: assistantReply, timestamp: now },
  );

  // Keep last 20 messages (10 turns) to avoid context explosion
  if (conv.messages.length > 20) {
    conv.messages = conv.messages.slice(-20);
  }

  conv.updatedAt = now;
  await saveConversation(conv);
}

/**
 * Get recent messages for conversation history injection into the prompt.
 */
export async function getRecentMessages(
  conversationId: string,
  userId:         string,
  maxTurns = 5,
): Promise<Message[]> {
  const conv = await getConversation(conversationId, userId);
  return conv.messages.slice(-(maxTurns * 2));
}

/**
 * Clear a conversation (e.g., user clicks "New Chat").
 */
export async function clearConversation(conversationId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.del(KEY(conversationId));
  } else {
    memoryStore.delete(conversationId);
  }
  logger.info('Conversation cleared', { conversationId });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function saveConversation(conv: Conversation): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(KEY(conv.conversationId), JSON.stringify(conv), { EX: TTL });
  } else {
    memoryStore.set(conv.conversationId, conv);
    // Simple TTL cleanup for in-memory store
    setTimeout(() => memoryStore.delete(conv.conversationId), TTL * 1000);
  }
}
