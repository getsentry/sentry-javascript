export const DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT = 20000;

export function getByteSize(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes += 3;
    } else {
      i++;
      bytes += 4;
    }
  }
  return bytes;
}

function truncateStringByBytes(str: string, maxBytes: number): string {
  if (getByteSize(str) <= maxBytes) {
    return str;
  }

  let truncatedStr = str;
  while (getByteSize(truncatedStr) > maxBytes && truncatedStr.length > 0) {
    truncatedStr = truncatedStr.slice(0, -1);
  }
  return truncatedStr;
}

export function truncateMessagesByBytes(messages: unknown[], maxBytes: number): unknown[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  let currentSize = getByteSize(JSON.stringify(messages));

  if (currentSize <= maxBytes) {
    return messages;
  }

  let startIndex = 0;

  while (startIndex < messages.length - 1 && currentSize > maxBytes) {
    const messageSize = getByteSize(JSON.stringify(messages[startIndex]));
    currentSize -= messageSize;
    startIndex++;
  }

  const remainingMessages = messages.slice(startIndex);

  if (remainingMessages.length === 1) {
    const singleMessage = remainingMessages[0];
    const singleMessageSize = getByteSize(JSON.stringify(singleMessage));

    if (singleMessageSize > maxBytes) {
      if (typeof singleMessage === 'object' && singleMessage !== null && 'content' in singleMessage && typeof (singleMessage as { content: unknown }).content === 'string') {
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
  }

  return remainingMessages;
}


export function truncateGenAiMessages(messages: unknown[]): unknown[] {
  return truncateMessagesByBytes(messages, DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT);
}
