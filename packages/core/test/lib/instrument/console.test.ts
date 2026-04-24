import { describe, expect, it, vi } from 'vitest';
import { addConsoleInstrumentationHandler } from '../../../src/instrument/console';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';

describe('addConsoleInstrumentationHandler', () => {
  it.each(['log', 'warn', 'error', 'debug', 'info'] as const)(
    'calls registered handler when console.%s is called',
    level => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      GLOBAL_OBJ.console[level]('test message');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['test message'], level }));
    },
  );

  it('calls through to the underlying console method without throwing', () => {
    addConsoleInstrumentationHandler(vi.fn());
    expect(() => GLOBAL_OBJ.console.log('hello')).not.toThrow();
  });
});
