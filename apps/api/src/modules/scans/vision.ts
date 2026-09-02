import { ImageAnnotatorClient } from '@google-cloud/vision';
import type { OcrToken, Vertex } from './omron-parser.js';

/**
 * Adapter around Cloud Vision.
 *
 * Its only job is to turn an image into positioned tokens; every decision about
 * what those tokens *mean* lives in the parser, which stays testable offline.
 */
export interface OcrEngine {
  /** Returns word-level tokens plus the untouched provider response for storage. */
  detect(image: Buffer): Promise<{ tokens: OcrToken[]; raw: unknown }>;
}

type RawVertex = { x?: number | null; y?: number | null };

/**
 * Vision gives a polygon whose corners are in the text's reading order, so it is
 * rotated when the photo is. We hand the parser both: the axis-aligned box it does
 * its comparisons with, and the polygon it needs to work out which way up the
 * display was before making any of them.
 */
function toGeometry(vertices: readonly RawVertex[] | null | undefined) {
  if (!vertices || vertices.length === 0) return null;
  const poly: Vertex[] = vertices.map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 }));
  const xs = poly.map((v) => v.x);
  const ys = poly.map((v) => v.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { box: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }, poly };
}

class CloudVisionEngine implements OcrEngine {
  private client = new ImageAnnotatorClient();

  async detect(image: Buffer): Promise<{ tokens: OcrToken[]; raw: unknown }> {
    // TEXT_DETECTION rather than DOCUMENT_TEXT_DETECTION: a monitor display is
    // sparse text on a plain background, not a page of prose, and the document
    // model tries to impose paragraph structure that is not there.
    const [result] = await this.client.textDetection({ image: { content: image } });

    const tokens: OcrToken[] = [];

    // Preferred source: fullTextAnnotation, the only one carrying per-word confidence.
    const pages = result.fullTextAnnotation?.pages ?? [];
    for (const page of pages) {
      for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          for (const word of paragraph.words ?? []) {
            const text = (word.symbols ?? []).map((s) => s.text ?? '').join('');
            const geometry = toGeometry(word.boundingBox?.vertices);
            if (!text || !geometry) continue;
            const { box, poly } = geometry;
            if (box.width <= 0 || box.height <= 0) continue;
            tokens.push({ text, confidence: word.confidence ?? 0, box, poly });
          }
        }
      }
    }

    // Fallback: the flat annotation list. No confidence, so the parser's own
    // structural signals carry the score instead.
    if (tokens.length === 0) {
      for (const annotation of (result.textAnnotations ?? []).slice(1)) {
        const geometry = toGeometry(annotation.boundingPoly?.vertices);
        if (!annotation.description || !geometry) continue;
        tokens.push({ text: annotation.description, confidence: 0, ...geometry });
      }
    }

    return { tokens, raw: result };
  }
}

let engine: OcrEngine | null = null;

export function getOcrEngine(): OcrEngine {
  engine ??= new CloudVisionEngine();
  return engine;
}

/** Test seam - lets integration tests run without credentials or network. */
export function setOcrEngine(next: OcrEngine | null): void {
  engine = next;
}
