import { describe, expect, it, vi } from 'vitest';
import { notifyEventProcessors } from '../../src/eventProcessors';
import { CALLBACK_ERROR } from '../../src/utils/safeCallback';
import type { EventProcessor } from '../../src/types/eventprocessor';
import * as debugLoggerModule from '../../src/utils/debug-logger';

describe('notifyEventProcessors', () => {
  it('passes the event through all processors', async () => {
    const processors: EventProcessor[] = [
      event => ({ ...event, tags: { first: 'yes' } }),
      async event => ({ ...event, tags: { ...event.tags, second: 'yes' } }),
    ];

    const result = await notifyEventProcessors(processors, { message: 'hello' }, {});

    expect(result).toEqual({ message: 'hello', tags: { first: 'yes', second: 'yes' } });
  });

  it('stops when a processor returns null', async () => {
    const later = vi.fn(event => event);

    const result = await notifyEventProcessors([() => null, later], { message: 'hello' }, {});

    expect(result).toBeNull();
    expect(later).not.toHaveBeenCalled();
  });

  it('rejects with `CALLBACK_ERROR` when a processor throws synchronously', async () => {
    const debugErrorSpy = vi.spyOn(debugLoggerModule.debug, 'error');
    const error = new Error('boom');
    const throwing: EventProcessor = () => {
      throw error;
    };
    throwing.id = 'Throwing';
    const later = vi.fn(event => event);

    await expect(notifyEventProcessors([throwing, later], { message: 'hello' }, {})).rejects.toBe(CALLBACK_ERROR);

    expect(later).not.toHaveBeenCalled();
    expect(debugErrorSpy).toHaveBeenCalledWith('Event processor "Throwing" threw an error, dropping event:', error);
  });

  it('rejects with `CALLBACK_ERROR` when a processor rejects', async () => {
    const debugErrorSpy = vi.spyOn(debugLoggerModule.debug, 'error');
    const error = new Error('boom');
    const later = vi.fn(event => event);

    await expect(notifyEventProcessors([() => Promise.reject(error), later], { message: 'hello' }, {})).rejects.toBe(
      CALLBACK_ERROR,
    );

    expect(later).not.toHaveBeenCalled();
    expect(debugErrorSpy).toHaveBeenCalledWith('Event processor "?" threw an error, dropping event:', error);
  });
});
