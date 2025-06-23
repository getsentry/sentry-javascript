// Payload for requests
export function generatePayload(sizeInBytes: number): { data: string } {
  const baseSize = JSON.stringify({ data: '' }).length;
  const contentLength = sizeInBytes - baseSize;

  return { data: 'x'.repeat(contentLength) };
}

// Generate the "expected" body string
export function generatePayloadString(dataLength: number, truncate?: boolean): string {
  const prefix = '{"data":"';
  const suffix = truncate ? '...' : '"}';

  const baseStructuralLength = prefix.length + suffix.length;
  const dataContent = 'x'.repeat(dataLength - baseStructuralLength);

  return `${prefix}${dataContent}${suffix}`;
}

// Functions for non-ASCII payloads (e.g. emojis)
export function generateEmojiPayload(sizeInBytes: number): { data: string } {
  const baseSize = JSON.stringify({ data: '' }).length;
  const contentLength = sizeInBytes - baseSize;

  return { data: '👍'.repeat(contentLength) };
}
export function generateEmojiPayloadString(dataLength: number, truncate?: boolean): string {
  const prefix = '{"data":"';
  const suffix = truncate ? '...' : '"}';

  const baseStructuralLength = suffix.length;
  const dataContent = '👍'.repeat(dataLength - baseStructuralLength);

  return `${prefix}${dataContent}${suffix}`;
}
