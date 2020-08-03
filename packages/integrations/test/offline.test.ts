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

      setupIntegration();
      processEvents();
    });

    it('does not store events in offline store', async () => {
      expect(await integration.offlineEventStore.length()).toEqual(0);
    });
  });

  describe('when app is offline', () => {
    beforeEach(() => {
      online = false;

      setupIntegration();
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
function setupIntegration(): void {
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
  integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
}
