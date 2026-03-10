import { isContentMedia, stripInlineMediaFromSingleMessage } from './mediaStripping';

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
 * Message format used by OpenAI and Anthropic APIs for media.
 */
type ContentArrayMessage = {
  [key: string]: unknown;
  content: {
    [key: string]: unknown;
    type: string;
  }[];
};

/**
 * Message format used by Google GenAI API.
 * Parts can be strings or objects with a text property.
 */
type PartsMessage = {
  [key: string]: unknown;
  parts: Array<TextPart | MediaPart>;
};

/**
 * A part in a Google GenAI message that contains text.
 */
type TextPart = string | { text: string };

/**
 * A part in a Google GenAI that contains media.
 */
type MediaPart = {
  type: string;
  content: string;
};

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
 * Truncate a string to fit within maxBytes (inclusive) when encoded as UTF-8.
 * Uses binary search for efficiency with multi-byte characters.
 *
 * @param text - The string to truncate
 * @param maxBytes - Maximum byte length (inclusive, UTF-8 encoded)
 * @returns Truncated string whose UTF-8 byte length is at most maxBytes
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
function getPartText(part: TextPart | MediaPart): string {
  if (typeof part === 'string') {
    return part;
  }
  if ('text' in part) return part.text;
  return '';
}

/**
 * Create a new part with updated text content while preserving the original structure.
 *
 * @param part - Original part (string or object)
 * @param text - New text content
 * @returns New part with updated text
 */
function withPartText(part: TextPart | MediaPart, text: string): TextPart {
  if (typeof part === 'string') {
    return text;
  }
  return { ...part, text };
}

/**
 * Check if a content array part is a text part ({ type: "text", text: "..." }).
 */
function isTextContentPart(part: unknown): part is { type: 'text'; text: string } {
  return (
    part !== null &&
    typeof part === 'object' &&
    'type' in part &&
    part.type === 'text' &&
    'text' in part &&
    typeof part.text === 'string'
  );
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
 * Check if a message has the OpenAI/Anthropic content array format.
 */
function isContentArrayMessage(message: unknown): message is ContentArrayMessage {
  return message !== null && typeof message === 'object' && 'content' in message && Array.isArray(message.content);
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
  const includedParts: (TextPart | MediaPart)[] = [];

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

  /* c8 ignore start
   * for type safety only, algorithm guarantees SOME text included */
  if (includedParts.length <= 0) {
    return [];
  } else {
    /* c8 ignore stop */
    return [{ ...message, parts: includedParts }];
  }
}

/**
 * Truncate a message with `content: [...]` array format (Vercel AI SDK, OpenAI multimodal).
 * Content arrays contain parts like `{ type: "text", text: "..." }`.
 * Keeps as many complete parts as possible, only truncating text parts if needed.
 *
 * @param message - Message with content array property
 * @param maxBytes - Maximum byte limit
 * @returns Array with truncated message, or empty array if it doesn't fit
 */
function truncateContentArrayMessage(message: ContentArrayMessage, maxBytes: number): unknown[] {
  const { content } = message;

  // Calculate overhead by creating empty text parts (non-text parts keep their size)
  const emptyContent = content.map(part => (isTextContentPart(part) ? { ...part, text: '' } : part));
  const overhead = jsonBytes({ ...message, content: emptyContent });
  let remainingBytes = maxBytes - overhead;

  if (remainingBytes <= 0) {
    return [];
  }

  // Include parts until we run out of space
  const includedParts: ContentArrayMessage['content'] = [];

  for (const part of content) {
    if (isTextContentPart(part)) {
      // Text part: check if it fits, truncate if needed
      const textSize = utf8Bytes(part.text);

      if (textSize <= remainingBytes) {
        // Text fits: include it as-is
        includedParts.push(part);
        remainingBytes -= textSize;
      } else if (includedParts.length === 0) {
        // First part doesn't fit: truncate it
        const truncated = truncateTextByBytes(part.text, remainingBytes);
        if (truncated) {
          includedParts.push({ ...part, text: truncated });
        }
        break;
      } else {
        // Subsequent text part doesn't fit: stop here
        break;
      }
    } else {
      // Non-text part (image, etc.): size is already in overhead, include it
      includedParts.push(part);
    }
  }

  if (includedParts.length === 0) {
    return [];
  }

  return [{ ...message, content: includedParts }];
}

/**
 * Truncate a single message to fit within maxBytes.
 *
 * Supports three message formats:
 * - OpenAI/Anthropic: `{ ..., content: string }`
 * - Vercel AI/OpenAI multimodal: `{ ..., content: Array<{type, text?, ...}> }`
 * - Google GenAI: `{ ..., parts: Array<string | {text: string} | non-text> }`
 *
 * @param message - The message to truncate
 * @param maxBytes - Maximum byte limit for the message
 * @returns Array containing the truncated message, or empty array if truncation fails
 */
function truncateSingleMessage(message: unknown, maxBytes: number): unknown[] {
  if (!message) return [];

  // Handle plain strings (e.g., embeddings input)
  if (typeof message === 'string') {
    const truncated = truncateTextByBytes(message, maxBytes);
    return truncated ? [truncated] : [];
  }

  if (typeof message !== 'object') {
    return [];
  }

  if (isContentMessage(message)) {
    return truncateContentMessage(message, maxBytes);
  }

  if (isContentArrayMessage(message)) {
    return truncateContentArrayMessage(message, maxBytes);
  }

  if (isPartsMessage(message)) {
    return truncatePartsMessage(message, maxBytes);
  }

  // Unknown message format: cannot truncate safely
  return [];
}

/**
 * Strip the inline media from message arrays.
 *
 * This returns a stripped message. We do NOT want to mutate the data in place,
 * because of course we still want the actual API/client to handle the media.
 */
function stripInlineMediaFromMessages(messages: unknown[]): unknown[] {
  const stripped = messages.map(message => {
    let newMessage: Record<string, unknown> | undefined = undefined;
    if (!!message && typeof message === 'object') {
      if (isContentArrayMessage(message)) {
        newMessage = {
          ...message,
          content: stripInlineMediaFromMessages(message.content),
        };
      } else if ('content' in message && isContentMedia(message.content)) {
        newMessage = {
          ...message,
          content: stripInlineMediaFromSingleMessage(message.content),
        };
      }
      if (isPartsMessage(message)) {
        newMessage = {
          // might have to strip content AND parts
          ...(newMessage ?? message),
          parts: stripInlineMediaFromMessages(message.parts),
        };
      }
      if (isContentMedia(newMessage)) {
        newMessage = stripInlineMediaFromSingleMessage(newMessage);
      } else if (isContentMedia(message)) {
        newMessage = stripInlineMediaFromSingleMessage(message);
      }
    }
    return newMessage ?? message;
  });
  return stripped;
}

/**
 * Truncate an array of messages to fit within a byte limit.
 *
 * Strategy:
 * - Always keeps only the last (newest) message
 * - Strips inline media from the message
 * - Truncates the message content if it exceeds the byte limit
 *
 * @param messages - Array of messages to truncate
 * @param maxBytes - Maximum total byte limit for the message
 * @returns Array containing only the last message (possibly truncated)
 *
 * @example
 * ```ts
 * const messages = [msg1, msg2, msg3, msg4]; // newest is msg4
 * const truncated = truncateMessagesByBytes(messages, 10000);
 * // Returns [msg4] (truncated if needed)
 * ```
 */
function truncateMessagesByBytes(messages: unknown[], maxBytes: number): unknown[] {
  // Early return for empty or invalid input
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  // The result is always a single-element array that callers wrap with
  // JSON.stringify([message]), so subtract the 2-byte array wrapper ("["  and "]")
  // to ensure the final serialized value stays under the limit.
  const effectiveMaxBytes = maxBytes - 2;

  // Always keep only the last message
  const lastMessage = messages[messages.length - 1];

  // Strip inline media from the single message
  const stripped = stripInlineMediaFromMessages([lastMessage]);
  const strippedMessage = stripped[0];

  // Check if it fits
  const messageBytes = jsonBytes(strippedMessage);
  if (messageBytes <= effectiveMaxBytes) {
    return stripped;
  }

  // Truncate the single message if needed
  return truncateSingleMessage(strippedMessage, effectiveMaxBytes);
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
