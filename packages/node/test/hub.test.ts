import * as domain from 'domain';

const mockGetGlobalHub = jest.fn();

class Hub {
  public constructor(public stack: any[] = []) {
    Hub.instance = this;
  }
  public static instance: Hub;

  public getStack(): any[] {
    return this.stack;
  }
}

const mockHub = Hub;
jest.mock('@sentry/hub', () => ({
  Hub: mockHub,
  getGlobalHub: mockGetGlobalHub,
}));

import { getGlobalHub } from '../src';

describe('getGlobalHub', () => {
  let globalHub: Hub;

  beforeEach(() => {
    globalHub = new Hub();
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

  test('inherit global hub', done => {
    globalHub.stack = ['abc'];
    const d = domain.create();
    d.run(() => {
      const hub = getGlobalHub();
      expect(globalHub).not.toBe(hub);
      expect(globalHub.getStack()).toEqual(hub.getStack());
      done();
    });
  });
});
