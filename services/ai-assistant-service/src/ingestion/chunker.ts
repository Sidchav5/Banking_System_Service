import { v4 as uuidv4 } from 'uuid';
import { ParsedDocument } from './pdfParser';
import { buildSectionMap } from './sectionDetector';
import { DocumentChunk, ChunkMetadata } from '../schema/chunk';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:chunker');

// ─── Chunking Configuration ───────────────────────────────────────────────────
const TARGET_CHUNK_CHARS = 1400;   // ~350-400 tokens (avg ~3.5 chars/token)
const MAX_CHUNK_CHARS = 2200;      // ~550 tokens hard cap
const OVERLAP_CHARS = 180;         // ~45 tokens overlap between adjacent chunks
const MIN_CHUNK_CHARS = 100;       // Discard tiny fragments

/**
 * Approximate token count (1 token ≈ 4 chars for English banking text).
 */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into sentences for clean chunk boundaries.
 * Banking docs use periods, colons, and newlines as natural boundaries.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space and uppercase, or newlines
  return text
    .split(/(?<=[.!?:;])\s+(?=[A-Z0-9])|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Create sliding-window chunks from a page's text.
 * Each chunk respects sentence boundaries for clean context.
 */
function chunkPageText(
  text: string,
  targetChars: number = TARGET_CHUNK_CHARS,
  overlapChars: number = OVERLAP_CHARS,
): string[] {
  if (text.length <= targetChars) {
    return text.trim().length >= MIN_CHUNK_CHARS ? [text.trim()] : [];
  }

  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let currentChunk = '';
  let overlapBuffer = '';

  for (const sentence of sentences) {
    const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;

    if (candidate.length > MAX_CHUNK_CHARS && currentChunk.length >= MIN_CHUNK_CHARS) {
      // Emit current chunk
      chunks.push(currentChunk.trim());
      // Start next chunk with overlap from the tail of the emitted chunk
      const overlapText = currentChunk.slice(-overlapChars);
      currentChunk = `${overlapText} ${sentence}`;
    } else if (candidate.length > targetChars && currentChunk.length >= MIN_CHUNK_CHARS) {
      chunks.push(currentChunk.trim());
      const overlapText = currentChunk.slice(-overlapChars);
      currentChunk = `${overlapText} ${sentence}`;
    } else {
      currentChunk = candidate;
    }
  }

  // Emit remaining
  if (currentChunk.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Produce all DocumentChunks from a ParsedDocument.
 *
 * Strategy:
 * - Each page becomes a "parent" (full text, used for citation display).
 * - Each page's text is split into overlapping "child" chunks (what gets embedded).
 * - Section headings are detected and propagated.
 */
export function chunkDocument(doc: ParsedDocument): DocumentChunk[] {
  const sectionMap = buildSectionMap(doc.pages);
  const chunks: DocumentChunk[] = [];
  let globalChunkIndex = 0;

  for (const page of doc.pages) {
    if (!page.text || page.text.trim().length < MIN_CHUNK_CHARS) {
      logger.debug(`Skipping empty page`, { doc: doc.docId, page: page.pageNumber });
      continue;
    }

    const sectionHeading = sectionMap.get(page.pageNumber) ?? '';
    const pageText = page.text.trim();
    const childTexts = chunkPageText(pageText);

    if (childTexts.length === 0) continue;

    let charOffset = 0;
    for (let ci = 0; ci < childTexts.length; ci++) {
      const chunkText = childTexts[ci];
      const charStart = pageText.indexOf(chunkText, charOffset);
      const charEnd = charStart + chunkText.length;
      charOffset = Math.max(0, charEnd - OVERLAP_CHARS);

      const chunkId = `${doc.docId}_p${page.pageNumber}_c${ci}`;

      const metadata: ChunkMetadata = {
        chunkId,
        docId: doc.docId,
        docName: doc.docName,
        fileName: doc.fileName,
        page: page.pageNumber,
        sectionHeading,
        chunkIndex: globalChunkIndex++,
        charStart: Math.max(0, charStart),
        charEnd,
        tokenCount: approxTokens(chunkText),
        totalPages: doc.totalPages,
      };

      chunks.push({
        metadata,
        text: chunkText,
        parentText: pageText, // Full page text for citation rendering
      });
    }
  }

  logger.info(`Chunked document: ${doc.docName}`, {
    pages: doc.pages.length,
    chunks: chunks.length,
    avgChunkTokens: Math.round(
      chunks.reduce((s, c) => s + c.metadata.tokenCount, 0) / (chunks.length || 1),
    ),
  });

  return chunks;
}

/**
 * Chunk all documents and return a flat array of DocumentChunks.
 */
export function chunkAllDocuments(docs: ParsedDocument[]): DocumentChunk[] {
  const allChunks: DocumentChunk[] = [];

  for (const doc of docs) {
    const docChunks = chunkDocument(doc);
    allChunks.push(...docChunks);
  }

  logger.info(`Total chunks across ${docs.length} documents: ${allChunks.length}`);
  return allChunks;
}
