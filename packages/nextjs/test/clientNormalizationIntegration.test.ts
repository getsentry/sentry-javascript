import type { StackFrame } from '@sentry/core';
import * as SentryReact from '@sentry/react';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { nextjsClientStackFrameNormalizationIntegration } from '../src/client/clientNormalizationIntegration';

const dom = new JSDOM(undefined, { url: 'https://example.com/' });
const originalWindow = (global as { window?: unknown }).window;
Object.defineProperty(global, 'window', { value: dom.window, writable: true, configurable: true });

afterAll(() => {
  Object.defineProperty(global, 'window', { value: originalWindow, writable: true, configurable: true });
});

type Iteratee = (frame: StackFrame) => StackFrame;

function captureIteratee(options: Parameters<typeof nextjsClientStackFrameNormalizationIntegration>[0]): Iteratee {
  let iteratee: Iteratee | undefined;
  const spy = vi.spyOn(SentryReact, 'rewriteFramesIntegration').mockImplementation(rewriteFramesOptions => {
    iteratee = rewriteFramesOptions?.iteratee as Iteratee;
    return { name: 'RewriteFrames', processEvent: e => e };
  });

  nextjsClientStackFrameNormalizationIntegration(options);
  spy.mockRestore();

  if (!iteratee) {
    throw new Error('rewriteFramesIntegration was not called with an iteratee');
  }
  return iteratee;
}

describe('nextjsClientStackFrameNormalizationIntegration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('marks Next.js internal chunks as not in_app', () => {
    const iteratee = () =>
      captureIteratee({
        rewriteFramesAssetPrefixPath: '',
        experimentalThirdPartyOriginStackFrames: false,
      });

    it.each([
      'app:///_next/static/chunks/webpack-e0a29dd514f2abf8.js',
      'app:///_next/static/chunks/webpack-e0a29dd514f2abf8.js:1',
      'app:///_next/static/chunks/webpack-e0a29dd514f2abf8.js:1:234',
      'app:///_next/static/chunks/main-app-abc123.js:10:5',
      'app:///_next/static/chunks/framework.deadbeef.js:2',
    ])('sets in_app=false for %s', filename => {
      const frame = iteratee()({ filename });
      expect(frame.in_app).toBe(false);
    });

    it('leaves app chunks as in_app', () => {
      const frame = iteratee()({ filename: 'app:///_next/static/chunks/pages/index-deadbeef.js:1:2' });
      expect(frame.in_app).toBeUndefined();
    });
  });

  describe('experimentalThirdPartyOriginStackFrames', () => {
    const iteratee = () =>
      captureIteratee({
        rewriteFramesAssetPrefixPath: '',
        experimentalThirdPartyOriginStackFrames: true,
        assetPrefix: 'https://cdn.example.com',
      });

    it.each([
      'https://cdn.example.com/_next/static/chunks/webpack-e0a29dd514f2abf8.js',
      'https://cdn.example.com/_next/static/chunks/webpack-e0a29dd514f2abf8.js:1',
      'https://cdn.example.com/_next/static/chunks/webpack-e0a29dd514f2abf8.js:1:234',
    ])('sets in_app=false for %s', filename => {
      const frame = iteratee()({ filename });
      expect(frame.in_app).toBe(false);
    });
  });
});
