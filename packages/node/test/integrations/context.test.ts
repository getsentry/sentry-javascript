import * as os from 'os';

import { getDeviceContext } from '../../src/integrations/context';

describe('Context', () => {
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
