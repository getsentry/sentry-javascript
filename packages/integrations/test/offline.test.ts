import { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import * as utils from '@sentry/utils';

import { Offline } from '../src/offline';

// mock localforage methods
jest.mock('localforage', () => ({
  createInstance(_options: object): any {
    let items: object[] = [];

    return {
      async getItem(key: string): object {
        return items.find(item => item.key === key);
      },
      async iterate(callback: () => void): void {
        items.forEach((item, index) => {
          callback(item.value, item.key, index);
        });
      },
      async length(): number {
        return items.length;
      },
      async removeItem(key: string): void {
        items = items.filter(item => item.key !== key);
      },
      async setItem(key: string, value: Event): void {
        items.push({
          key,
          value,
        });
      },
    };
  },
}));

// mock sentry utils
jest.mock('@sentry/utils');

let integration: Integration;
let online: boolean;

describe('Offline', () => {
  describe('when app is online', () => {
    beforeEach(() => {
      online = true;

      initIntegration();
    });

    it('does not store events in offline store', async () => {
      setupOnce();
      processEvents();

      expect(await integration.offlineEventStore.length()).toEqual(0);
    });

    describe('when there are already events in the cache from a previous offline session', () => {
      beforeEach(done => {
        const event = { message: 'previous event' };

        integration.offlineEventStore
          .setItem('previous', event)
          .then(() => {
            done();
          })
          .catch(error => error);
      });

      it('sends stored events', async () => {
        expect(await integration.offlineEventStore.length()).toEqual(1);

        setupOnce();
        processEvents();

        expect(await integration.offlineEventStore.length()).toEqual(0);
      });
    });
  });

  describe('when app is offline', () => {
    beforeEach(() => {
      online = false;

      initIntegration();
      setupOnce();
      processEvents();
    });

    it('stores events in offline store', async () => {
      expect(await integration.offlineEventStore.length()).toEqual(1);
    });

    describe('when connectivity is restored', () => {
      it('sends stored events', async done => {
        processEventListeners();

        expect(await integration.offlineEventStore.length()).toEqual(0);

        setImmediate(done);
      });
    });
  });
});

let eventListeners: any[];
let eventProcessors: EventProcessor[];

/** JSDoc */
function addGlobalEventProcessor(callback: () => void): void {
  eventProcessors.push(callback);
}

/** JSDoc */
function getCurrentHub(): Hub {
  return {
    captureEvent(_event: Event): string {
      return 'an-event-id';
    },
    getIntegration(_integration: Integration): any {
      // pretend integration is enabled
      return true;
    },
  };
}

/** JSDoc */
function initIntegration(): void {
  eventListeners = [];
  eventProcessors = [];

  utils.getGlobalObject.mockImplementation(() => ({
    addEventListener: (_windowEvent, callback) => {
      eventListeners.push(callback);
    },
    navigator: {
      onLine: online,
    },
  }));

  integration = new Offline();
}

/** JSDoc */
function processEventListeners(): void {
  eventListeners.forEach(listener => {
    listener();
  });
}

/** JSDoc */
function processEvents(): void {
  eventProcessors.forEach(processor => {
    processor({
      message: 'There was an error!',
    });
  });
}

/** JSDoc */
function setupOnce(): void {
  integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
}
