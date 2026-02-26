/**
 * Inline media content source, with a potentially very large base64
 * blob or data: uri.
 */
export type ContentMedia = Record<string, unknown> &
  (
    | {
        media_type: string;
        data: string;
      }
    | {
        image_url: `data:${string}`;
      }
    | {
        image_url: { url: `data:${string}` };
      }
    | {
        type: 'blob' | 'base64';
        content: string;
      }
    | {
        b64_json: string;
      }
    | {
        uri: `data:${string}`;
      }
    | {
        type: 'input_audio';
        input_audio: { data: string };
      }
    | {
        type: 'file';
        file: { file_data?: string };
      }
  );

/**
 * Check if a content part is an OpenAI/Anthropic media source
 */
export function isContentMedia(part: unknown): part is ContentMedia {
  if (!part || typeof part !== 'object') return false;

  return (
    isContentMediaSource(part) ||
    hasInlineData(part) ||
    hasImageUrl(part) ||
    hasInputAudio(part) ||
    hasFileData(part) ||
    hasMediaTypeData(part) ||
    hasBlobOrBase64Type(part) ||
    hasB64Json(part) ||
    hasImageGenerationResult(part) ||
    hasDataUri(part)
  );
}

function hasImageUrl(part: NonNullable<unknown>): boolean {
  if (!('image_url' in part)) return false;
  if (typeof part.image_url === 'string') return part.image_url.startsWith('data:');
  return hasNestedImageUrl(part);
}

function hasNestedImageUrl(part: NonNullable<unknown>): part is { image_url: { url: string } } {
  return (
    'image_url' in part &&
    !!part.image_url &&
    typeof part.image_url === 'object' &&
    'url' in part.image_url &&
    typeof part.image_url.url === 'string' &&
    part.image_url.url.startsWith('data:')
  );
}

function isContentMediaSource(part: NonNullable<unknown>): boolean {
  return 'type' in part && typeof part.type === 'string' && 'source' in part && isContentMedia(part.source);
}

function hasInlineData(part: NonNullable<unknown>): part is { inlineData: { data?: string } } {
  return (
    'inlineData' in part &&
    !!part.inlineData &&
    typeof part.inlineData === 'object' &&
    'data' in part.inlineData &&
    typeof part.inlineData.data === 'string'
  );
}

function hasInputAudio(part: NonNullable<unknown>): part is { type: 'input_audio'; input_audio: { data: string } } {
  return (
    'type' in part &&
    part.type === 'input_audio' &&
    'input_audio' in part &&
    !!part.input_audio &&
    typeof part.input_audio === 'object' &&
    'data' in part.input_audio &&
    typeof part.input_audio.data === 'string'
  );
}

function hasFileData(part: NonNullable<unknown>): part is { type: 'file'; file: { file_data: string } } {
  return (
    'type' in part &&
    part.type === 'file' &&
    'file' in part &&
    !!part.file &&
    typeof part.file === 'object' &&
    'file_data' in part.file &&
    typeof part.file.file_data === 'string'
  );
}

function hasMediaTypeData(part: NonNullable<unknown>): part is { media_type: string; data: string } {
  return 'media_type' in part && typeof part.media_type === 'string' && 'data' in part;
}

function hasBlobOrBase64Type(part: NonNullable<unknown>): part is { type: 'blob' | 'base64'; content: string } {
  return 'type' in part && (part.type === 'blob' || part.type === 'base64');
}

function hasB64Json(part: NonNullable<unknown>): part is { b64_json: string } {
  return 'b64_json' in part;
}

function hasImageGenerationResult(part: NonNullable<unknown>): part is { type: 'image_generation'; result: string } {
  return 'type' in part && 'result' in part && part.type === 'image_generation';
}

function hasDataUri(part: NonNullable<unknown>): part is { uri: string } {
  return 'uri' in part && typeof part.uri === 'string' && part.uri.startsWith('data:');
}

const REMOVED_STRING = '[Blob substitute]';

const MEDIA_FIELDS = ['image_url', 'data', 'content', 'b64_json', 'result', 'uri'] as const;

/**
 * Replace inline binary data in a single media content part with a placeholder.
 */
export function stripInlineMediaFromSingleMessage(part: ContentMedia): ContentMedia {
  const strip = { ...part };
  if (isContentMedia(strip.source)) {
    strip.source = stripInlineMediaFromSingleMessage(strip.source);
  }
  if (hasInlineData(part)) {
    strip.inlineData = { ...part.inlineData, data: REMOVED_STRING };
  }
  if (hasNestedImageUrl(part)) {
    strip.image_url = { ...part.image_url, url: REMOVED_STRING };
  }
  if (hasInputAudio(part)) {
    strip.input_audio = { ...part.input_audio, data: REMOVED_STRING };
  }
  if (hasFileData(part)) {
    strip.file = { ...part.file, file_data: REMOVED_STRING };
  }
  for (const field of MEDIA_FIELDS) {
    if (typeof strip[field] === 'string') strip[field] = REMOVED_STRING;
  }
  return strip;
}
