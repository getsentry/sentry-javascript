import { Layer } from '@sentry/hub';
import * as domain from 'domain';

const mockGetDefaultHub = jest.fn();

class MockHub {
  public constructor(public stack: Layer[] = []) {
    MockHub.instance = this;
  }
  public static instance: MockHub;

  public getStack(): Layer[] {
    return this.stack;
  }

  public getStackTop(): Layer {
    return this.stack[this.stack.length - 1];
  }
}

const mockHub = MockHub;
jest.mock('@sentry/hub', () => ({
  Hub: mockHub,
  getDefaultHub: mockGetDefaultHub,
}));

import { getDefaultHub } from '../src';

describe('domains', () => {
  let globalHub: MockHub;

  beforeEach(() => {
    globalHub = new MockHub();
    mockGetDefaultHub.mockReturnValue(globalHub);
  });

  afterEach(() => {
    if (domain.active) {
      domain.active.exit();
    }
    jest.resetAllMocks();
  });

  test('without domain', () => {
    expect(domain.active).toBeFalsy();
    const hub = getDefaultHub();
    expect(hub).toBe(globalHub);
  });

  test('domain hub inheritance', () => {
    globalHub.stack = [];
    const d = domain.create();
    d.run(() => {
      const hub = getDefaultHub();
      expect(globalHub).not.toBe(hub);
      expect(globalHub.getStack()).toEqual(hub.getStack());
    });
  });

  test('domain hub isolation', () => {
    const d = domain.create();
    d.run(() => {
      const hub = getDefaultHub();
      hub.getStack().push({ client: 'whatever' });
      expect(hub.getStack()).toEqual([{ client: 'whatever' }]);
      expect(globalHub.getStack()).toEqual([]);
    });
  });

  test('domain hub single instance', () => {
    const d = domain.create();
    d.run(() => {
      expect(getDefaultHub()).toBe(getDefaultHub());
    });
  });

  test('concurrent domain hubs', done => {
    const d1 = domain.create();
    const d2 = domain.create();

    d1.run(() => {
      getDefaultHub()
        .getStack()
        .push({ client: 'process' });

      setTimeout(() => {
        expect(getDefaultHub().getStack()).toEqual([{ client: 'process' }]);
      }, 50);
    });

    d2.run(() => {
      getDefaultHub()
        .getStack()
        .push({ client: 'local' });

      setTimeout(() => {
        expect(getDefaultHub().getStack()).toEqual([{ client: 'local' }]);
        done();
      }, 100);
    });
  });
});
