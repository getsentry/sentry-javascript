/**
 * Default maximum size in bytes for GenAI messages.
 * Messages exceeding this limit will be truncated.
 */
export const DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT = 20000;

/**
 * Message format used by OpenAI and Anthropic APIs.
 */
type ContentMessage = {
  [key: string]: unknown;
  content: string;
};

/**
 * Message format used by Google GenAI API.
 * Parts can be strings or objects with a text property.
 */
type PartsMessage = {
  [key: string]: unknown;
  parts: Array<string | { text: string }>;
};

/**
 * A part in a Google GenAI message that contains text.
 */
type TextPart = string | { text: string };

/**
 * Calculate the UTF-8 byte length of a string.
 */
const utf8Bytes = (text: string): number => {
  return new TextEncoder().encode(text).length;
};

/**
 * Calculate the UTF-8 byte length of a value's JSON representation.
 */
const jsonBytes = (value: unknown): number => {
  return utf8Bytes(JSON.stringify(value));
};

/**
 * Truncate a string to fit within maxBytes when encoded as UTF-8.
 * Uses binary search for efficiency with multi-byte characters.
 *
 * @param text - The string to truncate
 * @param maxBytes - Maximum byte length (UTF-8 encoded)
 * @returns Truncated string that fits within maxBytes
 */
function truncateTextByBytes(text: string, maxBytes: number): string {
  if (utf8Bytes(text) <= maxBytes) {
    return text;
  }

  let low = 0;
  let high = text.length;
  let bestFit = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid);
    const byteSize = utf8Bytes(candidate);

    if (byteSize <= maxBytes) {
      bestFit = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return bestFit;
}

/**
 * Extract text content from a Google GenAI message part.
 * Parts are either plain strings or objects with a text property.
 *
 * @returns The text content
 */
function getPartText(part: TextPart): string {
  if (typeof part === 'string') {
    return part;
  }
  return part.text;
}

/**
 * Create a new part with updated text content while preserving the original structure.
 *
 * @param part - Original part (string or object)
 * @param text - New text content
 * @returns New part with updated text
 */
function withPartText(part: TextPart, text: string): TextPart {
  if (typeof part === 'string') {
    return text;
  }
  return { ...part, text };
}

/**
 * Check if a message has the OpenAI/Anthropic content format.
 */
function isContentMessage(message: unknown): message is ContentMessage {
  return (
    message !== null &&
    typeof message === 'object' &&
    'content' in message &&
    typeof (message as ContentMessage).content === 'string'
  );
}

/**
 * Check if a message has the Google GenAI parts format.
 */
function isPartsMessage(message: unknown): message is PartsMessage {
  return (
    message !== null &&
    typeof message === 'object' &&
    'parts' in message &&
    Array.isArray((message as PartsMessage).parts) &&
    (message as PartsMessage).parts.length > 0
  );
}

/**
 * Truncate a message with `content: string` format (OpenAI/Anthropic).
 *
 * @param message - Message with content property
 * @param maxBytes - Maximum byte limit
 * @returns Array with truncated message, or empty array if it doesn't fit
 */
function truncateContentMessage(message: ContentMessage, maxBytes: number): unknown[] {
  // Calculate overhead (message structure without content)
  const emptyMessage = { ...message, content: '' };
  const overhead = jsonBytes(emptyMessage);
  const availableForContent = maxBytes - overhead;

  if (availableForContent <= 0) {
    return [];
  }

  const truncatedContent = truncateTextByBytes(message.content, availableForContent);
  return [{ ...message, content: truncatedContent }];
}

/**
 * Truncate a message with `parts: [...]` format (Google GenAI).
 * Keeps as many complete parts as possible, only truncating the first part if needed.
 *
 * @param message - Message with parts array
 * @param maxBytes - Maximum byte limit
 * @returns Array with truncated message, or empty array if it doesn't fit
 */
function truncatePartsMessage(message: PartsMessage, maxBytes: number): unknown[] {
  const { parts } = message;

  // Calculate overhead by creating empty text parts
  const emptyParts = parts.map(part => withPartText(part, ''));
  const overhead = jsonBytes({ ...message, parts: emptyParts });
  let remainingBytes = maxBytes - overhead;

  if (remainingBytes <= 0) {
    return [];
  }

  // Include parts until we run out of space
  const includedParts: TextPart[] = [];

  for (const part of parts) {
    const text = getPartText(part);
    const textSize = utf8Bytes(text);

    if (textSize <= remainingBytes) {
      // Part fits: include it as-is
      includedParts.push(part);
      remainingBytes -= textSize;
    } else if (includedParts.length === 0) {
      // First part doesn't fit: truncate it
      const truncated = truncateTextByBytes(text, remainingBytes);
      if (truncated) {
        includedParts.push(withPartText(part, truncated));
      }
      break;
    } else {
      // Subsequent part doesn't fit: stop here
      break;
    }
  }

  return includedParts.length > 0 ? [{ ...message, parts: includedParts }] : [];
}

/**
 * Truncate a single message to fit within maxBytes.
 *
 * Supports two message formats:
 * - OpenAI/Anthropic: `{ ..., content: string }`
 * - Google GenAI: `{ ..., parts: Array<string | {text: string} | non-text> }`
 *
 * @param message - The message to truncate
 * @param maxBytes - Maximum byte limit for the message
 * @returns Array containing the truncated message, or empty array if truncation fails
 */
function truncateSingleMessage(message: unknown, maxBytes: number): unknown[] {
  if (!message || typeof message !== 'object') {
    return [];
  }

  if (isContentMessage(message)) {
    return truncateContentMessage(message, maxBytes);
  }

  if (isPartsMessage(message)) {
    return truncatePartsMessage(message, maxBytes);
  }

  // Unknown message format: cannot truncate safely
  return [];
}

/**
 * Truncate an array of messages to fit within a byte limit.
 *
 * Strategy:
 * - Keeps the newest messages (from the end of the array)
 * - Uses O(n) algorithm: precompute sizes once, then find largest suffix under budget
 * - If no complete messages fit, attempts to truncate the newest single message
 *
 * @param messages - Array of messages to truncate
 * @param maxBytes - Maximum total byte limit for all messages
 * @returns Truncated array of messages
 *
 * @example
 * ```ts
 * const messages = [msg1, msg2, msg3, msg4]; // newest is msg4
 * const truncated = truncateMessagesByBytes(messages, 10000);
 * // Returns [msg3, msg4] if they fit, or [msg4] if only it fits, etc.
 * ```
 */
export function truncateMessagesByBytes(messages: unknown[], maxBytes: number): unknown[] {
  // Early return for empty or invalid input
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  // Fast path: if all messages fit, return as-is
  const totalBytes = jsonBytes(messages);
  if (totalBytes <= maxBytes) {
    return messages;
  }

  // Precompute each message's JSON size once for efficiency
  const messageSizes = messages.map(jsonBytes);

  // Find the largest suffix (newest messages) that fits within the budget
  let bytesUsed = 0;
  let startIndex = messages.length; // Index where the kept suffix starts

  for (let i = messages.length - 1; i >= 0; i--) {
    const messageSize = messageSizes[i];

    if (messageSize && bytesUsed + messageSize > maxBytes) {
      // Adding this message would exceed the budget
      break;
    }

    if (messageSize) {
      bytesUsed += messageSize;
    }
    startIndex = i;
  }

  // If no complete messages fit, try truncating just the newest message
  if (startIndex === messages.length) {
    const newestMessage = messages[messages.length - 1];
    return truncateSingleMessage(newestMessage, maxBytes);
  }

  // Return the suffix that fits
  return messages.slice(startIndex);
}

/**
 * Truncate GenAI messages using the default byte limit.
 *
 * Convenience wrapper around `truncateMessagesByBytes` with the default limit.
 *
 * @param messages - Array of messages to truncate
 * @returns Truncated array of messages
 */
export function truncateGenAiMessages(messages: unknown[]): unknown[] {
  return truncateMessagesByBytes(messages, DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT);
}

/**
 * Truncate GenAI string input using the default byte limit.
 *
 * @param input - The string to truncate
 * @returns Truncated string
 */
export function truncateGenAiStringInput(input: string): string {
  return truncateTextByBytes(input, DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT);
}
