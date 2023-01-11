import * as SentryUtils from '@sentry/utils';

import { DEFAULT_FLUSH_MIN_DELAY, SESSION_IDLE_DURATION, WINDOW } from '../../src/constants';
import * as AddMemoryEntry from '../../src/util/addMemoryEntry';
import { createPerformanceSpans } from '../../src/util/createPerformanceSpans';
import { clearSession } from '../utils/clearSession';
import { createPerformanceEntries } from './../../src/createPerformanceEntry';
import { ReplayContainer } from './../../src/replay';
import { useFakeTimers } from './../../test/utils/use-fake-timers';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from './../index';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

type MockSendReplay = jest.MockedFunction<typeof ReplayContainer.prototype.sendReplay>;
type MockAddPerformanceEntries = jest.MockedFunction<typeof ReplayContainer.prototype.addPerformanceEntries>;
type MockAddMemoryEntry = jest.SpyInstance;
type MockEventBufferFinish = jest.MockedFunction<Exclude<typeof ReplayContainer.prototype.eventBuffer, null>['finish']>;
type MockFlush = jest.MockedFunction<typeof ReplayContainer.prototype.flush>;
type MockRunFlush = jest.MockedFunction<typeof ReplayContainer.prototype.runFlush>;

const prevLocation = WINDOW.location;
let domHandler: (args: any) => any;

const { record: mockRecord } = mockRrweb();

let replay: ReplayContainer;
let mockSendReplay: MockSendReplay;
let mockFlush: MockFlush;
let mockRunFlush: MockRunFlush;
let mockEventBufferFinish: MockEventBufferFinish;
let mockAddMemoryEntry: MockAddMemoryEntry;
let mockAddPerformanceEntries: MockAddPerformanceEntries;

beforeAll(async () => {
  jest.spyOn(SentryUtils, 'addInstrumentationHandler').mockImplementation((type, handler: (args: any) => any) => {
    if (type === 'dom') {
      domHandler = handler;
    }
  });

  ({ replay } = await mockSdk());
  jest.spyOn(replay, 'sendReplay');
  mockSendReplay = replay.sendReplay as MockSendReplay;
  mockSendReplay.mockImplementation(
    jest.fn(async () => {
      return;
    }),
  );

  jest.spyOn(replay, 'flush');
  mockFlush = replay.flush as MockFlush;

  jest.spyOn(replay, 'runFlush');
  mockRunFlush = replay.runFlush as MockRunFlush;

  jest.spyOn(replay, 'addPerformanceEntries');
  mockAddPerformanceEntries = replay.addPerformanceEntries as MockAddPerformanceEntries;

  mockAddPerformanceEntries.mockImplementation(async () => {
    return [];
  });

  mockAddMemoryEntry = jest.spyOn(AddMemoryEntry, 'addMemoryEntry');
});

beforeEach(() => {
  jest.runAllTimers();
  jest.setSystemTime(new Date(BASE_TIMESTAMP));
  mockSendReplay.mockClear();
  replay.eventBuffer?.destroy();
  mockAddPerformanceEntries.mockClear();
  mockFlush.mockClear();
  mockRunFlush.mockClear();
  mockAddMemoryEntry.mockClear();

  if (replay.eventBuffer) {
    jest.spyOn(replay.eventBuffer, 'finish');
  }
  mockEventBufferFinish = replay.eventBuffer?.finish as MockEventBufferFinish;
  mockEventBufferFinish.mockClear();
});

afterEach(async () => {
  jest.runAllTimers();
  await new Promise(process.nextTick);
  jest.setSystemTime(new Date(BASE_TIMESTAMP));
  sessionStorage.clear();
  clearSession(replay);
  replay.loadSession({ expiry: SESSION_IDLE_DURATION });
  mockRecord.takeFullSnapshot.mockClear();
  Object.defineProperty(WINDOW, 'location', {
    value: prevLocation,
    writable: true,
  });
});

afterAll(() => {
  replay && replay.stop();
});

it('flushes twice after multiple flush() calls)', async () => {
  // blur events cause an immediate flush (as well as a flush due to adding a
  // breadcrumb) -- this means that the first blur event will be flushed and
  // the following blur events will all call a debounced flush function, which
  // should end up queueing a second flush

  WINDOW.dispatchEvent(new Event('blur'));
  WINDOW.dispatchEvent(new Event('blur'));
  WINDOW.dispatchEvent(new Event('blur'));
  WINDOW.dispatchEvent(new Event('blur'));

  expect(replay.flush).toHaveBeenCalledTimes(4);

  jest.runAllTimers();
  await new Promise(process.nextTick);
  expect(replay.runFlush).toHaveBeenCalledTimes(1);

  jest.runAllTimers();
  await new Promise(process.nextTick);
  expect(replay.runFlush).toHaveBeenCalledTimes(2);

  jest.runAllTimers();
  await new Promise(process.nextTick);
  expect(replay.runFlush).toHaveBeenCalledTimes(2);
});

it('long first flush enqueues following events', async () => {
  // Mock this to resolve after 20 seconds so that we can queue up following flushes
  mockAddPerformanceEntries.mockImplementationOnce(async () => {
    return await new Promise(resolve => setTimeout(resolve, 20000));
  });

  expect(mockAddPerformanceEntries).not.toHaveBeenCalled();

  // flush #1 @ t=0s - due to blur
  WINDOW.dispatchEvent(new Event('blur'));
  expect(replay.flush).toHaveBeenCalledTimes(1);
  expect(replay.runFlush).toHaveBeenCalledTimes(1);

  // This will attempt to flush in 5 seconds (flushMinDelay)
  domHandler({
    name: 'click',
  });
  await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
  // flush #2 @ t=5s - due to click
  expect(replay.flush).toHaveBeenCalledTimes(2);

  await advanceTimers(1000);
  // flush #3 @ t=6s - due to blur
  WINDOW.dispatchEvent(new Event('blur'));
  expect(replay.flush).toHaveBeenCalledTimes(3);

  // NOTE: Blur also adds a breadcrumb which calls `addUpdate`, meaning it will
  // flush after `flushMinDelay`, but this gets cancelled by the blur
  await advanceTimers(8000);
  expect(replay.flush).toHaveBeenCalledTimes(3);

  // flush #4 @ t=14s - due to blur
  WINDOW.dispatchEvent(new Event('blur'));
  expect(replay.flush).toHaveBeenCalledTimes(4);

  expect(replay.runFlush).toHaveBeenCalledTimes(1);
  await advanceTimers(6000);
  // t=20s
  // addPerformanceEntries is finished, `flushLock` promise is resolved, calls
  // debouncedFlush, which will call `flush` in 1 second
  expect(replay.flush).toHaveBeenCalledTimes(4);
  // sendReplay is called with replayId, events, segment
  expect(mockSendReplay).toHaveBeenLastCalledWith({
    events: expect.any(String),
    replayId: expect.any(String),
    includeReplayStartTimestamp: true,
    segmentId: 0,
    eventContext: expect.anything(),
  });

  // Add this to test that segment ID increases
  mockAddPerformanceEntries.mockImplementationOnce(() => {
    createPerformanceSpans(
      replay,
      createPerformanceEntries([
        {
          name: 'https://sentry.io/foo.js',
          entryType: 'resource',
          startTime: 176.59999990463257,
          duration: 5.600000023841858,
          initiatorType: 'link',
          nextHopProtocol: 'h2',
          workerStart: 177.5,
          redirectStart: 0,
          redirectEnd: 0,
          fetchStart: 177.69999992847443,
          domainLookupStart: 177.69999992847443,
          domainLookupEnd: 177.69999992847443,
          connectStart: 177.69999992847443,
          connectEnd: 177.69999992847443,
          secureConnectionStart: 177.69999992847443,
          requestStart: 177.5,
          responseStart: 181,
          responseEnd: 182.19999992847443,
          transferSize: 0,
          encodedBodySize: 0,
          decodedBodySize: 0,
          serverTiming: [],
        } as unknown as PerformanceResourceTiming,
      ]),
    );
  });
  // flush #5 @ t=25s - debounced flush calls `flush`
  // 20s + `flushMinDelay` which is 5 seconds
  await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
  expect(replay.flush).toHaveBeenCalledTimes(5);
  expect(replay.runFlush).toHaveBeenCalledTimes(2);
  expect(mockSendReplay).toHaveBeenLastCalledWith({
    events: expect.any(String),
    replayId: expect.any(String),
    includeReplayStartTimestamp: false,
    segmentId: 1,
    eventContext: expect.anything(),
  });

  // Make sure there's no other calls
  jest.runAllTimers();
  await new Promise(process.nextTick);
  expect(mockSendReplay).toHaveBeenCalledTimes(2);
});
