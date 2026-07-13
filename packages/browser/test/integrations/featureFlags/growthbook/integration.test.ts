import { getCurrentScope } from '@sentry/core/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { growthbookIntegration } from '../../../../src/integrations/featureFlags/growthbook';

describe('growthbookIntegration', () => {
  afterEach(() => {
    getCurrentScope().clear();
  });

  it('accepts a precisely-typed GrowthBook class without a cast and captures boolean evaluations', () => {
    class MockGrowthBook {
      public constructor(_options?: { apiHost: string }) {}

      public isOn(_key: string): boolean {
        return true;
      }

      public getFeatureValue(_key: string, _defaultValue: unknown): unknown {
        return false;
      }
    }

    const integration = growthbookIntegration({
      growthbookClass: MockGrowthBook,
    });
    integration.setupOnce?.();

    const growthbook = new MockGrowthBook();
    growthbook.isOn('my-feature');
    growthbook.getFeatureValue('my-other-feature', true);

    expect(getCurrentScope().getScopeData().contexts.flags?.values).toEqual([
      { flag: 'my-feature', result: true },
      { flag: 'my-other-feature', result: false },
    ]);
  });
});
