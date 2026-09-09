import { describe, expect, it, vi } from 'vitest';
import { notifyEventProcessors } from '../../src/eventProcessors';
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
    const onDrop = vi.fn();

    const result = await notifyEventProcessors([() => null, later], { message: 'hello' }, {}, 0, onDrop);

    expect(result).toBeNull();
    expect(later).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith('event_processor');
  });

  it('stops and reports the drop when a processor returns undefined', async () => {
    const processor = (() => undefined) as unknown as EventProcessor;
    const later = vi.fn(event => event);
    const onDrop = vi.fn();

    const result = await notifyEventProcessors([processor, later], { message: 'hello' }, {}, 0, onDrop);

    expect(result).toBeNull();
    expect(later).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith('event_processor');
  });

  it('stops and reports the drop when a processor resolves undefined', async () => {
    const processor = (() => Promise.resolve(undefined)) as unknown as EventProcessor;
    const later = vi.fn(event => event);
    const onDrop = vi.fn();

    const result = await notifyEventProcessors([processor, later], { message: 'hello' }, {}, 0, onDrop);

    expect(result).toBeNull();
    expect(later).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith('event_processor');
  });

  it('resolves with `null` and reports a callback error when a processor throws synchronously', async () => {
    const debugErrorSpy = vi.spyOn(debugLoggerModule.debug, 'error');
    const error = new Error('boom');
    const throwing: EventProcessor = () => {
      throw error;
    };
    throwing.id = 'Throwing';
    const later = vi.fn(event => event);
    const onDrop = vi.fn();

    await expect(notifyEventProcessors([throwing, later], { message: 'hello' }, {}, 0, onDrop)).resolves.toBeNull();

    expect(later).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith('callback_error');
    expect(debugErrorSpy).toHaveBeenCalledWith('Event processor "Throwing" threw an error, dropping event:', error);
  });

  it('resolves with `null` and reports a callback error when a processor rejects', async () => {
    const debugErrorSpy = vi.spyOn(debugLoggerModule.debug, 'error');
    const error = new Error('boom');
    const later = vi.fn(event => event);
    const onDrop = vi.fn();

    await expect(
      notifyEventProcessors([() => Promise.reject(error), later], { message: 'hello' }, {}, 0, onDrop),
    ).resolves.toBeNull();

    expect(later).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith('callback_error');
    expect(debugErrorSpy).toHaveBeenCalledWith('Event processor "?" threw an error, dropping event:', error);
  });
});
