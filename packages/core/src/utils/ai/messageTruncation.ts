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
 * Truncates messages array using binary search to find optimal starting point.
 * Removes oldest messages first until the array fits within maxBytes
 * It also tries to truncate the latest message's content if it's too large.
 *
 */
export function truncateMessagesByBytes(messages: unknown[], maxBytes: number): unknown[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  const fullSize = getByteSize(JSON.stringify(messages));

  if (fullSize <= maxBytes) {
    return messages;
  }

  // Binary search for the minimum startIndex where remaining messages fit (works for single or multiple messages)
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
        bestStartIndex = mid; // Use this single message
        break;
      }
      left = mid + 1; // Need to remove more messages
    }
  }

  const remainingMessages = messages.slice(bestStartIndex);

  // SPECIAL CASE: Single message handling (either started with 1, or reduced to 1 after binary search)
  if (remainingMessages.length === 1) {
    const singleMessage = remainingMessages[0];
    const singleMessageSize = getByteSize(JSON.stringify(singleMessage));

    // If single message fits, return it
    if (singleMessageSize <= maxBytes) {
      return remainingMessages;
    }

    // Single message is too large, try to truncate its content
    if (
      typeof singleMessage === 'object' &&
      singleMessage !== null &&
      'content' in singleMessage &&
      typeof (singleMessage as { content: unknown }).content === 'string'
    ) {
      const originalContent = (singleMessage as { content: string }).content;
      const messageWithoutContent = { ...singleMessage, content: '' };
      const otherMessagePartsSize = getByteSize(JSON.stringify(messageWithoutContent));
      const availableContentBytes = maxBytes - otherMessagePartsSize;

      if (availableContentBytes <= 0) {
        return [];
      }

      const truncatedContent = truncateStringByBytes(originalContent, availableContentBytes);
      return [{ ...singleMessage, content: truncatedContent }];
    } else {
      return [];
    }
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
