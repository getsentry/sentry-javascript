import { EventStatus } from '@sentry/types';

import {
  _incrementSessionStatusCount,
  closeSessionFlusher,
  getSessionAggregates,
  SessionFlusher,
} from '../src/sessionflusher';

function makeTransporter() {
  return jest.fn(() => Promise.resolve({ status: 'success' as EventStatus }));
}

describe('Session Flusher', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.clearAllTimers());

  test('test incrementSessionStatusCount updates the internal SessionFlusher state', () => {
    // GIVEN
    const transporter = makeTransporter();
    const flusher = new SessionFlusher(transporter, { release: '1.0.0', environment: 'dev' });
    const date = new Date('2021-04-08T12:18:23.043Z');

    // WHEN
    let count = _incrementSessionStatusCount(flusher, 'ok', date);
    expect(count).toEqual(1);
    count = _incrementSessionStatusCount(flusher, 'ok', date);
    expect(count).toEqual(2);
    count = _incrementSessionStatusCount(flusher, 'errored', date);
    expect(count).toEqual(1);
    date.setMinutes(date.getMinutes() + 1);
    count = _incrementSessionStatusCount(flusher, 'ok', date);
    expect(count).toEqual(1);
    count = _incrementSessionStatusCount(flusher, 'errored', date);
    expect(count).toEqual(1);

    expect(getSessionAggregates(flusher).aggregates).toEqual([
      { errored: 1, exited: 2, started: '2021-04-08T12:18:00.000Z' },
      { errored: 1, exited: 1, started: '2021-04-08T12:19:00.000Z' },
    ]);
    expect(getSessionAggregates(flusher).attrs).toEqual({ release: '1.0.0', environment: 'dev' });
  });

  test('test undefined attributes are excluded, on incrementSessionStatusCount call', () => {
    // GIVEN
    const transporter = makeTransporter();
    const flusher = new SessionFlusher(transporter, { release: '1.0.0' });
    const date = new Date('2021-04-08T12:18:23.043Z');

    // WHEN
    _incrementSessionStatusCount(flusher, 'ok', date);
    _incrementSessionStatusCount(flusher, 'errored', date);

    // THEN
    expect(getSessionAggregates(flusher)).toEqual({
      aggregates: [{ errored: 1, exited: 1, started: '2021-04-08T12:18:00.000Z' }],
      attrs: { release: '1.0.0' },
    });
  });

  test('flush is called every ~60 seconds after initialisation of an instance of SessionFlusher', () => {
    const transporter = makeTransporter();
    const flusher = new SessionFlusher(transporter, { release: '1.0.0', environment: 'dev' });

    jest.advanceTimersByTime(59000);
    expect(transporter).toHaveBeenCalledTimes(0);

    _incrementSessionStatusCount(flusher, 'ok', new Date());
    jest.advanceTimersByTime(2000);

    _incrementSessionStatusCount(flusher, 'ok', new Date());
    expect(transporter).toHaveBeenCalledTimes(1);

    _incrementSessionStatusCount(flusher, 'ok', new Date());
    jest.advanceTimersByTime(58000);
    expect(transporter).toHaveBeenCalledTimes(1);

    _incrementSessionStatusCount(flusher, 'ok', new Date());
    jest.advanceTimersByTime(2000);
    expect(transporter).toHaveBeenCalledTimes(2);
  });

  test('transporter is called on flush if sessions were captured', () => {
    const transporter = makeTransporter();
    const flusher = new SessionFlusher(transporter, { release: '1.0.0', environment: 'dev' });
    const date = new Date('2021-04-08T12:18:23.043Z');

    _incrementSessionStatusCount(flusher, 'ok', date);
    _incrementSessionStatusCount(flusher, 'ok', date);

    expect(transporter).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(61000);

    expect(transporter).toHaveBeenCalledTimes(1);
    expect(transporter).toHaveBeenCalledWith(
      expect.objectContaining({
        attrs: { release: '1.0.0', environment: 'dev' },
        aggregates: [{ started: '2021-04-08T12:18:00.000Z', exited: 2 }],
      }),
    );
  });

  test('transporter is not called on flush if no sessions were captured', () => {
    const transporter = makeTransporter();

    const flusher = new SessionFlusher(transporter, { release: '1.0.0', environment: 'dev' });

    expect(transporter).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(61000);

    expect(transporter).toHaveBeenCalledTimes(1);
    expect(transporter).toHaveBeenCalledTimes(0);
  });

  test('calling close on SessionFlusher should disable SessionFlusher', () => {
    const transporter = makeTransporter();
    const flusher = new SessionFlusher(transporter, { release: '1.0.x' });

    closeSessionFlusher(flusher);

    expect(flusher.isEnabled).toEqual(false);
  });

  test('calling close on SessionFlusher will force call flush', () => {
    const transporter = makeTransporter();
    const flusher = new SessionFlusher(transporter, { release: '1.0.x' });
    const date = new Date('2021-04-08T12:18:23.043Z');

    // TODO: code-smell using internal function
    // why can we call the public API instead of the internal one?
    _incrementSessionStatusCount(flusher, 'ok', date);
    _incrementSessionStatusCount(flusher, 'ok', date);

    closeSessionFlusher(flusher);

    expect(flusher.isEnabled).toEqual(false);
    expect(flusher.pendingAggregates).toEqual({});
    expect(transporter).toHaveBeenCalledWith(
      expect.objectContaining({
        attrs: { release: '1.0.x' },
        aggregates: [{ started: '2021-04-08T12:18:00.000Z', exited: 2 }],
      }),
    );
  });
});
