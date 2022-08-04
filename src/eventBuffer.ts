import { captureException } from '@sentry/core';

import { logger } from './util/logger';
import workerString from './worker/worker.js';
import { RecordingEvent, WorkerRequest, WorkerResponse } from './types';

interface CreateEventBufferParams {
  useCompression: boolean;
}

export function createEventBuffer({ useCompression }: CreateEventBufferParams) {
  if (useCompression && window.Worker) {
    const workerBlob = new Blob([workerString]);
    const workerUrl = URL.createObjectURL(workerBlob);

    try {
      logger.log('Using compression worker');
      const worker = new Worker(workerUrl);
      if (worker) {
        return new EventBufferCompressionWorker(worker);
      } else {
        captureException(new Error('Unable to create compression worker'));
      }
    } catch {
      // catch and ignore, fallback to simple event buffer
    }
    logger.log('Falling back to simple event buffer');
  }

  logger.log('Using simple buffer');
  return new EventBufferArray();
}

export interface IEventBuffer {
  get length(): number;
  destroy(): void;
  addEvent(event: RecordingEvent, isCheckout?: boolean): void;
  finish(): Promise<string | Uint8Array>;
}

class EventBufferArray implements IEventBuffer {
  events: RecordingEvent[];

  constructor() {
    this.events = [];
  }

  destroy() {
    this.events = [];
  }

  get length() {
    return this.events.length;
  }

  addEvent(event: RecordingEvent, isCheckout?: boolean) {
    if (isCheckout) {
      this.events = [event];
      return;
    }

    this.events.push(event);
  }

  finish() {
    return new Promise<string>((resolve) => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this.events;
      this.events = [];
      resolve(JSON.stringify(eventsRet));
    });
  }
}

// exporting for testing
export class EventBufferCompressionWorker implements IEventBuffer {
  private worker: Worker;
  private eventBufferItemLength = 0;
  private _id = 0;

  constructor(worker: Worker) {
    this.worker = worker;
  }

  /**
   * Read-only incrementing counter
   */
  get id() {
    return this._id++;
  }

  postMessage(args: WorkerRequest) {
    this.worker.postMessage(args);
  }

  init() {
    this.postMessage({ id: this.id, method: 'init', args: [] });
    logger.log('Initialized compression worker');
  }

  destroy() {
    logger.log('Destroying compression worker');
    this.worker.terminate();
    this.worker = null;
  }

  get length() {
    return this.eventBufferItemLength;
  }

  addEvent(event: RecordingEvent, isCheckout?: boolean) {
    // If it is a checkout we should make sure worker buffer is cleared before proceeding
    if (!isCheckout) {
      this.sendEventToWorker(event);
      return;
    }

    const initListener = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.method !== 'init') {
        return;
      }

      if (!data.success) {
        // TODO: Do some error handling, not sure what
        logger.error(data.response);
        return;
      }

      // Worker has been re-initialized, can add event now
      this.sendEventToWorker(event);
      this.worker.removeEventListener('message', initListener);
    };
    this.worker.addEventListener('message', initListener);

    this.postMessage({ id: this.id, method: 'init', args: [] });
  }

  sendEventToWorker = (event: RecordingEvent) => {
    this.postMessage({
      id: this.id,
      method: 'addEvent',
      args: [event],
    });
    this.eventBufferItemLength++;
  };

  finishRequest = (id: number) => {
    return new Promise<Uint8Array>((resolve, reject) => {
      const finishListener = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.method !== 'finish') {
          return;
        }

        if (data.id !== id) {
          return;
        }

        if (!data.success) {
          // TODO: Do some error handling, not sure what
          logger.error(data.response);

          reject(new Error('Error in compression worker'));
          return;
        }

        resolve(data.response as Uint8Array);
        logger.log('Worker responded with compressed payload');
        this.eventBufferItemLength = 0;
        this.worker.removeEventListener('message', finishListener);
      };
      this.worker.addEventListener('message', finishListener);
      this.postMessage({ id, method: 'finish', args: [] });
    });
  };

  async finish() {
    return await this.finishRequest(this.id);
  }
}
