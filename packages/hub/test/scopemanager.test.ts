import { getGlobalObject } from '@sentry/utils';
import { getMainCarrier } from 'src';
import { SimpleScopeManager } from 'src/simpleScopeManager';

describe('Global Scope Manager', () => {
  beforeEach(() => {
    const carrier = getMainCarrier();
    if (carrier.__SENTRY__) {
      carrier.__SENTRY__.scopeManager = new SimpleScopeManager();
    }
  });

  test('get a scope manager from the global carrier', () => {});
  test('set a scope manager on the global carrier', () => {});
  test('mutate the scope belonging to the scope manager', () => {});
  test('fork a scope, mutate and compare to global scope', () => {});
});
