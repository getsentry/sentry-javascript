import { getClient } from '../../currentScopes';
import { isValidContentItem } from './validation';

const MEDIA_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'video/avi',
  'video/mov',
  'video/wmv',
  'video/flv',
  'video/webm',
  'video/mkv',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/mpeg',
  'audio/aac',
  'audio/flac',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
]);

function isMediaContent(item: unknown): boolean {
  if (!isValidContentItem(item)) {
    return false;
  }

  if (typeof item.type === 'string' && item.type === 'image') {
    return true;
  }

  if (typeof item.mimeType === 'string' && MEDIA_MIME_TYPES.has(item.mimeType.toLowerCase())) {
    return true;
  }

  if (typeof item.data === 'string' && item.data.length > 1000) {
    const dataStart = item.data.substring(0, 50).toLowerCase();
    if (dataStart.includes('data:image/') || dataStart.includes('/9j/') || dataStart.includes('iVBORw0KGgo')) {
      return true;
    }
  }

  return false;
}

function recordDroppedMedia(reason: string, count: number = 1): void {
  const client = getClient();
  if (client) {
    client.recordDroppedEvent(reason as any, 'attachment', count);
  }
}

export function filterMediaFromContentItem(item: unknown): unknown | null {
  if (!isValidContentItem(item)) {
    return item;
  }

  if (isMediaContent(item)) {
    recordDroppedMedia('media_content_dropped');
    return null;
  }

  if (Array.isArray(item.content)) {
    const filteredContent = item.content
      .map(contentItem => {
        if (isMediaContent(contentItem)) {
          recordDroppedMedia('media_content_dropped');
          return null;
        }
        return contentItem;
      })
      .filter(contentItem => contentItem !== null);

    if (filteredContent.length === 0) {
      return null;
    }

    return {
      ...item,
      content: filteredContent,
    };
  }

  if (isValidContentItem(item.content) && isMediaContent(item.content)) {
    recordDroppedMedia('media_content_dropped');
    return null;
  }

  return item;
}

export function filterMediaFromContentArray(content: unknown[]): unknown[] {
  return content
    .map(item => filterMediaFromContentItem(item))
    .filter(item => item !== null);
}

export function filterMediaFromAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const filteredAttributes = { ...attributes };

  for (const [key, value] of Object.entries(filteredAttributes)) {
    if (Array.isArray(value)) {
      if (value.length > 0 && value.some(item => isValidContentItem(item))) {
        const filtered = filterMediaFromContentArray(value);
        if (filtered.length === 0) {
          delete filteredAttributes[key];
        } else {
          filteredAttributes[key] = filtered;
        }
      }
    }
  }

  return filteredAttributes;
}
