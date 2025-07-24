import { getTraceMetaTags } from '@sentry/core';
import { PassThrough } from 'stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getMetaTagTransformer } from '../../src/server/getMetaTagTransformer';

vi.mock('@opentelemetry/core', () => ({
  RPCType: { HTTP: 'http' },
  getRPCMetadata: vi.fn(),
}));

vi.mock('@sentry/core', () => ({
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
  getActiveSpan: vi.fn(),
  getRootSpan: vi.fn(),
  getTraceMetaTags: vi.fn(),
}));

describe('getMetaTagTransformer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getTraceMetaTags as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      '<meta name="sentry-trace" content="test-trace-id">',
    );
  });

  test('should inject meta tags before closing head tag', done => {
    const outputStream = new PassThrough();
    const bodyStream = new PassThrough();
    const transformer = getMetaTagTransformer(bodyStream);

    let outputData = '';
    outputStream.on('data', chunk => {
      outputData += chunk.toString();
    });

    outputStream.on('end', () => {
      expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
      expect(outputData).not.toContain('</head></head>');
      done();
    });

    transformer.pipe(outputStream);

    bodyStream.write('<html><head></head><body>Test</body></html>');
    bodyStream.end();
  });

  test('should not modify chunks without head closing tag', done => {
    const outputStream = new PassThrough();
    const bodyStream = new PassThrough();
    const transformer = getMetaTagTransformer(bodyStream);

    let outputData = '';
    outputStream.on('data', chunk => {
      outputData += chunk.toString();
    });

    outputStream.on('end', () => {
      expect(outputData).toBe('<html><body>Test</body></html>');
      expect(getTraceMetaTags).toHaveBeenCalled();
      done();
    });

    transformer.pipe(outputStream);

    bodyStream.write('<html><body>Test</body></html>');
    bodyStream.end();
  });

  test('should handle buffer input', done => {
    const outputStream = new PassThrough();
    const bodyStream = new PassThrough();
    const transformer = getMetaTagTransformer(bodyStream);

    let outputData = '';
    outputStream.on('data', chunk => {
      outputData += chunk.toString();
    });

    outputStream.on('end', () => {
      expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
      done();
    });

    transformer.pipe(outputStream);

    bodyStream.write(Buffer.from('<html><head></head><body>Test</body></html>'));
    bodyStream.end();
  });
});
