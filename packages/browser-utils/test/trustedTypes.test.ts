/**
 * @vitest-environment jsdom
 */

import type { Client } from '@sentry/core';
import { getCurrentScope, GLOBAL_OBJ, makeDsn, SDK_VERSION } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrustedScriptURL } from '../src/trustedTypes';

const REPORT_DIALOG_URL = 'https://sentry.example.com/api/embed/error-page/?dsn=abc';

type Rules = { createScriptURL(input: string): string };

function mockClient(dsn: string | undefined, options: { cdnBaseUrl?: string } = {}): void {
  getCurrentScope().setClient({
    getDsn: () => dsn && makeDsn(dsn),
    getOptions: () => options,
  } as Client);
}

function mockTrustedTypes(createPolicy = vi.fn((_name: string, rules: Rules): Rules => rules)) {
  vi.stubGlobal('trustedTypes', { createPolicy });
  return createPolicy;
}

describe('getTrustedScriptURL', () => {
  beforeEach(() => {
    delete GLOBAL_OBJ.__SENTRY__;
    mockClient('https://public@sentry.example.com/1337');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete GLOBAL_OBJ.__SENTRY__;
  });

  it('returns the url unchanged when Trusted Types is unavailable', () => {
    expect(getTrustedScriptURL(REPORT_DIALOG_URL)).toBe(REPORT_DIALOG_URL);
  });

  it('returns the value minted by the policy', () => {
    const trusted = { toString: () => REPORT_DIALOG_URL };
    const createPolicy = mockTrustedTypes(vi.fn(() => ({ createScriptURL: () => trusted as unknown as string })));

    expect(getTrustedScriptURL(REPORT_DIALOG_URL)).toBe(trusted);
    expect(createPolicy).toHaveBeenCalledWith('sentry-sdk', { createScriptURL: expect.any(Function) });
  });

  it('creates the policy lazily and only once', () => {
    const createPolicy = mockTrustedTypes();
    expect(createPolicy).not.toHaveBeenCalled();

    getTrustedScriptURL(REPORT_DIALOG_URL);
    getTrustedScriptURL(REPORT_DIALOG_URL);

    expect(createPolicy).toHaveBeenCalledTimes(1);
  });

  it('shares the policy between SDK copies of the same version', async () => {
    const createPolicy = mockTrustedTypes();
    getTrustedScriptURL(REPORT_DIALOG_URL);

    vi.resetModules();
    const otherCopy = await import('../src/trustedTypes');

    expect(otherCopy.getTrustedScriptURL).not.toBe(getTrustedScriptURL);
    expect(otherCopy.getTrustedScriptURL(REPORT_DIALOG_URL)).toBe(REPORT_DIALOG_URL);
    expect(createPolicy).toHaveBeenCalledTimes(1);
  });

  it('returns the url unchanged and does not retry when the policy cannot be created', () => {
    const createPolicy = mockTrustedTypes(
      vi.fn(() => {
        throw new TypeError('Policy "sentry-sdk" disallowed');
      }),
    );

    expect(getTrustedScriptURL(REPORT_DIALOG_URL)).toBe(REPORT_DIALOG_URL);
    expect(getTrustedScriptURL(REPORT_DIALOG_URL)).toBe(REPORT_DIALOG_URL);
    expect(createPolicy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['http://public@localhost:9000/1337', 'http://localhost:9000/api/embed/error-page/?dsn=abc'],
    ['https://public@example.com/sentry/1337', 'https://example.com/sentry/api/embed/error-page/?dsn=abc'],
  ])('accepts the report dialog for DSN %s', (dsn, url) => {
    mockTrustedTypes();
    mockClient(dsn);

    expect(getTrustedScriptURL(url)).toBe(url);
  });

  it.each([
    [undefined, `https://browser.sentry-cdn.com/${SDK_VERSION}/feedback-modal.min.js`],
    ['https://cdn.example.com', `https://cdn.example.com/${SDK_VERSION}/replay.min.js`],
  ])('accepts CDN bundles for cdnBaseUrl %s', (cdnBaseUrl, url) => {
    mockTrustedTypes();
    mockClient(undefined, { cdnBaseUrl });

    expect(getTrustedScriptURL(url)).toBe(url);
  });

  it('accepts blob URLs of the own origin', () => {
    mockTrustedTypes();
    const url = `blob:${window.origin}/7d9c8f1e`;

    expect(getTrustedScriptURL(url)).toBe(url);
  });

  it.each([
    'https://evil.example/api/embed/error-page/?dsn=abc',
    'https://sentry.example.com.evil.example/api/embed/error-page/?dsn=abc',
    'https://sentry.example.com@evil.example/api/embed/error-page/?dsn=abc',
    'https://sentry.example.com/api/embed/error-page/../../evil.js?dsn=abc',
    'https://sentry.example.com/evil.js',
    'http://sentry.example.com/api/embed/error-page/?dsn=abc',
    `https://evil.example/${SDK_VERSION}/replay.min.js`,
    `https://browser.sentry-cdn.com/${SDK_VERSION}/../1.0.0/replay.min.js`,
    'https://browser.sentry-cdn.com/1.0.0/replay.min.js',
    `https://browser.sentry-cdn.com/${SDK_VERSION}/replay.min.js?foo`,
    'blob:https://evil.example/7d9c8f1e',
    'javascript:alert(1)',
    'data:text/javascript,alert(1)',
    '',
  ])('refuses %j', url => {
    mockTrustedTypes();

    expect(() => getTrustedScriptURL(url)).toThrow(TypeError);
  });

  it('refuses the report dialog without a DSN', () => {
    mockTrustedTypes();
    mockClient(undefined);

    expect(() => getTrustedScriptURL(REPORT_DIALOG_URL)).toThrow(TypeError);
  });
});
