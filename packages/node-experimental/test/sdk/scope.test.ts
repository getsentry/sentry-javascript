import { Scope, getGlobalScope, prepareEvent } from '@sentry/core';
import type { Attachment, Breadcrumb, Client, ClientOptions, EventProcessor } from '@sentry/types';
import { getIsolationScope } from '../../src';
import { mockSdkInit } from '../helpers/mockSdkInit';

describe('Unit | Scope', () => {
  it('allows to create & update a scope', () => {
    const scope = new Scope();

    expect(scope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {},
      extra: {},
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });

    scope.update({
      tags: { foo: 'bar' },
      extra: { foo2: 'bar2' },
    });

    expect(scope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {
        foo: 'bar',
      },
      extra: {
        foo2: 'bar2',
      },
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });
  });

  it('allows to clone a scope', () => {
    const scope = new Scope();

    scope.update({
      tags: { foo: 'bar' },
      extra: { foo2: 'bar2' },
    });

    const newScope = scope.clone();
    expect(newScope).toBeInstanceOf(Scope);
    expect(newScope).not.toBe(scope);

    expect(newScope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {
        foo: 'bar',
      },
      extra: {
        foo2: 'bar2',
      },
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });
  });

  it('allows to set & get a client', () => {
    const scope = new Scope();
    expect(scope.getClient()).toBeUndefined();
    const client = {} as Client;
    scope.setClient(client);
    expect(scope.getClient()).toBe(client);
  });

  describe('prepareEvent', () => {
    it('works without any scope data', async () => {
      mockSdkInit();

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
        sdkProcessingMetadata: {},
      });
    });

    it('merges scope data', async () => {
      mockSdkInit();

      const breadcrumb1 = { message: '1', timestamp: 111 } as Breadcrumb;
      const breadcrumb2 = { message: '2', timestamp: 222 } as Breadcrumb;
      const breadcrumb3 = { message: '3', timestamp: 123 } as Breadcrumb;
      const breadcrumb4 = { message: '4', timestamp: 333 } as Breadcrumb;

      const eventProcessor1 = jest.fn((a: unknown) => a) as EventProcessor;
      const eventProcessor2 = jest.fn((b: unknown) => b) as EventProcessor;
      const eventProcessor3 = jest.fn((c: unknown) => c) as EventProcessor;

      const attachment1 = { filename: '1' } as Attachment;
      const attachment2 = { filename: '2' } as Attachment;
      const attachment3 = { filename: '3' } as Attachment;

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
      const isolationScope = getIsolationScope() as Scope;

      globalScope.addBreadcrumb(breadcrumb2);
      globalScope.addEventProcessor(eventProcessor2);
      globalScope.setSDKProcessingMetadata({ aa: 'aa' });
      globalScope.addAttachment(attachment2);

      isolationScope.addBreadcrumb(breadcrumb3);
      isolationScope.addEventProcessor(eventProcessor3);
      isolationScope.setSDKProcessingMetadata({ bb: 'bb' });
      isolationScope.addAttachment(attachment3);

      const event = { message: 'foo', breadcrumbs: [breadcrumb4], fingerprint: ['dd'] };

      const options = {} as ClientOptions;
      const processedEvent = await prepareEvent(
        options,
        event,
        {
          integrations: [],
        },
        scope,
        undefined,
        isolationScope,
      );

      expect(eventProcessor1).toHaveBeenCalledTimes(1);
      expect(eventProcessor2).toHaveBeenCalledTimes(1);
      expect(eventProcessor3).toHaveBeenCalledTimes(1);

      // Test that attachments are correctly merged
      expect(eventProcessor1).toHaveBeenCalledWith(processedEvent, {
        integrations: [],
        attachments: [attachment2, attachment3, attachment1],
      });

      expect(processedEvent).toEqual({
        timestamp: expect.any(Number),
        event_id: expect.any(String),
        environment: 'production',
        message: 'foo',
        user: { id: '1', email: 'test@example.com' },
        tags: { tag1: 'aa', tag2: 'aa' },
        extra: { extra1: 'aa', extra2: 'aa' },
        contexts: {
          os: { name: 'os1' },
          culture: { display_name: 'name1' },
        },
        fingerprint: ['dd', 'aa'],
        breadcrumbs: [breadcrumb4, breadcrumb2, breadcrumb3, breadcrumb1],
        sdkProcessingMetadata: {
          aa: 'aa',
          bb: 'bb',
        },
      });
    });
  });
});
