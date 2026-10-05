import { describe, expect, test } from 'vitest';
import { classifyResponseStreaming } from '../../src/utils/responseStreaming';

describe('classifyResponseStreaming', () => {
  test.each([
    ['text/event-stream; charset=utf-8', true],
    ['application/x-ndjson', true],
    ['application/ndjson', true],
    ['application/stream+json', true],
    ['TEXT/EVENT-STREAM', true],
    ['text/plain', true],
    ['text/html', false],
    ['application/json', false],
    ['application/octet-stream', false],
  ])('classifies %s without reading the body', (contentType, isStreaming) => {
    const response = new Response(new ReadableStream(), { headers: { 'content-type': contentType } });

    expect(classifyResponseStreaming(response)).toEqual({ isStreaming });
    expect(response.bodyUsed).toBe(false);
    expect(response.body?.locked).toBe(false);
  });

  test('treats plain text with a known length as non-streaming', () => {
    const response = new Response('ready', { headers: { 'content-type': 'text/plain', 'content-length': '5' } });

    expect(classifyResponseStreaming(response)).toEqual({ isStreaming: false });
  });

  test('treats a bodyless response as non-streaming even with streaming headers', () => {
    const response = new Response(null, { status: 204, headers: { 'content-type': 'text/event-stream' } });

    expect(classifyResponseStreaming(response)).toEqual({ isStreaming: false });
  });
});
