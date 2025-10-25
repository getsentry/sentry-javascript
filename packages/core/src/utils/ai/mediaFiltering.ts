import { getClient } from '../../currentScopes';

function isMediaMimeType(mimeType: string): boolean {
  const type = mimeType.toLowerCase();
  return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/');
}

function isMediaContent(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const obj = item as Record<string, unknown>;

  if (typeof obj.type === 'string' && (obj.type === 'image' || obj.type === 'image_url')) {
    return true;
  }

  if (typeof obj.mime_type === 'string' && isMediaMimeType(obj.mime_type)) {
    return true;
  }

  if (typeof obj.mimeType === 'string' && isMediaMimeType(obj.mimeType)) {
    return true;
  }

  if (typeof obj.data === 'string' && obj.data.length > 1000) {
    const dataStart = obj.data.substring(0, 50).toLowerCase();
    if (dataStart.includes('data:image/') || dataStart.includes('/9j/') || dataStart.includes('ivborw0kggo')) {
      return true;
    }
  }

  if (typeof obj.source === 'object' && obj.source !== null) {
    const source = obj.source as Record<string, unknown>;
    if (typeof source.type === 'string' && source.type === 'base64' && typeof source.data === 'string') {
      return true;
    }
  }

  return false;
}

function recordDroppedMedia(count: number = 1): void {
  const client = getClient();
  if (client) {
    client.recordDroppedEvent('media_content_dropped' as any, 'attachment', count);
  }
}

export function filterMediaFromMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  let droppedCount = 0;

  const filtered = messages.map(message => {
    if (typeof message !== 'object' || message === null) {
      return message;
    }

    const msg = message as Record<string, unknown>;

    if (Array.isArray(msg.content)) {
      const filteredContent = msg.content.filter(item => {
        if (isMediaContent(item)) {
          droppedCount++;
          return false;
        }
        return true;
      });

      if (filteredContent.length === 0) {
        return { ...msg, content: '' };
      }

      return { ...msg, content: filteredContent };
    }

    if (isMediaContent(msg.content)) {
      droppedCount++;
      return { ...msg, content: '' };
    }

    return message;
  });

  if (droppedCount > 0) {
    recordDroppedMedia(droppedCount);
  }

  return filtered;
}

