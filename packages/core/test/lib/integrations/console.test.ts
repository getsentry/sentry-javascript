import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addBreadcrumb } from '../../../src/breadcrumbs';
import { addConsoleBreadcrumb } from '../../../src/integrations/console';

vi.mock('../../../src/breadcrumbs', () => ({
  addBreadcrumb: vi.fn(),
}));

describe('addConsoleBreadcrumb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a breadcrumb with correct properties for basic console log', () => {
    const level = 'log';
    const args = ['test message', 123];

    addConsoleBreadcrumb(level, args);

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'console',
        data: {
          arguments: args,
          logger: 'console',
        },
        level: 'log',
        message: 'test message 123',
      }),
      {
        input: args,
        level,
      },
    );
  });

  it.each(['debug', 'info', 'warn', 'error'] as const)('handles %s level correctly', level => {
    addConsoleBreadcrumb(level, ['test']);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: expect.any(String),
      }),
      expect.any(Object),
    );
  });

  it('skips breadcrumb for passed assertions', () => {
    addConsoleBreadcrumb('assert', [true, 'should not be captured']);
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('creates breadcrumb for failed assertions', () => {
    const args = [false, 'assertion failed', 'details'];

    addConsoleBreadcrumb('assert', args);

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Assertion failed'),
        data: {
          arguments: args.slice(1),
          logger: 'console',
        },
      }),
      {
        input: args,
        level: 'assert',
      },
    );
  });
});
