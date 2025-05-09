import type { ReplayRecordingData, Transport } from '@sentry/core';
import { getClient } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import type { Mocked, MockedFunction } from 'vitest';
import { expect, vi } from 'vitest';
import type { ReplayContainer, Session } from '../src/types';

type MockTransport = MockedFunction<Transport['send']>;

vi.spyOn(SentryCore, 'isBrowser').mockImplementation(() => true);

type ReplayEventHeader = { type: 'replay_event' };
type RecordingHeader = { type: 'replay_recording'; length: number };
type RecordingPayloadHeader = Record<string, unknown>;
export type SentReplayExpected = {
  envelopeHeader?: SentryCore.BaseEnvelopeHeaders;
  replayEventHeader?: ReplayEventHeader;
  replayEventPayload?: SentryCore.ReplayEvent;
  recordingHeader?: RecordingHeader;
  recordingPayloadHeader?: RecordingPayloadHeader;
  recordingData?: ReplayRecordingData;
};

expect.extend({
  toHaveSameSession(received: Mocked<ReplayContainer>, expected: Session | undefined) {
    return {
      pass: this.equals(received.session?.id, expected?.id),
      message: () =>
        this.utils.matcherHint('toHaveSameSession', undefined, undefined, {
          isNot: this.isNot,
          promise: this.promise,
        }),
      actual: received.session,
      expected,
    };
  },

  toHaveLastSentReplay(_received, expected?: SentReplayExpected) {
    const { calls } = (getClient()?.getTransport()?.send as MockTransport).mock;
    const lastSentReplayEnvelope = getLastSentReplayEnvelope(calls);

    const actual = getActual(lastSentReplayEnvelope);
    const hasAnyLastSentReplay = !!lastSentReplayEnvelope;

    const { isNot } = this;

    // We only want to check if _something_ was sent
    if (!expected) {
      return {
        pass: hasAnyLastSentReplay,
        message: () =>
          isNot
            ? 'Expected Replay to not have been sent, but a request was attempted'
            : 'Expected Replay to have last been sent, but a request was not attempted',
        expected: undefined,
        actual,
      };
    }

    // Only include expected values in actual object
    Object.keys(actual).forEach(key => {
      if (!(key in expected)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete actual[key as keyof SentReplayExpected];
      }
    });

    const getMessage = (key?: string) => () => {
      if (isNot && hasAnyLastSentReplay) {
        return 'Expected Replay to not have been sent, but a request was attempted';
      }

      if (!isNot && !hasAnyLastSentReplay) {
        return 'Expected Replay to have last been sent, but a request was not attempted';
      }

      return key
        ? `Last sent replay did not match the expected values for "${key}".`
        : 'Last sent replay did not match the expected values.';
    };

    // eslint-disable-next-line guard-for-in
    for (const k in expected) {
      const expectedValue = expected[k as keyof SentReplayExpected];
      const actualValue = actual[k as keyof SentReplayExpected];

      const pass = this.equals(actualValue, expectedValue);

      if (!pass) {
        return {
          pass,
          message: getMessage(k),
          expected: expectedValue,
          actual: actualValue,
        };
      }
    }

    return {
      pass: this.equals(actual, expected),
      message: getMessage(),
      expected,
      actual,
    };
  },
});

function getLastSentReplayEnvelope(calls: MockTransport['mock']['calls']) {
  for (let i = calls.length - 1; i >= 0; i--) {
    const envelope = calls[i]![0] as SentryCore.ReplayEnvelope;

    if (!mayBeReplayEnvelope(envelope)) {
      continue;
    }

    const envelopeItems = envelope[1];
    const replayEventItem = envelopeItems[0];
    const replayEventItemHeaders = replayEventItem[0];

    if (replayEventItemHeaders.type === 'replay_event') {
      return envelope;
    }
  }

  return undefined;
}

function mayBeReplayEnvelope(envelope: SentryCore.Envelope): envelope is SentryCore.ReplayEnvelope {
  // Replay envelopes have 2 items
  if (envelope.length !== 2) {
    return false;
  }

  const envelopeItems = envelope[1];

  // Replay envelope items have 2 items
  if (envelopeItems.length !== 2) {
    return false;
  }

  return true;
}

function getActual(call: SentryCore.ReplayEnvelope | undefined): SentReplayExpected {
  if (!call) {
    return {};
  }

  const envelopeHeader = call[0];
  const envelopeItems = call[1] || [[], []];
  const [[replayEventHeader, replayEventPayload], [recordingHeader, recordingPayload] = []] = envelopeItems;

  // @ts-expect-error recordingPayload is always a string in our tests
  const [recordingPayloadHeader, recordingData] = recordingPayload?.split('\n') || [];

  return {
    envelopeHeader,
    replayEventHeader,
    replayEventPayload,
    recordingHeader,
    recordingPayloadHeader: recordingPayloadHeader && JSON.parse(recordingPayloadHeader),
    recordingData,
  } satisfies SentReplayExpected;
}
