import { Layer } from '@sentry/hub';
import * as domain from 'domain';

const mockGetGlobalHub = jest.fn();

class MockHub {
  public constructor(public stack: Layer[] = []) {
    MockHub.instance = this;
  }
  public static instance: MockHub;

  public getStack(): Layer[] {
    return this.stack;
  }
}

const mockHub = MockHub;
jest.mock('@sentry/hub', () => ({
  Hub: mockHub,
  getGlobalHub: mockGetGlobalHub,
}));

import { getGlobalHub } from '../src';

describe('domains', () => {
  let globalHub: MockHub;

  beforeEach(() => {
    globalHub = new MockHub();
    mockGetGlobalHub.mockReturnValue(globalHub);
  });

  afterEach(() => {
    if (domain.active) {
      domain.active.exit();
    }
    jest.resetAllMocks();
  });

  test('without domain', () => {
    expect(domain.active).toBeFalsy();
    const hub = getGlobalHub();
    expect(hub).toBe(globalHub);
  });

  test('domain hub inheritance', () => {
    globalHub.stack = [{ type: 'process' }];
    const d = domain.create();
    d.run(() => {
      const hub = getGlobalHub();
      expect(globalHub).not.toBe(hub);
      expect(globalHub.getStack()).toEqual(hub.getStack());
    });
  });

  test('domain hub isolation', () => {
    const d = domain.create();
    d.run(() => {
      const hub = getGlobalHub();
      hub.getStack().push({ type: 'process' });
      expect(hub.getStack()).toEqual([{ type: 'process' }]);
      expect(globalHub.getStack()).toEqual([]);
    });
  });

  test('domain hub single instance', () => {
    const d = domain.create();
    d.run(() => {
      expect(getGlobalHub()).toBe(getGlobalHub());
    });
  });

  test('concurrent domain hubs', done => {
    const d1 = domain.create();
    const d2 = domain.create();

    d1.run(() => {
      getGlobalHub()
        .getStack()
        .push({ type: 'process' });

      setTimeout(() => {
        expect(getGlobalHub().getStack()).toEqual([{ type: 'process' }]);
      }, 50);
    });

    d2.run(() => {
      getGlobalHub()
        .getStack()
        .push({ type: 'local' });

      setTimeout(() => {
        expect(getGlobalHub().getStack()).toEqual([{ type: 'local' }]);
        done();
      }, 100);
    });
  });
});
