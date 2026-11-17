import { tracingChannel } from 'node:diagnostics_channel';
import type { Span } from '@sentry/core';
import {
  getCurrentScope,
  GLOBAL_OBJ,
  setAsyncContextStrategy,
  setCurrentClient,
  spanToJSON,
  withScope,
} from '@sentry/core';
import { GEN_AI_INPUT_MESSAGES, GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPiAiRecordingOptions } from '../../src/ai/pi-ai/recording';
import type { PiAiCallInfo, PiEventStream } from '../../src/ai/pi-ai/types';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../src/async-context';
import { piAiIntegration } from '../../src/integrations/pi-ai';
import { CHANNELS } from '../../src/orchestrion/channels';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

type Decide = (call: PiAiCallInfo) => boolean | undefined;

const MODEL = { id: 'faux-model', provider: 'faux' };
const ANSWER = { role: 'assistant', content: [{ type: 'text', text: 'Paris.' }], stopReason: 'stop' };

const streamChannel = tracingChannel(CHANNELS.PI_AI_STREAM);
const completeChannel = tracingChannel(CHANNELS.PI_AI_COMPLETE);

function complete(...args: unknown[]): Promise<unknown> {
  return completeChannel.tracePromise(async () => ANSWER, { arguments: args });
}

const context = (privacy: string): Record<string, unknown> => ({
  messages: [{ role: 'user', content: 'Capital of France?' }],
  privacy,
});

describe('piAiIntegration per-call recording options', () => {
  let endedSpans: Span[];
  let decideInputs: Decide;
  let decideOutputs: Decide;

  function useClient(): void {
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    client.on('spanEnd', span => endedSpans.push(span));
  }

  function recorded(span: Span): { inputs: boolean; outputs: boolean } {
    const { attributes } = spanToJSON(span);
    return { inputs: GEN_AI_INPUT_MESSAGES in attributes, outputs: GEN_AI_OUTPUT_MESSAGES in attributes };
  }

  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@earendil-works/pi-ai'] };
    endedSpans = [];
    useClient();
    // The channels stay subscribed for the whole file, so each test swaps the decision functions.
    piAiIntegration({
      recordInputs: call => decideInputs(call),
      recordOutputs: call => decideOutputs(call),
    }).setup!(getCurrentScope().getClient()!);
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  beforeEach(() => {
    endedSpans = [];
    decideInputs = () => true;
    decideOutputs = () => true;
    useClient();
  });

  it('decides for each call from the arguments of the request', async () => {
    const calls: PiAiCallInfo[] = [];
    decideInputs = call => {
      calls.push(call);
      return (call.context as { privacy?: string }).privacy === 'public';
    };
    decideOutputs = decideInputs;

    const options = { temperature: 0.2 };
    await complete(MODEL, context('public'), options);
    await complete(MODEL, context('private'));

    expect(calls[0]).toEqual({ model: MODEL, context: context('public'), options });
    expect(endedSpans.map(recorded)).toEqual([
      { inputs: true, outputs: true },
      { inputs: false, outputs: false },
    ]);
  });

  it("runs the functions in the caller's async context", async () => {
    decideInputs = () => getCurrentScope().getScopeData().tags.privacy === 'public';
    decideOutputs = decideInputs;

    await withScope(async scope => {
      scope.setTag('privacy', 'public');
      await complete(MODEL, context(''));
    });
    await withScope(async scope => {
      scope.setTag('privacy', 'private');
      await complete(MODEL, context(''));
    });

    expect(endedSpans.map(recorded)).toEqual([
      { inputs: true, outputs: true },
      { inputs: false, outputs: false },
    ]);
  });

  it('decides inputs and outputs separately', async () => {
    decideInputs = () => false;
    decideOutputs = () => true;

    await complete(MODEL, context(''));

    expect(endedSpans.map(recorded)).toEqual([{ inputs: false, outputs: true }]);
  });

  it('records the response of a streamed request as decided when it started', async () => {
    // Only the first call says yes, so a second decision at end time would drop the response.
    const decide = vi.fn<Decide>().mockReturnValueOnce(true).mockReturnValue(false);
    decideOutputs = decide;
    let settle!: (message: unknown) => void;
    const result = new Promise(resolve => (settle = resolve));

    const events = streamChannel.traceSync(() => ({ result: () => result }), {
      arguments: [MODEL, context('')],
    }) as PiEventStream;
    settle(ANSWER);
    await events.result();

    expect(decide).toHaveBeenCalledTimes(1);
    expect(endedSpans.map(recorded)).toEqual([{ inputs: true, outputs: true }]);
  });

  describe('with the options of an integration driving pi-ai', () => {
    it('calls the driver function with its own call info, once per request', async () => {
      const driver = vi.fn(() => undefined);

      await withScope(async scope => {
        setPiAiRecordingOptions(scope, { recordInputs: driver }, { agent: 'a' });
        await complete(MODEL, context(''));
        await complete(MODEL, context(''));
      });

      expect(driver).toHaveBeenCalledTimes(2);
      expect(driver).toHaveBeenCalledWith({ agent: 'a' });
    });

    it.each([
      // driver, piAiIntegration, expected
      [undefined, true, true],
      [undefined, false, false],
      [true, undefined, true],
      [false, undefined, false],
      [true, false, false],
      [false, true, false],
      [true, true, true],
    ])('resolves driver %s and pi-ai %s to %s', async (driver, piAi, expected) => {
      decideInputs = () => piAi;
      decideOutputs = decideInputs;

      await withScope(async scope => {
        setPiAiRecordingOptions(scope, { recordInputs: () => driver, recordOutputs: () => driver }, {});
        await complete(MODEL, context(''));
      });

      expect(endedSpans.map(recorded)).toEqual([{ inputs: expected, outputs: expected }]);
    });
  });
});
