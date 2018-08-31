import * as misc from '../src/misc';
import * as supports from '../src/supports';

describe('Supports', () => {
  let global: any;
  let getGlobalObject: any;

  beforeEach(() => {
    global = {};
    getGlobalObject = jest.spyOn(misc, 'getGlobalObject');
    getGlobalObject.mockReturnValue(global);
  });

  afterEach(() => {
    getGlobalObject.mockRestore();
  });

  describe('supportsBeacon', () => {
    it('should return false if no navigator in global', () => {
      expect(supports.supportsBeacon()).toEqual(false);
    });

    it('should return false if navigator and no sendBeacon in global', () => {
      global.navigator = {};
      expect(supports.supportsBeacon()).toEqual(false);
    });

    it('should return true if navigator and sendBeacon in global', () => {
      global.navigator = {
        sendBeacon: jest.fn(),
      };
      expect(supports.supportsBeacon()).toEqual(true);
    });
  });
});
