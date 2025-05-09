import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fill, getClient, getCurrentScope, setCurrentClient } from '../../../src';
import { functionToStringIntegration } from '../../../src/integrations/functiontostring';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('FunctionToString', () => {
  beforeEach(() => {
    const testClient = new TestClient(getDefaultTestClientOptions({}));
    setCurrentClient(testClient);
  });

  afterAll(() => {
    getCurrentScope().setClient(undefined);
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
});
