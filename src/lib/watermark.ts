/**
 * Brand watermark for generated media.
 *
 * Every generated image is stamped with a translucent "oxmate-ai" tag in the
 * bottom-left corner before it hits storage, so shared / downloaded assets
 * always carry the brand. Fail-open by design: a watermark failure must never
 * break the generation pipeline.
 */
import { logger } from '@/lib/logger';

export const WATERMARK_TEXT = 'oxmate-ai';

/**
 * Composite a translucent text watermark onto the bottom-left corner of an
 * image buffer (PNG / JPEG / WEBP). Returns the original buffer untouched when
 * sharp is unavailable or the payload cannot be processed.
 */
export async function applyImageWatermark(buffer: Buffer): Promise<Buffer> {
  try {
    const sharpMod = await import('sharp');
    const sharp = sharpMod.default || sharpMod;
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return buffer;

    // Font scales with the image but stays readable on thumbnails.
    const fontSize = Math.min(48, Math.max(14, Math.round(Math.min(width, height) * 0.04)));
    const margin = Math.max(8, Math.round(fontSize * 0.8));
    const stroke = Math.max(1, Math.round(fontSize / 12));

    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<text x="${margin}" y="${height - margin}" ` +
        `font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" ` +
        `letter-spacing="1" fill="rgba(255,255,255,0.55)" ` +
        `stroke="rgba(0,0,0,0.4)" stroke-width="${stroke}" paint-order="stroke">` +
        WATERMARK_TEXT +
        `</text></svg>`,
    );

    return await sharp(buffer).composite([{ input: overlay, top: 0, left: 0 }]).toBuffer();
  } catch (e) {
    logger.warn('[watermark] image watermark failed, keeping original', {
      err: e instanceof Error ? e.message : String(e),
    });
    return buffer;
  }
}
