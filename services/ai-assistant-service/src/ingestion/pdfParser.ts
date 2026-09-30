import fs from 'fs';
import path from 'path';
// @ts-ignore — pdf-parse has no bundled types in all versions
import pdfParse from 'pdf-parse';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:pdf-parser');

export interface ParsedPage {
  pageNumber: number;   // 1-based
  text: string;         // Raw extracted text for this page
}

export interface ParsedDocument {
  fileName: string;
  docId: string;
  docName: string;
  totalPages: number;
  pages: ParsedPage[];
  rawText: string;
}

// Friendly display names keyed by filename prefix
const DOC_NAMES: Record<string, string> = {
  '01_Banking_Fundamentals': 'Banking Fundamentals',
  '02_Payments_and_Transfers': 'Payments and Transfers',
  '03_BankFlow_Product_Manual': 'BankFlow Product Manual',
  '04_Banking_Security_Reliability': 'Banking Security & Reliability',
  '05_Distributed_Banking_Architecture': 'Distributed Banking Architecture',
};

/**
 * Parse a single PDF file into structured pages with text.
 *
 * pdf-parse calls our pagerender callback once per page, letting us
 * collect per-page text rather than only the combined document text.
 */
export async function parsePdf(filePath: string): Promise<ParsedDocument> {
  const absolutePath = path.resolve(filePath);
  const buffer = fs.readFileSync(absolutePath);
  const fileName = path.basename(filePath, '.pdf');
  const docId = fileName;
  const docName = DOC_NAMES[fileName] ?? fileName.replace(/_/g, ' ');

  const pages: ParsedPage[] = [];

  // pdf-parse options: custom page renderer captures per-page text
  const options = {
    // Called once per page during parsing
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push({
        pageNumber: pageData.pageNumber,
        text: pageText,
      });

      return pageText;
    },
  };

  let result: any;
  try {
    result = await pdfParse(buffer, options);
  } catch (err: any) {
    logger.warn(`pdf-parse pagerender hook not supported — falling back to full text split`, {
      fileName,
      error: err.message,
    });
    // Fallback: parse without pagerender, split by form feed (\f) heuristic
    result = await pdfParse(buffer);
    const rawPages = result.text.split('\f');
    pages.length = 0; // clear
    rawPages.forEach((text: string, i: number) => {
      if (text.trim().length > 0) {
        pages.push({ pageNumber: i + 1, text: text.replace(/\s+/g, ' ').trim() });
      }
    });
  }

  // If per-page callback fired but pages came back empty (some PDFs), fall back
  if (pages.length === 0) {
    const rawPages = result.text.split('\f');
    rawPages.forEach((text: string, i: number) => {
      if (text.trim().length > 0) {
        pages.push({ pageNumber: i + 1, text: text.replace(/\s+/g, ' ').trim() });
      }
    });
  }

  const totalPages = result.numpages ?? pages.length;
  logger.info(`Parsed PDF: ${docName}`, { totalPages, pagesWithText: pages.length });

  return {
    fileName,
    docId,
    docName,
    totalPages,
    pages,
    rawText: result.text,
  };
}

/**
 * Parse all PDF files in a directory.
 */
export async function parseAllPdfs(dirPath: string): Promise<ParsedDocument[]> {
  const absoluteDir = path.resolve(dirPath);
  const files = fs.readdirSync(absoluteDir).filter((f) => f.endsWith('.pdf')).sort();

  if (files.length === 0) {
    throw new Error(`No PDF files found in: ${absoluteDir}`);
  }

  logger.info(`Found ${files.length} PDF files`, { files });

  const documents: ParsedDocument[] = [];
  for (const file of files) {
    const filePath = path.join(absoluteDir, file);
    try {
      const doc = await parsePdf(filePath);
      documents.push(doc);
    } catch (err: any) {
      logger.error(`Failed to parse PDF: ${file}`, { error: err.message });
    }
  }

  return documents;
}
