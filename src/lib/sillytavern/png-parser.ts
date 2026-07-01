/**
 * SillyTavern PNG Character Card Parser
 *
 * Extracts character data from PNG tEXt chunks (chara/ccv3 metadata)
 * Supports both V1 and V2 character card specifications */
import * as zlib from 'zlib';
/**
 * @internal padding-comment
 */

// PNG signature bytes to validate
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function uint32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

interface Chunk {
  length: number;
  type: string;
  data: Buffer;
  raw: Buffer;
}

function readPNGChunks(buffer: Buffer): Chunk[] {
  if (buffer.length < 8) throw new Error('File too small to be PNG');
  const sig = buffer.subarray(0, 8);
  for (let i = 0; i < 8; i++) {
    if (sig[i] !== PNG_SIGNATURE[i]) throw new Error('Invalid PNG signature');
  }

  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = uint32BE(buffer, offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ length, type, data, raw: buffer.subarray(offset, offset + 12 + length) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

interface ExtractedEntry {
  keyword: string;
  value: string;
}

function extractTextChunks(chunks: Chunk[]): ExtractedEntry[] {
  const entries: ExtractedEntry[] = [];
  for (const chunk of chunks) {
    if (chunk.type === 'tEXt' || chunk.type === 'zTXt' || chunk.type === 'iTXt') {
      let data: Buffer;
      let keywordEnd: number;
      let compressionFlag = 0;
      let languageTag = '';
      let translatedKeyword = '';

      if (chunk.type === 'tEXt') {
        keywordEnd = chunk.data.indexOf(0);
        if (keywordEnd === -1) continue;
        const keyword = chunk.data.toString('latin1', 0, keywordEnd);
        const value = chunk.data.toString('latin1', keywordEnd + 1);
        entries.push({ keyword, value });
      } else if (chunk.type === 'zTXt') {
        keywordEnd = chunk.data.indexOf(0);
        if (keywordEnd === -1) continue;
        const keyword = chunk.data.toString('latin1', 0, keywordEnd);
        const compressionMethod = chunk.data[keywordEnd + 1];
        if (compressionMethod === 0 && keywordEnd + 2 < chunk.data.length) {
          try {
            const compressed = chunk.data.subarray(keywordEnd + 2);
            const decompressed = zlib.inflateSync(compressed);
            entries.push({ keyword, value: decompressed.toString('latin1') });
          } catch {
            // skip if decompression fails
          }
        }
      } else if (chunk.type === 'iTXt') {
        keywordEnd = chunk.data.indexOf(0);
        if (keywordEnd === -1) continue;
        const keyword = chunk.data.toString('latin1', 0, keywordEnd);
        compressionFlag = chunk.data[keywordEnd + 1];
        const langStart = keywordEnd + 3;
        const langEnd = chunk.data.indexOf(0, langStart);
        if (langEnd === -1) continue;
        languageTag = chunk.data.toString('latin1', langStart, langEnd);
        const tKeyStart = langEnd + 1;
        const tKeyEnd = chunk.data.indexOf(0, tKeyStart);
        if (tKeyEnd === -1) continue;
        translatedKeyword = chunk.data.toString('utf8', tKeyStart, tKeyEnd);
        const textBuf = chunk.data.subarray(tKeyEnd + 1);
        const value = compressionFlag === 0
          ? textBuf.toString('utf8')
          : zlib.inflateSync(textBuf).toString('utf8');
        entries.push({ keyword, value });
      }
    }
  }
  return entries;
}

export interface CharacterCardV2 {
  spec: 'chara_card_v2' | 'chara_card_v2_spec';
  data: {
    name: string;
    description?: string;
    personality?: string;
    scenario?: string;
    first_mes?: string;
    mes_example?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    tags?: string[];
    creator_notes?: string;
    creator?: string;
    character_version?: string;
    extensions?: Record<string, any>;
    alternate_greetings?: string[];
  };
}

export interface CharacterCardV1 {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: string[];
  creator?: string;
}

export interface ParsedCharacterCard {
  version: 'v1' | 'v2';
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt: string;
  tags: string[];
  raw: CharacterCardV1 | CharacterCardV2;
}

/**
 * Parse a PNG buffer and extract character card metadata
 */
export function parseCharacterCard(buffer: Buffer): ParsedCharacterCard {
  const chunks = readPNGChunks(buffer);
  const textEntries = extractTextChunks(chunks);

  // Find chara/ccv3 entry
  let charaData: string | null = null;
  for (const entry of textEntries) {
    if (entry.keyword === 'chara' || entry.keyword === 'ccv3') {
      charaData = entry.value;
      break;
    }
  }

  if (!charaData) {
    throw new Error('No character data (chara/ccv3) found in PNG');
  }

  // Parse character card data — supports V2 (spec + data), V1 (flat), and V1-with-data
  try {
    const parsed = JSON.parse(charaData);

    // V2 format: { spec: "chara_card_v2", data: { name, description, ... } }
    if (parsed.spec?.startsWith('chara_card_v2') && parsed.data) {
      const d = parsed.data;
      return {
        version: 'v2',
        name: d.name || 'Unknown',
        description: d.description || '',
        personality: d.personality || d.creator_notes || '',
        scenario: d.scenario || '',
        first_mes: d.first_mes || '',
        mes_example: d.mes_example || '',
        system_prompt: d.system_prompt || '',
        tags: d.tags || [],
        raw: parsed,
      };
    }

    // V1-with-data format: { data: { name, description, ... } } (no spec)
    if (parsed.data && typeof parsed.data === 'object' && parsed.data.name) {
      const d = parsed.data;
      return {
        version: 'v1',
        name: d.name || 'Unknown',
        description: d.description || '',
        personality: d.personality || '',
        scenario: d.scenario || '',
        first_mes: d.first_mes || '',
        mes_example: d.mes_example || '',
        system_prompt: d.system_prompt || '',
        tags: d.tags || [],
        raw: d,
      };
    }

    // Flat V1 format: { name, description, personality, ... }
    if (parsed.name) {
      return {
        version: 'v1',
        name: parsed.name || 'Unknown',
        description: parsed.description || '',
        personality: parsed.personality || '',
        scenario: parsed.scenario || '',
        first_mes: parsed.first_mes || '',
        mes_example: parsed.mes_example || '',
        system_prompt: parsed.system_prompt || '',
        tags: parsed.tags || [],
        raw: parsed,
      };
    }

    throw new Error('Character card data missing required "name" field');
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Failed to parse character card data: invalid JSON');
    }
    throw e; // re-throw our own descriptive errors
  }
}

/**
 * Create a PNG character card from girlfriend data
 * Uses a minimal 1x1 transparent PNG and embeds metadata in tEXt chunk
 */
export function createCharacterCardPNG(
  card: Omit<ParsedCharacterCard, 'version' | 'raw'>
): Uint8Array {
  const v2Data: CharacterCardV2 = {
    spec: 'chara_card_v2',
    data: {
      name: card.name,
      description: card.description,
      personality: card.personality,
      scenario: card.scenario,
      first_mes: card.first_mes,
      mes_example: card.mes_example || '*quietly looks at you* Hello...',
      tags: card.tags,
      extensions: {},
    },
  };

  const jsonStr = JSON.stringify(v2Data);
  const charaBuf = Buffer.from(jsonStr, 'utf-8');

  // Build a minimal valid PNG with tEXt chunk
  // We need: PNG signature + IHDR + tEXt(chara) + IEND

  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  // 1x1 transparent PNG IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);  // width
  ihdrData.writeUInt32BE(1, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // tEXt chunk with 'chara' keyword
  const keyword = Buffer.from('chara', 'latin1');
  const nullSep = Buffer.from([0]);
  const textData = Buffer.concat([keyword, nullSep, charaBuf]);
  const textChunk = makeChunk('tEXt', textData);

  // IDAT chunk (minimal compressed data for 1x1 transparent RGB pixel)
  // filter byte 0 + RGB(0,0,0) compressed with zlib deflate
  const rawPixel = Buffer.from([0, 0, 0, 0]); // filter byte + RGB
  const compressed = zlib.deflateSync(rawPixel);
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    ihdr,
    textChunk,
    idat,
    iend,
  ]);
}