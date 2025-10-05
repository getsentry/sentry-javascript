export function getByteSize(str: string): number {
  return new TextEncoder().encode(str).length;
}

export function truncateMessagesByBytes(messages: unknown[], maxBytes: number): unknown[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  const messagesJson = JSON.stringify(messages);
  const totalBytes = getByteSize(messagesJson);

  if (totalBytes <= maxBytes) {
    return messages;
  }

  let truncatedMessages = [...messages];

  while (truncatedMessages.length > 0) {
    const truncatedJson = JSON.stringify(truncatedMessages);
    const truncatedBytes = getByteSize(truncatedJson);

    if (truncatedBytes <= maxBytes) {
      break;
    }

    truncatedMessages.shift();
  }

  return truncatedMessages;
}

export const DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT = 100000;

export function truncateGenAiMessages(messages: unknown[]): unknown[] {
  return truncateMessagesByBytes(messages, DEFAULT_GEN_AI_MESSAGES_BYTE_LIMIT);
}
