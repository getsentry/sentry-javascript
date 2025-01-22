import { getSentryCarrier } from '../../src/carrier';
import { CARRIER_VERSION } from '../../src/carrier';

describe('getSentryCarrier', () => {
  describe('base case (one SDK)', () => {
    it('populates the default sentry carrier object if it does not exist', () => {
      const globalObject = {};
      const sentryCarrier = getSentryCarrier(globalObject);

      expect(sentryCarrier).toEqual({});

      expect(globalObject).toEqual({
        __SENTRY__: {
          version: CARRIER_VERSION,
          [CARRIER_VERSION]: {},
        },
      });
    });

    it('returns the existing sentry carrier object if it already exists', () => {
      const originalGlobalObject = {
        __SENTRY__: {
          version: CARRIER_VERSION,
          [CARRIER_VERSION]: {
            acs: {},
          },
        },
      };

      const globalObject = { ...originalGlobalObject };
      // @ts-expect-error - this is just a test object, not passing a full ACS
      const sentryCarrier = getSentryCarrier(globalObject);

      expect(sentryCarrier).toEqual({
        acs: {},
      });

      expect(globalObject).toStrictEqual(originalGlobalObject);
    });
  });

  describe('multiple (older) SDKs', () => {
    it("returns the version of the sentry carrier object of the SDK's version rather than the one set in .version", () => {
      const sentryCarrier = getSentryCarrier({
        __SENTRY__: {
          version: '8.0.0', // another SDK set this
          '8.0.0': {
            // @ts-expect-error - this is just a test object
            stack: {},
          },
          [CARRIER_VERSION]: {
            // @ts-expect-error - this is just a test object
            acs: {},
          },
          hub: {},
        },
      });

      expect(sentryCarrier).toEqual({
        acs: {},
      });
    });

    it("doesn't overwrite the .version property if it's already set and creates a new global sentry carrier for the SDK version if not set yet", () => {
      const globalObject = {
        __SENTRY__: {
          version: '8.0.0' as const,
          '8.0.0': {
            // and this object
            acs: {},
          },
        },
      };

      // @ts-expect-error - this is just a test object, no need to pass a hub
      const sentryCarrier = getSentryCarrier(globalObject);

      expect(sentryCarrier).toEqual({});

      expect(globalObject).toEqual({
        __SENTRY__: {
          version: '8.0.0',
          '8.0.0': {
            acs: {},
          },
          [CARRIER_VERSION]: {},
        },
      });
    });
  });
});
