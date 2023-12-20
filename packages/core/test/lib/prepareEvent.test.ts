import type {
  Attachment,
  Breadcrumb,
  Client,
  ClientOptions,
  Event,
  EventHint,
  EventProcessor,
  ScopeContext,
} from '@sentry/types';
import { GLOBAL_OBJ, createStackParser } from '@sentry/utils';
import { clearGlobalData } from '../../src';

import { Scope, getGlobalScope } from '../../src/scope';
import {
  applyDebugIds,
  applyDebugMeta,
  parseEventHintOrCaptureContext,
  prepareEvent,
} from '../../src/utils/prepareEvent';

describe('applyDebugIds', () => {
  afterEach(() => {
    GLOBAL_OBJ._sentryDebugIds = undefined;
  });

  it("should put debug IDs into an event's stack frames", () => {
    GLOBAL_OBJ._sentryDebugIds = {
      'filename1.js\nfilename1.js': 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
      'filename2.js\nfilename2.js': 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
      'filename4.js\nfilename4.js': 'cccccccc-cccc-4ccc-cccc-cccccccccc',
    };

    const stackParser = createStackParser([0, line => ({ filename: line })]);

    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'filename1.js' },
                { filename: 'filename2.js' },
                { filename: 'filename1.js' },
                { filename: 'filename3.js' },
              ],
            },
          },
        ],
      },
    };

    applyDebugIds(event, stackParser);

    expect(event.exception?.values?.[0].stacktrace?.frames).toContainEqual({
      filename: 'filename1.js',
      debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
    });

    expect(event.exception?.values?.[0].stacktrace?.frames).toContainEqual({
      filename: 'filename2.js',
      debug_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
    });

    // expect not to contain an image for the stack frame that doesn't have a corresponding debug id
    expect(event.exception?.values?.[0].stacktrace?.frames).not.toContainEqual(
      expect.objectContaining({
        filename3: 'filename3.js',
        debug_id: expect.any(String),
      }),
    );

    // expect not to contain an image for the debug id mapping that isn't contained in the stack trace
    expect(event.exception?.values?.[0].stacktrace?.frames).not.toContainEqual(
      expect.objectContaining({
        filename3: 'filename4.js',
        debug_id: 'cccccccc-cccc-4ccc-cccc-cccccccccc',
      }),
    );
  });
});

describe('applyDebugMeta', () => {
  it("should move the debug IDs inside an event's stack frame into the debug_meta field", () => {
    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'filename1.js', debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' },
                { filename: 'filename2.js', debug_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb' },
                { filename: 'filename1.js', debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' },
                { filename: 'filename3.js' },
              ],
            },
          },
        ],
      },
    };

    applyDebugMeta(event);

    expect(event.exception?.values?.[0].stacktrace?.frames).toEqual([
      { filename: 'filename1.js' },
      { filename: 'filename2.js' },
      { filename: 'filename1.js' },
      { filename: 'filename3.js' },
    ]);

    expect(event.debug_meta?.images).toContainEqual({
      type: 'sourcemap',
      code_file: 'filename1.js',
      debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
    });

    expect(event.debug_meta?.images).toContainEqual({
      type: 'sourcemap',
      code_file: 'filename2.js',
      debug_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
    });
  });
});

describe('parseEventHintOrCaptureContext', () => {
  it('works with undefined', () => {
    const actual = parseEventHintOrCaptureContext(undefined);
    expect(actual).toEqual(undefined);
  });

  it('works with an empty object', () => {
    const actual = parseEventHintOrCaptureContext({});
    expect(actual).toEqual({});
  });

  it('works with a Scope', () => {
    const scope = new Scope();
    const actual = parseEventHintOrCaptureContext(scope);
    expect(actual).toEqual({ captureContext: scope });
  });

  it('works with a function', () => {
    const scope = () => new Scope();
    const actual = parseEventHintOrCaptureContext(scope);
    expect(actual).toEqual({ captureContext: scope });
  });

  it('works with an EventHint', () => {
    const hint: EventHint = {
      mechanism: { handled: false },
    };
    const actual = parseEventHintOrCaptureContext(hint);
    expect(actual).toEqual(hint);
  });

  it('works with a ScopeContext', () => {
    const scopeContext: ScopeContext = {
      user: { id: 'xxx' },
      level: 'debug',
      extra: { foo: 'bar' },
      contexts: { os: { name: 'linux' } },
      tags: { foo: 'bar' },
      fingerprint: ['xx', 'yy'],
      requestSession: { status: 'ok' },
      propagationContext: {
        traceId: 'xxx',
        spanId: 'yyy',
      },
    };

    const actual = parseEventHintOrCaptureContext(scopeContext);
    expect(actual).toEqual({ captureContext: scopeContext });
  });

  it('triggers a TS error if trying to mix ScopeContext & EventHint', () => {
    const actual = parseEventHintOrCaptureContext({
      // @ts-expect-error We are specifically testing that this errors!
      user: { id: 'xxx' },
      mechanism: { handled: false },
    });

    // ScopeContext takes presedence in this case, but this is actually not supported
    expect(actual).toEqual({
      captureContext: {
        user: { id: 'xxx' },
        mechanism: { handled: false },
      },
    });
  });
});

describe('prepareEvent', () => {
  beforeEach(() => {
    clearGlobalData();
  });

  it('works without any scope data', async () => {
    const eventProcessor = jest.fn((a: unknown) => a) as EventProcessor;

    const scope = new Scope();

    const event = { message: 'foo' };

    const options = {} as ClientOptions;
    const client = {
      getEventProcessors() {
        return [eventProcessor];
      },
    } as Client;
    const processedEvent = await prepareEvent(
      options,
      event,
      {
        integrations: [],
      },
      scope,
      client,
    );

    expect(eventProcessor).toHaveBeenCalledWith(processedEvent, {
      integrations: [],
      // no attachments are added to hint
    });

    expect(processedEvent).toEqual({
      timestamp: expect.any(Number),
      event_id: expect.any(String),
      environment: 'production',
      message: 'foo',
      sdkProcessingMetadata: {
        propagationContext: {
          spanId: expect.any(String),
          traceId: expect.any(String),
        },
      },
    });
  });

  it('merges scope data', async () => {
    const breadcrumb1 = { message: '1', timestamp: 111 } as Breadcrumb;
    const breadcrumb2 = { message: '2', timestamp: 222 } as Breadcrumb;
    const breadcrumb3 = { message: '3', timestamp: 123 } as Breadcrumb;

    const eventProcessor1 = jest.fn((a: unknown) => a) as EventProcessor;
    const eventProcessor2 = jest.fn((b: unknown) => b) as EventProcessor;

    const attachment1 = { filename: '1' } as Attachment;
    const attachment2 = { filename: '2' } as Attachment;

    const scope = new Scope();
    scope.update({
      user: { id: '1', email: 'test@example.com' },
      tags: { tag1: 'aa', tag2: 'aa' },
      extra: { extra1: 'aa', extra2: 'aa' },
      contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
      propagationContext: { spanId: '1', traceId: '1' },
      fingerprint: ['aa'],
    });
    scope.addBreadcrumb(breadcrumb1);
    scope.addEventProcessor(eventProcessor1);
    scope.addAttachment(attachment1);

    const globalScope = getGlobalScope();

    globalScope.addBreadcrumb(breadcrumb2);
    globalScope.addEventProcessor(eventProcessor2);
    globalScope.setSDKProcessingMetadata({ aa: 'aa' });
    globalScope.addAttachment(attachment2);

    const event = { message: 'foo', breadcrumbs: [breadcrumb3], fingerprint: ['dd'] };

    const options = {} as ClientOptions;
    const processedEvent = await prepareEvent(
      options,
      event,
      {
        integrations: [],
      },
      scope,
    );

    expect(eventProcessor1).toHaveBeenCalledTimes(1);
    expect(eventProcessor2).toHaveBeenCalledTimes(1);

    // Test that attachments are correctly merged
    expect(eventProcessor1).toHaveBeenCalledWith(processedEvent, {
      integrations: [],
      attachments: [attachment2, attachment1],
    });

    expect(processedEvent).toEqual({
      timestamp: expect.any(Number),
      event_id: expect.any(String),
      environment: 'production',
      message: 'foo',
      user: { id: '1', email: 'test@example.com' },
      tags: { tag1: 'aa', tag2: 'aa' },
      extra: { extra1: 'aa', extra2: 'aa' },
      contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
      fingerprint: ['dd', 'aa'],
      breadcrumbs: [breadcrumb3, breadcrumb2, breadcrumb1],
      sdkProcessingMetadata: {
        aa: 'aa',
        propagationContext: {
          spanId: '1',
          traceId: '1',
        },
      },
    });
  });

  it('works without a scope', async () => {
    const breadcrumb1 = { message: '1', timestamp: 111 } as Breadcrumb;
    const breadcrumb2 = { message: '2', timestamp: 222 } as Breadcrumb;

    const eventProcessor1 = jest.fn((a: unknown) => a) as EventProcessor;

    const attachment1 = { filename: '1' } as Attachment;
    const attachment2 = { filename: '2' } as Attachment;

    const globalScope = getGlobalScope();

    globalScope.addBreadcrumb(breadcrumb1);
    globalScope.addEventProcessor(eventProcessor1);
    globalScope.setSDKProcessingMetadata({ aa: 'aa' });
    globalScope.addAttachment(attachment1);

    const event = { message: 'foo', breadcrumbs: [breadcrumb2], fingerprint: ['dd'] };

    const options = {} as ClientOptions;
    const processedEvent = await prepareEvent(options, event, {
      integrations: [],
      attachments: [attachment2],
    });

    expect(eventProcessor1).toHaveBeenCalledTimes(1);

    // Test that attachments are correctly merged
    expect(eventProcessor1).toHaveBeenCalledWith(processedEvent, {
      integrations: [],
      attachments: [attachment2, attachment1],
    });

    expect(processedEvent).toEqual({
      timestamp: expect.any(Number),
      event_id: expect.any(String),
      environment: 'production',
      message: 'foo',
      fingerprint: ['dd'],
      breadcrumbs: [breadcrumb2, breadcrumb1],
      sdkProcessingMetadata: {
        aa: 'aa',
        propagationContext: globalScope.getPropagationContext(),
      },
    });
  });
});
