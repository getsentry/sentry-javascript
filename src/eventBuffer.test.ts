import { BASE_TIMESTAMP } from '@test';
import { createEventBuffer, EventBufferCompressionWorker } from './eventBuffer';
import { handleMessage } from '../worker/src/handleMessage';
import { WorkerRequest, WorkerResponse } from './types';
import pako from 'pako';

const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

it('adds events to normal event buffer', async function () {
  const buffer = createEventBuffer({ useCompression: false });

  buffer.addEvent(TEST_EVENT);
  buffer.addEvent(TEST_EVENT);

  const result = await buffer.finish();

  expect(result).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
});

it('adds checkout event to normal event buffer', async function () {
  const buffer = createEventBuffer({ useCompression: false });

  buffer.addEvent(TEST_EVENT);
  buffer.addEvent(TEST_EVENT);
  buffer.addEvent(TEST_EVENT);

  buffer.addEvent(TEST_EVENT, true);
  const result = await buffer.finish();

  expect(result).toEqual(JSON.stringify([TEST_EVENT]));
});

const workerPostMessage = jest.fn();
window.postMessage = workerPostMessage;

class MockWorker implements Worker {
  constructor() {
    workerPostMessage.mockImplementation((data: WorkerResponse) => {
      const listeners = this.listeners.get('message');

      if (listeners) {
        listeners.forEach((listener) =>
          listener({ data } as MessageEvent<WorkerResponse>)
        );
      }
    });
  }
  listeners = new Map([
    ['message', new Set<(e: MessageEvent<WorkerResponse>) => void>()],
  ]);

  terminate() {
    this.listeners = new Map();
  }

  addEventListener(
    type: string,
    listener: (e: MessageEvent<WorkerResponse>) => void
  ) {
    const typeListener = this.listeners.get(type);

    if (typeListener) {
      typeListener.add(listener);
    }
  }

  removeEventListener(
    type: string,
    listener: (e: MessageEvent<WorkerResponse>) => void
  ) {
    const typeListener = this.listeners.get(type);

    if (typeListener) {
      typeListener.delete(listener);
    }
  }

  postMessage(data: WorkerRequest) {
    handleMessage({ data } as MessageEvent<WorkerRequest>);
  }
  onmessageerror: (this: Worker, ev: MessageEvent<any>) => any;
  onmessage: (this: Worker, ev: MessageEvent<any>) => any;
  onerror: (this: AbstractWorker, ev: ErrorEvent) => any;
  dispatchEvent(event: Event): boolean {
    return true;
  }
}

it('adds events to event buffer with compression worker', async function () {
  const worker = new MockWorker();
  const buffer = new EventBufferCompressionWorker(worker);

  buffer.addEvent(TEST_EVENT);
  buffer.addEvent(TEST_EVENT);

  const result = await buffer.finish();
  const restored = pako.inflate(result, { to: 'string' });

  expect(restored).toEqual(JSON.stringify([TEST_EVENT, TEST_EVENT]));
});

it('adds checkout events to event buffer with compression worker', async function () {
  const worker = new MockWorker();
  const buffer = new EventBufferCompressionWorker(worker);

  buffer.addEvent(TEST_EVENT);
  buffer.addEvent(TEST_EVENT);

  // This should clear previous buffer
  buffer.addEvent({ ...TEST_EVENT, type: 2 }, true);

  const result = await buffer.finish();
  const restored = pako.inflate(result, { to: 'string' });

  expect(restored).toEqual(JSON.stringify([{ ...TEST_EVENT, type: 2 }]));
});
