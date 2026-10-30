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
    vi.restoreAllMocks();
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

  it('does not recurse when Reflect.apply performs a function toString check', () => {
    function inspectedFunction(): void {}

    const fts = functionToStringIntegration();
    getClient()?.addIntegration(fts);
    const expected = inspectedFunction.toString();
    const originalReflectApply = Reflect.apply;

    vi.spyOn(Reflect, 'apply').mockImplementation((target, thisArgument, argumentsList) => {
      target.toString();
      return originalReflectApply(target, thisArgument, argumentsList);
    });

    expect(inspectedFunction.toString()).toBe(expected);
  });

  it('does not recurse when Function.prototype.apply performs a function toString check', () => {
    function inspectedFunction(): void {}

    const fts = functionToStringIntegration();
    getClient()?.addIntegration(fts);
    const expected = inspectedFunction.toString();

    const applySpy = vi.spyOn(Function.prototype, 'apply').mockImplementation(function (
      this: Function,
      thisArg: unknown,
      args?: unknown[],
    ) {
      this.toString();
      return Reflect.apply(this, thisArg, args ?? []);
    });
    let result: unknown;
    try {
      result = inspectedFunction.toString();
    } catch (error) {
      result = error;
    }
    applySpy.mockRestore();

    expect(result).toBe(expected);
  });

  it('does not overflow the stack when called with many arguments', () => {
    function inspectedFunction(): void {}

    const fts = functionToStringIntegration();
    getClient()?.addIntegration(fts);
    const expected = inspectedFunction.toString();

    expect(Reflect.apply(Function.prototype.toString, inspectedFunction, new Array(100_000))).toBe(expected);
  });

  it('does not overflow the stack when the prototype chain loops through a Proxy', () => {
    function inspectedFunction(): void {}
    Object.setPrototypeOf(inspectedFunction, Object.create(new Proxy(inspectedFunction, {})));
    const callToString = Function.prototype.call.bind(Function.prototype.toString) as (thisArg: unknown) => string;
    const expected = callToString(inspectedFunction);

    const fts = functionToStringIntegration();
    getClient()?.addIntegration(fts);

    expect(callToString(inspectedFunction)).toBe(expected);
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
