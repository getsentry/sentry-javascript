import { GLOBAL_OBJ } from '@sentry/utils';

import * as Sentry from '../../src';
import { NodeExperimentalClient } from '../../src/sdk/client';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

describe('Integration | Client', () => {
  describe('getClient', () => {
    beforeEach(() => {
      GLOBAL_OBJ.__SENTRY__ = {
        extensions: {},
        hub: undefined,
        globalEventProcessors: [],
        logger: undefined,
      };
    });

    afterEach(() => {
      cleanupOtel();
    });

    test('it works with no client', () => {
      expect(Sentry.getClient()).toBeUndefined();
    });

    test('it works with a client', () => {
      mockSdkInit();
      expect(Sentry.getClient()).toBeDefined();
      expect(Sentry.getClient()).toBeInstanceOf(NodeExperimentalClient);
    });
  });
});
