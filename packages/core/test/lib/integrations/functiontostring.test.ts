import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../src/currentScopes';
import { fill, getClient, getCurrentScope, setCurrentClient } from '../../../src';
import { functionToStringIntegration } from '../../../src/integrations/functiontostring';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

vi.mock('../../../src/currentScopes', async importOriginal => {
  const actual = await importOriginal<typeof currentScopes>();
  return { ...actual, getClient: vi.fn(actual.getClient) };
});

describe('FunctionToString', () => {
  beforeEach(() => {
    const testClient = new TestClient(getDefaultTestClientOptions({}));
    setCurrentClient(testClient);
  });

  afterEach(() => {
    vi.mocked(currentScopes.getClient).mockClear();
  });

  afterAll(() => {
    getCurrentScope().setClient(undefined);
    vi.restoreAllMocks();
  });

  it('it works as expected', () => {
    const foo = {
      bar(wat: boolean): boolean {
        return wat;
      },
    };
    const originalFunction = foo.bar.toString();
    fill(foo, 'bar', function wat(whatever: boolean): () => void {
      return function watwat(): boolean {
        return whatever;
      };
    });

    expect(foo.bar.toString()).not.toBe(originalFunction);

    const fts = functionToStringIntegration();
    getClient()?.addIntegration(fts);

    expect(foo.bar.toString()).toBe(originalFunction);
  });

  it('does not activate when client is not active', () => {
    const foo = {
      bar(wat: boolean): boolean {
        return wat;
      },
    };
    const originalFunction = foo.bar.toString();
    fill(foo, 'bar', function wat(whatever: boolean): () => void {
      return function watwat(): boolean {
        return whatever;
      };
    });

    expect(foo.bar.toString()).not.toBe(originalFunction);

    const testClient = new TestClient(getDefaultTestClientOptions({}));
    const fts = functionToStringIntegration();
    testClient.addIntegration(fts);

    expect(foo.bar.toString()).not.toBe(originalFunction);
  });

  it('falls back to native toString and does not throw when the carrier read throws', () => {
    const foo = {
      bar(wat: boolean): boolean {
        return wat;
      },
    };
    const nativeString = foo.bar.toString();

    const fts = functionToStringIntegration();
    getClient()?.addIntegration(fts);

    // Simulate a `SecurityError` thrown while reading the Sentry carrier off a cross-origin `WindowProxy`.
    vi.mocked(currentScopes.getClient).mockImplementation(() => {
      throw new Error('SecurityError: Blocked a frame from accessing a cross-origin frame.');
    });

    expect(() => foo.bar.toString()).not.toThrow();
    expect(foo.bar.toString()).toBe(nativeString);
  });
});
