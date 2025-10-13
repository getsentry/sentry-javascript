export const DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT = 20000;

/**
 * Calculates the UTF-8 byte size of a string.
 */
export function getByteSize(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * Truncates a string to fit within maxBytes using binary search.
 */
function truncateStringByBytes(str: string, maxBytes: number): string {
  if (getByteSize(str) <= maxBytes) {
    return str;
  }

  // Binary search for the longest substring that fits
  let left = 0;
  let right = str.length;
  let result = '';

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const candidate = str.slice(0, mid);
    const candidateSize = getByteSize(candidate);

    if (candidateSize <= maxBytes) {
      result = candidate;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

/**
 * Attempts to truncate a single message's content to fit within maxBytes.
 * Supports both OpenAI/Anthropic format and Google GenAI format.
 * Returns the truncated message or an empty array if truncation is not possible.
 */
function truncateSingleMessageContent(message: unknown, maxBytes: number): unknown[] {
  if (typeof message !== 'object' || message === null) {
    return [];
  }

  // Handle OpenAI/Anthropic format: { role: 'user', content: 'text' }
  if ('content' in message && typeof (message as { content: unknown }).content === 'string') {
    const originalContent = (message as { content: string }).content;
    const messageWithoutContent = { ...message, content: '' };
    const overhead = getByteSize(JSON.stringify(messageWithoutContent));
    const availableBytes = maxBytes - overhead;

    if (availableBytes <= 0) {
      return [];
    }

    const truncatedContent = truncateStringByBytes(originalContent, availableBytes);
    return [{ ...message, content: truncatedContent }];
  }

  // Handle Google GenAI format: { role: 'user', parts: [{ text: 'text' }] }
  if (
    'parts' in message &&
    Array.isArray((message as { parts: unknown }).parts) &&
    (message as { parts: unknown[] }).parts.length > 0
  ) {
    const parts = (message as { parts: { text?: unknown }[] }).parts;
    const firstPart = parts[0];

    if (firstPart && typeof firstPart === 'object' && 'text' in firstPart && typeof firstPart.text === 'string') {
      const originalText = firstPart.text;
      const messageWithEmptyText = { ...message, parts: [{ ...firstPart, text: '' }] };
      const overhead = getByteSize(JSON.stringify(messageWithEmptyText));
      const availableBytes = maxBytes - overhead;

      if (availableBytes <= 0) {
        return [];
      }

      const truncatedText = truncateStringByBytes(originalText, availableBytes);
      return [{ ...message, parts: [{ ...firstPart, text: truncatedText }] }];
    }
  }

  // Unknown format - cannot truncate
  return [];
}

/**
 * Truncates messages array using binary search to find optimal starting point.
 * Removes oldest messages first until the array fits within maxBytes.
 * If only one message remains and it's too large, truncates its content.
 */
export function truncateMessagesByBytes(messages: unknown[], maxBytes: number): unknown[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  const fullSize = getByteSize(JSON.stringify(messages));
  if (fullSize <= maxBytes) {
    return messages;
  }

  // Binary search for the minimum startIndex where remaining messages fit
  let left = 0;
  let right = messages.length - 1;
  let bestStartIndex = messages.length;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const remainingMessages = messages.slice(mid);
    const remainingSize = getByteSize(JSON.stringify(remainingMessages));

    if (remainingSize <= maxBytes) {
      bestStartIndex = mid;
      right = mid - 1; // Try to keep more messages
    } else {
      // If we're down to a single message and it doesn't fit, break and handle content truncation
      if (remainingMessages.length === 1) {
        bestStartIndex = mid;
        break;
      }
      left = mid + 1; // Need to remove more messages
    }
  }

  const remainingMessages = messages.slice(bestStartIndex);

  // If only one message remains, check if it fits or needs content truncation
  if (remainingMessages.length === 1) {
    const singleMessageSize = getByteSize(JSON.stringify(remainingMessages[0]));

    if (singleMessageSize <= maxBytes) {
      return remainingMessages;
    }

    // Single message is too large, try to truncate its content
    return truncateSingleMessageContent(remainingMessages[0], maxBytes);
  }

  // Multiple messages remain and fit within limit
  return remainingMessages;
}

/**
 * Truncates gen_ai messages to fit within the default byte limit.
 * This is a convenience wrapper around truncateMessagesByBytes.
 */
export function truncateGenAiMessages(messages: unknown[]): unknown[] {
  return truncateMessagesByBytes(messages, DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT);
}
