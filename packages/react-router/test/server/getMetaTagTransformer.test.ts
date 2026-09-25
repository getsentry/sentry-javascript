import { getTraceMetaTags } from '@sentry/core';
import { PassThrough } from 'stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getMetaTagTransformer } from '../../src/server/getMetaTagTransformer';

vi.mock('@sentry/core', () => ({
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

  test('should not corrupt a multi-byte character split across the head-closing chunk', () =>
    new Promise<void>((resolve, reject) => {
      const bodyStream = new PassThrough();
      const transformer = getMetaTagTransformer(bodyStream);

      const outputChunks: Buffer[] = [];
      bodyStream.on('data', chunk => {
        outputChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      bodyStream.on('end', () => {
        try {
          const output = Buffer.concat(outputChunks).toString('utf-8');
          expect(output).not.toContain('�');
          expect(output).toContain('<p>© 2026</p>');
          expect(output).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      // `©` is 0xC2 0xA9 in UTF-8; the closing-head chunk ends mid-character.
      transformer.write(Buffer.from([...Buffer.from('<html><head></head><body><p>'), 0xc2]));
      transformer.write(Buffer.from([0xa9, ...Buffer.from(' 2026</p></body></html>')]));
      transformer.end();
    }));
});
