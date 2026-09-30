import { ParsedPage } from './pdfParser';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:section-detector');

// ─── Section Heading Detection ────────────────────────────────────────────────
//
// Banking documents use common heading patterns:
//  - ALL CAPS words (e.g., "NEFT OVERVIEW")
//  - Numbered headings (e.g., "1. Introduction", "2.3 Payment States")
//  - Title Case lines that are short and at the start of a line
//

const HEADING_PATTERNS: RegExp[] = [
  /^[A-Z][A-Z\s\-&/]{4,60}$/,                 // ALL CAPS (5+ chars)
  /^\d+(\.\d+)*[\.\)]\s+[A-Z][A-Za-z\s\-]{3,60}$/, // Numbered: "1.2 Something"
  /^#{1,4}\s+.+/,                              // Markdown headings (if present)
  /^[A-Z][a-zA-Z\s\-&/]{3,50}:$/,             // Title ending in colon
];

const HEADING_MIN_LENGTH = 4;
const HEADING_MAX_LENGTH = 100;

/**
 * Detect section headings within a page's text.
 * Returns the best candidate heading found in the first ~300 chars of the page.
 */
export function detectSectionHeading(page: ParsedPage, prevHeading: string = ''): string {
  const text = page.text.trim();
  if (!text) return prevHeading;

  // Split into lines (approximated by sentence boundaries in continuous text)
  const firstChunk = text.substring(0, 300);
  const lines = firstChunk
    .split(/[.\n]/)
    .map((l) => l.trim())
    .filter((l) => l.length >= HEADING_MIN_LENGTH && l.length <= HEADING_MAX_LENGTH);

  for (const line of lines) {
    for (const pattern of HEADING_PATTERNS) {
      if (pattern.test(line)) {
        logger.debug(`Heading detected: "${line}"`, { page: page.pageNumber });
        return line.replace(/^#{1,4}\s+/, '').trim();
      }
    }
  }

  return prevHeading;
}

/**
 * Build a section heading map: page → heading.
 * Carries the previous heading forward when a new one isn't found.
 */
export function buildSectionMap(pages: ParsedPage[]): Map<number, string> {
  const sectionMap = new Map<number, string>();
  let currentHeading = '';

  for (const page of pages) {
    const detected = detectSectionHeading(page, currentHeading);
    if (detected && detected !== currentHeading) {
      currentHeading = detected;
    }
    sectionMap.set(page.pageNumber, currentHeading);
  }

  return sectionMap;
}
