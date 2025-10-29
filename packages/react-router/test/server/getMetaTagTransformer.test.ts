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

  test('should inject meta tags before closing head tag', () =>
    new Promise<void>((resolve, reject) => {
      const bodyStream = new PassThrough();
      const transformer = getMetaTagTransformer(bodyStream);

      let outputData = '';
      bodyStream.on('data', chunk => {
        outputData += chunk.toString();
      });

      bodyStream.on('end', () => {
        try {
          expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
          expect(outputData).not.toContain('</head></head>');
          expect(getTraceMetaTags).toHaveBeenCalledTimes(1);
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      transformer.write('<html><head></head><body>Test</body></html>');
      transformer.end();
    }));

  test('should not modify chunks without head closing tag', () =>
    new Promise<void>((resolve, reject) => {
      const bodyStream = new PassThrough();
      const transformer = getMetaTagTransformer(bodyStream);

      let outputData = '';
      bodyStream.on('data', chunk => {
        outputData += chunk.toString();
      });

      bodyStream.on('end', () => {
        try {
          expect(outputData).toBe('<html><body>Test</body></html>');
          expect(outputData).not.toContain('sentry-trace');
          expect(getTraceMetaTags).not.toHaveBeenCalled();
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      transformer.write('<html><body>Test</body></html>');
      transformer.end();
    }));

  test('should handle buffer input', () =>
    new Promise<void>((resolve, reject) => {
      const bodyStream = new PassThrough();
      const transformer = getMetaTagTransformer(bodyStream);

      let outputData = '';
      bodyStream.on('data', chunk => {
        outputData += chunk.toString();
      });

      bodyStream.on('end', () => {
        try {
          expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
          expect(getTraceMetaTags).toHaveBeenCalledTimes(1);
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      transformer.write(Buffer.from('<html><head></head><body>Test</body></html>'));
      transformer.end();
    }));

  test('should handle multiple chunks', () =>
    new Promise<void>((resolve, reject) => {
      const bodyStream = new PassThrough();
      const transformer = getMetaTagTransformer(bodyStream);

      let outputData = '';
      bodyStream.on('data', chunk => {
        outputData += chunk.toString();
      });

      bodyStream.on('end', () => {
        try {
          expect(outputData).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
          expect(outputData).toContain('<body>Test content</body>');
          expect(getTraceMetaTags).toHaveBeenCalledTimes(1);
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      transformer.write('<html><head>');
      transformer.write('</head><body>Test content</body>');
      transformer.write('</html>');
      transformer.end();
    }));
});
