#!/usr/bin/env ts-node
/**
 * ingest.ts — PDF Ingestion CLI
 *
 * Usage:
 *   ts-node src/cli/ingest.ts [--dir <path>] [--out <output.jsonl>]
 *
 * Parses all PDFs in the knowledge dir, chunks them, and writes chunks.jsonl.
 * This is the first step in the RAG pipeline — output feeds into buildIndex.ts.
 */

import path from 'path';
import fs from 'fs';
import { parseAllPdfs } from '../ingestion/pdfParser';
import { chunkAllDocuments } from '../ingestion/chunker';
import { DocumentChunk } from '../schema/chunk';

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dirArg = args[args.indexOf('--dir') + 1];
const outArg = args[args.indexOf('--out') + 1];

// __dirname when running via ts-node = services/ai-assistant-service/src/cli
// We need to go up 4 levels to reach workspace root, then into BankFlow_RAG_Knowledge_Base
const knowledgeDir = dirArg ?? path.resolve(__dirname, '../../../../BankFlow_RAG_Knowledge_Base');
const outputFile = outArg ?? path.resolve(__dirname, '../../data/chunks.jsonl');

// ── Ensure output directory exists ───────────────────────────────────────────
const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  BankFlow RAG — PDF Ingestion Pipeline');
  console.log('══════════════════════════════════════════════════════\n');

  console.log(`📂 Knowledge directory: ${knowledgeDir}`);
  console.log(`📄 Output file: ${outputFile}\n`);

  // ── Step 1: Parse PDFs ────────────────────────────────────────────────────
  console.log('── Step 1: Parsing PDFs ─────────────────────────────');
  let docs;
  try {
    docs = await parseAllPdfs(knowledgeDir);
  } catch (err: any) {
    console.error(`❌ Failed to parse PDFs: ${err.message}`);
    process.exit(1);
  }

  console.log(`✅ Parsed ${docs.length} documents:`);
  docs.forEach((d) => {
    console.log(`   • ${d.docName} — ${d.totalPages} pages, ${d.pages.length} pages with text`);
  });
  console.log();

  // ── Step 2: Chunk Documents ───────────────────────────────────────────────
  console.log('── Step 2: Chunking Documents ───────────────────────');
  const chunks = chunkAllDocuments(docs);

  // Per-document stats
  const docChunkCounts = new Map<string, number>();
  for (const chunk of chunks) {
    const prev = docChunkCounts.get(chunk.metadata.docName) ?? 0;
    docChunkCounts.set(chunk.metadata.docName, prev + 1);
  }
  docChunkCounts.forEach((count, docName) => {
    const avgTokens = Math.round(
      chunks
        .filter((c) => c.metadata.docName === docName)
        .reduce((s, c) => s + c.metadata.tokenCount, 0) / count,
    );
    console.log(`   • ${docName}: ${count} chunks, avg ${avgTokens} tokens/chunk`);
  });
  console.log(`\n✅ Total chunks: ${chunks.length}`);
  console.log();

  // ── Step 3: Write chunks.jsonl ────────────────────────────────────────────
  console.log('── Step 3: Writing chunks.jsonl ─────────────────────');
  const lines = chunks.map((chunk) => {
    // Strip parentText from JSONL to keep file size manageable
    // (parentText is large and only needed at query time via chunkId lookup)
    const { parentText: _parentText, ...rest } = chunk;
    return JSON.stringify(rest);
  });

  fs.writeFileSync(outputFile, lines.join('\n') + '\n', 'utf-8');
  const fileSizeKb = Math.round(fs.statSync(outputFile).size / 1024);
  console.log(`✅ Written: ${outputFile} (${fileSizeKb} KB, ${chunks.length} lines)`);

  // ── Step 4: Sample preview ────────────────────────────────────────────────
  console.log('\n── Step 4: Sample Chunk Preview ─────────────────────');
  const sample = chunks[Math.floor(chunks.length / 2)];
  console.log(`   Chunk ID:   ${sample.metadata.chunkId}`);
  console.log(`   Document:   ${sample.metadata.docName}`);
  console.log(`   Page:       ${sample.metadata.page} / ${sample.metadata.totalPages}`);
  console.log(`   Section:    ${sample.metadata.sectionHeading || '(none detected)'}`);
  console.log(`   Tokens:     ~${sample.metadata.tokenCount}`);
  console.log(`   Text:       "${sample.text.substring(0, 150).replace(/\n/g, ' ')}..."`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  INGESTION COMPLETE');
  console.log('──────────────────────────────────────────────────────');
  console.log(`  Documents parsed:  ${docs.length}`);
  console.log(`  Total chunks:      ${chunks.length}`);
  console.log(`  Output:            ${outputFile}`);
  console.log('  Next step:         npm run build-index');
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
