import { Layer } from '@sentry/hub';
import * as domain from 'domain';

const mockgetCurrentHub = jest.fn();

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
  getCurrentHub: mockgetCurrentHub,
}));

import { getCurrentHub } from '../src';

describe('domains', () => {
  let globalHub: MockHub;

  beforeEach(() => {
    globalHub = new MockHub();
    mockgetCurrentHub.mockReturnValue(globalHub);
  });

  afterEach(() => {
    if (domain.active) {
      domain.active.exit();
    }
    jest.resetAllMocks();
  });

  test('without domain', () => {
    expect(domain.active).toBeFalsy();
    const hub = getCurrentHub();
    expect(hub).toBe(globalHub);
  });

  test('domain hub inheritance', () => {
    globalHub.stack = [];
    const d = domain.create();
    d.run(() => {
      const hub = getCurrentHub();
      expect(globalHub).not.toBe(hub);
      expect(globalHub.getStack()).toEqual(hub.getStack());
    });
  });

  test('domain hub isolation', () => {
    const d = domain.create();
    d.run(() => {
      const hub = getCurrentHub();
      hub.getStack().push({ client: 'whatever' });
      expect(hub.getStack()).toEqual([{ client: 'whatever' }]);
      expect(globalHub.getStack()).toEqual([]);
    });
  });

  test('domain hub single instance', () => {
    const d = domain.create();
    d.run(() => {
      expect(getCurrentHub()).toBe(getCurrentHub());
    });
  });

  test('concurrent domain hubs', done => {
    const d1 = domain.create();
    const d2 = domain.create();

    d1.run(() => {
      getCurrentHub()
        .getStack()
        .push({ client: 'process' });

      setTimeout(() => {
        expect(getCurrentHub().getStack()).toEqual([{ client: 'process' }]);
      }, 50);
    });

    d2.run(() => {
      getCurrentHub()
        .getStack()
        .push({ client: 'local' });

      setTimeout(() => {
        expect(getCurrentHub().getStack()).toEqual([{ client: 'local' }]);
        done();
      }, 100);
    });
  });
});
