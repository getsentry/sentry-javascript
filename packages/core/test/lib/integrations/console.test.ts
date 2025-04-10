import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureConsoleBreadcrumb } from '../../../src/integrations/console';
import { addBreadcrumb } from '../../../src/breadcrumbs';

vi.mock('../../../src/breadcrumbs', () => ({
  addBreadcrumb: vi.fn(),
}));

describe('captureConsoleBreadcrumb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a breadcrumb with correct properties for basic console log', () => {
    const level = 'log';
    const args = ['test message', 123];

    captureConsoleBreadcrumb(level, args);

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

  it('handles different console levels correctly', () => {
    const levels = ['debug', 'info', 'warn', 'error'] as const;

    levels.forEach(level => {
      captureConsoleBreadcrumb(level, ['test']);
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          level: expect.any(String),
        }),
        expect.any(Object),
      );
    });
  });

  it('skips breadcrumb for passed assertions', () => {
    captureConsoleBreadcrumb('assert', [true, 'should not be captured']);
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('creates breadcrumb for failed assertions', () => {
    const args = [false, 'assertion failed', 'details'];

    captureConsoleBreadcrumb('assert', args);

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
