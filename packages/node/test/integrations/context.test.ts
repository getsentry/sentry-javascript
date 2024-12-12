import * as os from 'node:os';

import { getAppContext, getDeviceContext } from '../../src/integrations/context';
import { conditionalTest } from '../helpers/conditional';

describe('Context', () => {
  describe('getAppContext', () => {
    afterAll(() => {
      jest.clearAllMocks();
    });

    conditionalTest({ max: 18 })('it does not return free_memory on older node versions', () => {
      const appContext = getAppContext();
      expect(appContext.free_memory).toBeUndefined();
    });

    conditionalTest({ min: 22 })(
      'returns free_memory if process.availableMemory is defined and returns a valid value',
      () => {
        const appContext = getAppContext();
        expect(appContext.free_memory).toEqual(expect.any(Number));
      },
    );

    conditionalTest({ min: 22 })('returns no free_memory if process.availableMemory ', () => {
      jest.spyOn(process as any, 'availableMemory').mockReturnValue(undefined as unknown as number);
      const appContext = getAppContext();
      expect(appContext.free_memory).toBeUndefined();
    });
  });

  describe('getDeviceContext', () => {
    afterAll(() => {
      jest.clearAllMocks();
    });

    it('returns boot time if os.uptime is defined and returns a valid uptime', () => {
      const deviceCtx = getDeviceContext({});
      expect(deviceCtx.boot_time).toEqual(expect.any(String));
    });

    it('returns no boot time if os.uptime() returns undefined', () => {
      jest.spyOn(os, 'uptime').mockReturnValue(undefined as unknown as number);
      const deviceCtx = getDeviceContext({});
      expect(deviceCtx.boot_time).toBeUndefined();
    });
  });
});
