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
import { setAsyncLocalStorageAsyncContextStrategy } from '../../src/async-context';
import type { TypeSafeCallInfo } from '../../src/ai/typesafe';
import { instrumentTypeSafeClient } from '../../src/ai/typesafe';
import { typesafeIntegration } from '../../src/integrations/typesafe';
import { CHANNELS } from '../../src/orchestrion/channels';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

type Decide = (call: TypeSafeCallInfo) => boolean | undefined;

const RESULT = {
  model: 'jev-1',
  answers: { is_urgent: { type: 'noul', noul: 0.97 } },
  usage: { input_tokens: 10, output_tokens: 5 },
};

const request = (privacy: string): Record<string, unknown> => ({
  state: 'Help!',
  questions: { is_urgent: { type: 'noul', instructions: 'Urgent?' } },
  metadata: { privacy },
});

describe('TypeSafe per-call recording options', () => {
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

  const isPublic = (call: TypeSafeCallInfo): boolean =>
    (call.request as { metadata: { privacy: string } }).metadata.privacy === 'public';

  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@typesafe-ai/sdk'] };
    endedSpans = [];
    useClient();
    // The channel stays subscribed for the whole file, so each test swaps the decision functions.
    typesafeIntegration({
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

  function systemOne(params: Record<string, unknown>): unknown {
    return tracingChannel(CHANNELS.TYPESAFE_SYSTEM_ONE).traceSync(() => RESULT, { arguments: [params], self: {} });
  }

  it('decides for each call from its request', () => {
    const calls: TypeSafeCallInfo[] = [];
    decideInputs = call => {
      calls.push(call);
      return isPublic(call);
    };
    decideOutputs = isPublic;

    const publicRequest = request('public');
    systemOne(publicRequest);
    systemOne(request('private'));

    expect(calls[0]).toEqual({ request: publicRequest });
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
      systemOne(request(''));
    });
    await withScope(async scope => {
      scope.setTag('privacy', 'private');
      systemOne(request(''));
    });

    expect(endedSpans.map(recorded)).toEqual([
      { inputs: true, outputs: true },
      { inputs: false, outputs: false },
    ]);
  });

  it('decides inputs and outputs separately', () => {
    decideInputs = () => false;
    decideOutputs = () => true;

    systemOne(request(''));

    expect(endedSpans.map(recorded)).toEqual([{ inputs: false, outputs: true }]);
  });

  it('instrumentTypeSafeClient decides per call, once, and keeps the decision until the response', async () => {
    const recordOutputs = vi.fn(isPublic);
    const response = new Response(JSON.stringify(RESULT));
    const client = {
      systemOne: () => ({ asResponse: () => Promise.resolve(response.clone()) }),
    };
    const instrumented = instrumentTypeSafeClient(client, { recordInputs: isPublic, recordOutputs });

    instrumented.systemOne(request('public'));
    instrumented.systemOne(request('private'));
    await vi.waitFor(() => expect(endedSpans).toHaveLength(2));

    expect(recordOutputs).toHaveBeenCalledTimes(2);
    expect(endedSpans.map(recorded)).toEqual([
      { inputs: true, outputs: true },
      { inputs: false, outputs: false },
    ]);
  });
});
