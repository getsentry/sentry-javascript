import { spawn } from 'child_process';
import { join } from 'path';
import type { Envelope, EnvelopeItemType, Event, SerializedSession } from '@sentry/types';

export function assertSentryEvent(actual: Event, expected: Event): void {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    ...expected,
  });
}

export function assertSentrySession(actual: SerializedSession, expected: Partial<SerializedSession>): void {
  expect(actual).toMatchObject({
    sid: expect.any(String),
    ...expected,
  });
}

type Expected =
  | {
      event: (event: Event) => void;
    }
  | {
      transaction: (event: Event) => void;
    }
  | {
      session: (event: SerializedSession) => void;
    };

/** */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createRunner(...paths: string[]) {
  const testPath = join(...paths);

  const expectedEnvelopes: Expected[] = [];
  const flags: string[] = [];
  const ignored: EnvelopeItemType[] = [];
  let hasExited = false;

  if (testPath.endsWith('.ts')) {
    flags.push('-r', 'ts-node/register');
  }

  return {
    expect: function (expected: Expected) {
      expectedEnvelopes.push(expected);
      return this;
    },
    withFlags: function (...args: string[]) {
      flags.push(...args);
      return this;
    },
    ignore: function (...types: EnvelopeItemType[]) {
      ignored.push(...types);
      return this;
    },
    start: function (done?: (e?: unknown) => void) {
      const expectedEnvelopeCount = expectedEnvelopes.length;
      let envelopeCount = 0;

      const child = spawn('node', [...flags, testPath]);

      child.on('close', () => {
        hasExited = true;
      });

      // Pass error to done to end the test quickly
      child.on('error', e => {
        done?.(e);
      });

      function checkDone(): void {
        envelopeCount++;
        if (envelopeCount === expectedEnvelopeCount) {
          child.kill();
          done?.();
        }
      }

      function tryParseLine(line: string): void {
        // Lines can have leading '[something] [{' which we need to remove
        const cleanedLine = line.replace(/^.*?] \[{"/, '[{"');

        if (!cleanedLine.startsWith('[{')) {
          return;
        }

        let envelope: Envelope | undefined;
        try {
          envelope = JSON.parse(cleanedLine) as Envelope;
        } catch (_) {
          //
        }

        if (!envelope) {
          return;
        }

        for (const item of envelope[1]) {
          const envelopeItemType = item[0].type;

          if (ignored.includes(envelopeItemType)) {
            continue;
          }

          const expected = expectedEnvelopes.shift();

          // Catch any error or failed assertions and pass them to done
          try {
            if (!expected) {
              throw new Error(`No more expected envelope items but we received a '${envelopeItemType}' item`);
            }

            const expectedType = Object.keys(expected)[0];

            if (expectedType !== envelopeItemType) {
              throw new Error(`Expected envelope item type '${expectedType}' but got '${envelopeItemType}'`);
            }

            if ('event' in expected) {
              expected.event(item[1] as Event);
              checkDone();
            }

            if ('transaction' in expected) {
              expected.transaction(item[1] as Event);
              checkDone();
            }

            if ('session' in expected) {
              expected.session(item[1] as SerializedSession);
              checkDone();
            }
          } catch (e) {
            done?.(e);
          }
        }
      }

      let buffer = Buffer.alloc(0);

      child.stdout.on('data', (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);

        let splitIndex = -1;
        while ((splitIndex = buffer.indexOf(0xa)) >= 0) {
          const line = buffer.subarray(0, splitIndex).toString();

          buffer = Buffer.from(buffer.subarray(splitIndex + 1));

          tryParseLine(line);
        }
      });

      return {
        childHasExited: function (): boolean {
          return hasExited;
        },
      };
    },
  };
}
