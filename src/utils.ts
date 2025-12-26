import { v4 as uuidv4 } from "uuid";

export function connectId(): string {
  return uuidv4().replace(/-/g, "");
}

export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

export function unescapeXml(safe: string): string {
  return safe
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

export function dateToString(): string {
  const date = new Date();
  return date.toUTCString();
}

export function removeIncompatibleCharacters(input: string | Buffer): string {
  let str = Buffer.isBuffer(input) ? input.toString("utf-8") : input;

  // Replace vertical tabs and other control characters that Edge doesn't like
  return str
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      if (
        (code >= 0 && code <= 8) ||
        (code >= 11 && code <= 12) ||
        (code >= 14 && code <= 31)
      ) {
        return " ";
      }
      return char;
    })
    .join("");
}

// Text Splitting Logic
function findLastNewlineOrSpaceWithinLimit(
  text: Buffer,
  limit: number,
): number {
  const slice = text.subarray(0, limit);
  let splitAt = slice.lastIndexOf(10); // \n
  if (splitAt < 0) {
    splitAt = slice.lastIndexOf(32); // space
  }
  return splitAt;
}

function findSafeUtf8SplitPoint(textSegment: Buffer): number {
  let splitAt = textSegment.length;
  while (splitAt > 0) {
    const sub = textSegment.subarray(0, splitAt);
    try {
      const lastByte = sub[sub.length - 1];
      if (lastByte !== undefined && (lastByte & 0x80) === 0) {
        return splitAt; // ASCII, safe
      }

      const str = sub.toString("utf-8");
      if (Buffer.from(str).length === sub.length && !str.endsWith("\uFFFD")) {
        return splitAt;
      }
      splitAt--;
    } catch (e) {
      splitAt--;
    }
  }
  return splitAt;
}

function adjustSplitPointForXmlEntity(text: Buffer, splitAt: number): number {
  const sub = text.subarray(0, splitAt);
  const ampersandIndex = sub.lastIndexOf(38); // &

  if (ampersandIndex > -1) {
    // Check if semicolon follows
    const semicolonIndex = sub.indexOf(59, ampersandIndex); // ;
    if (semicolonIndex === -1) {
      // Unterminated entity before split point, move back to ampersand
      return ampersandIndex;
    }
  }
  return splitAt;
}

export function* splitTextByByteLength(
  text: string | Buffer,
  byteLength: number,
): Generator<Buffer> {
  let buffer = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf-8");

  if (byteLength <= 0) throw new Error("byteLength must be > 0");

  while (buffer.length > byteLength) {
    let splitAt = findLastNewlineOrSpaceWithinLimit(buffer, byteLength);

    if (splitAt < 0) {
      splitAt = findSafeUtf8SplitPoint(buffer.subarray(0, byteLength));
    }

    splitAt = adjustSplitPointForXmlEntity(buffer, splitAt);

    if (splitAt <= 0) {
      // Should not happen with reasonable byteLength
      throw new Error("Maximum byte length too small for text structure");
    }

    const chunk = buffer.subarray(0, splitAt);
    const chunkStr = chunk.toString("utf-8").trim();
    if (chunkStr.length > 0) {
      yield Buffer.from(chunkStr);
    }

    buffer = buffer.subarray(splitAt + (splitAt > 0 ? 0 : 1));
  }

  const remaining = buffer.toString("utf-8").trim();
  if (remaining.length > 0) {
    yield Buffer.from(remaining);
  }
}

export function getHeadersAndData(
  data: Buffer,
  headerLength: number,
): { headers: Record<string, string>; data: Buffer } {
  const headersObj: Record<string, string> = {};
  const headerBytes = data.subarray(0, headerLength);
  const rest = data.subarray(headerLength + 2); // Skip the \r\n after headers

  const lines = headerBytes.toString("utf-8").split("\r\n");
  for (const line of lines) {
    const [key, value] = line.split(":", 2);
    if (key && value) {
      headersObj[key.trim()] = value.trim();
    }
  }
  return { headers: headersObj, data: rest };
}
