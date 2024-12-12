import type { Event, EventHint } from '../../../src/types-hoist';

import { applyZodErrorsToEvent } from '../../../src/integrations/zoderrors';

// Simplified type definition
interface ZodIssue {
  code: string;
  path: (string | number)[];
  expected?: string | number;
  received?: string | number;
  keys?: string[];
  message?: string;
}

class ZodError extends Error {
  issues: ZodIssue[] = [];

  // https://github.com/colinhacks/zod/blob/8910033b861c842df59919e7d45e7f51cf8b76a2/src/ZodError.ts#L199C1-L211C4
  constructor(issues: ZodIssue[]) {
    super();

    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      (this as any).__proto__ = actualProto;
    }

    this.name = 'ZodError';
    this.issues = issues;
  }

  get errors() {
    return this.issues;
  }

  static create = (issues: ZodIssue[]) => {
    const error = new ZodError(issues);
    return error;
  };
}

describe('applyZodErrorsToEvent()', () => {
  test('should not do anything if exception is not a ZodError', () => {
    const event: Event = {};
    const eventHint: EventHint = { originalException: new Error() };
    applyZodErrorsToEvent(100, event, eventHint);

    // no changes
    expect(event).toStrictEqual({});
  });

  test('should add ZodError issues to extras and format message', () => {
    const issues = [
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['names', 1],
        keys: ['extra'],
        message: 'Invalid input: expected string, received number',
      },
    ] satisfies ZodIssue[];
    const originalException = ZodError.create(issues);

    const event: Event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: originalException.message,
          },
        ],
      },
    };

    const eventHint: EventHint = { originalException };
    const processedEvent = applyZodErrorsToEvent(100, event, eventHint);

    expect(processedEvent.exception).toStrictEqual({
      values: [
        {
          type: 'Error',
          value: 'Failed to validate keys: names',
        },
      ],
    });

    expect(processedEvent.extra).toStrictEqual({
      'zoderror.issues': [
        {
          ...issues[0],
          path: issues[0]?.path.join('.'),
          keys: JSON.stringify(issues[0]?.keys),
          unionErrors: undefined,
        },
      ],
    });
  });
});
