import { describe, expect, it, vi } from 'vitest';
import type { ScopeData } from '../../../src';
import { Scope, startInactiveSpan } from '../../../src';
import * as currentScopes from '../../../src/currentScopes';
import type { Attachment } from '../../../src/types-hoist/attachment';
import type { Breadcrumb } from '../../../src/types-hoist/breadcrumb';
import type { Event, EventType } from '../../../src/types-hoist/event';
import type { EventProcessor } from '../../../src/types-hoist/eventprocessor';
import {
  applyScopeDataToEvent,
  getCombinedScopeData,
  mergeAndOverwriteScopeData,
  mergeArray,
  mergeScopeData,
} from '../../../src/utils/scopeData';

describe('mergeArray', () => {
  it.each([
    [[], [], undefined],
    [undefined, [], undefined],
    [['a'], [], ['a']],
    [['a'], ['b', 'c'], ['a', 'b', 'c']],
    [[], ['b', 'c'], ['b', 'c']],
    [undefined, ['b', 'c'], ['b', 'c']],
  ])('works with %s and %s', (a, b, expected) => {
    const data = { fingerprint: a };
    mergeArray(data, 'fingerprint', b);
    expect(data.fingerprint).toEqual(expected);
  });

  it('does not mutate the original array if no changes are made', () => {
    const fingerprint = ['a'];
    const data = { fingerprint };
    mergeArray(data, 'fingerprint', []);
    expect(data.fingerprint).toBe(fingerprint);
  });
});

describe('mergeAndOverwriteScopeData', () => {
  it.each([
    [{}, {}, {}],
    [{ a: 'aa' }, {}, { a: 'aa' }],
    [{ a: 'aa' }, { b: 'bb' }, { a: 'aa', b: 'bb' }],
    // overwrites existing keys
    [{ a: 'aa' }, { b: 'bb', a: 'cc' }, { a: 'cc', b: 'bb' }],
    // undefined values overwrite existing values
    [{ a: 'defined' }, { a: undefined, b: 'defined' }, { a: undefined, b: 'defined' }],
    [{ a: 'defined' }, { a: null, b: 'defined' }, { a: null, b: 'defined' }],
  ])('works with %s and %s', (oldData, newData, expected) => {
    const data = { tags: oldData } as unknown as ScopeData;
    mergeAndOverwriteScopeData(data, 'tags', newData);
    expect(data.tags).toEqual(expected);
  });

  it('does not deep merge', () => {
    const data = {
      contexts: {
        app: { app_version: 'v1' },
        culture: { display_name: 'name1' },
      },
    } as unknown as ScopeData;
    mergeAndOverwriteScopeData(data, 'contexts', {
      os: { name: 'os1' },
      app: { app_name: 'name1' },
    });
    expect(data.contexts).toEqual({
      os: { name: 'os1' },
      culture: { display_name: 'name1' },
      app: { app_name: 'name1' },
    });
  });

  it('does not mutate the original object if no changes are made', () => {
    const tags = { a: 'aa' };
    const data = { tags } as unknown as ScopeData;
    mergeAndOverwriteScopeData(data, 'tags', {});
    expect(data.tags).toBe(tags);
  });
});

describe('mergeScopeData', () => {
  it('works with empty data', () => {
    const data1: ScopeData = {
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      attributes: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { traceId: '1', sampleRand: 0.42 },
      sdkProcessingMetadata: {},
      fingerprint: [],
    };
    const data2: ScopeData = {
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      attributes: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { traceId: '1', sampleRand: 0.42 },
      sdkProcessingMetadata: {},
      fingerprint: [],
    };
    mergeScopeData(data1, data2);
    expect(data1).toEqual({
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      attributes: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { traceId: '1', sampleRand: 0.42 },
      sdkProcessingMetadata: {},
      fingerprint: [],
    });
  });

  it('merges data correctly', () => {
    const attachment1 = { filename: '1' } as Attachment;
    const attachment2 = { filename: '2' } as Attachment;
    const attachment3 = { filename: '3' } as Attachment;

    const breadcrumb1 = { message: '1' } as Breadcrumb;
    const breadcrumb2 = { message: '2' } as Breadcrumb;
    const breadcrumb3 = { message: '3' } as Breadcrumb;

    const eventProcessor1 = (() => null) as EventProcessor;
    const eventProcessor2 = (() => null) as EventProcessor;
    const eventProcessor3 = (() => null) as EventProcessor;

    const data1: ScopeData = {
      eventProcessors: [eventProcessor1],
      breadcrumbs: [breadcrumb1],
      user: { id: '1', email: 'test@example.com' },
      tags: { tag1: 'aa', tag2: 'aa' },
      attributes: { attr1: { value: 'value1', type: 'string' }, attr2: { value: 123, type: 'integer' } },
      extra: { extra1: 'aa', extra2: 'aa' },
      contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
      attachments: [attachment1],
      propagationContext: { traceId: '1', sampleRand: 0.42 },
      sdkProcessingMetadata: {
        aa: 'aa',
        bb: 'aa',
        obj: { key: 'value' },
        normalizedRequest: {
          url: 'oldUrl',
          method: 'oldMethod',
        },
      },
      fingerprint: ['aa', 'bb'],
    };
    const data2: ScopeData = {
      eventProcessors: [eventProcessor2, eventProcessor3],
      breadcrumbs: [breadcrumb2, breadcrumb3],
      user: { id: '2', name: 'foo' },
      tags: { tag2: 'bb', tag3: 'bb' },
      attributes: { attr2: { value: 456, type: 'integer' }, attr3: { value: 'value3', type: 'string' } },
      extra: { extra2: 'bb', extra3: 'bb' },
      contexts: { os: { name: 'os2' } },
      attachments: [attachment2, attachment3],
      propagationContext: { traceId: '2', sampleRand: 0.42 },
      sdkProcessingMetadata: {
        bb: 'bb',
        cc: 'bb',
        obj: { key2: 'value2' },
        normalizedRequest: {
          url: 'newUrl',
          headers: {},
        },
      },
      fingerprint: ['cc'],
    };
    mergeScopeData(data1, data2);
    expect(data1).toEqual({
      eventProcessors: [eventProcessor1, eventProcessor2, eventProcessor3],
      breadcrumbs: [breadcrumb1, breadcrumb2, breadcrumb3],
      user: { id: '2', name: 'foo', email: 'test@example.com' },
      tags: { tag1: 'aa', tag2: 'bb', tag3: 'bb' },
      attributes: {
        attr1: { value: 'value1', type: 'string' },
        attr2: { value: 456, type: 'integer' },
        attr3: { value: 'value3', type: 'string' },
      },
      extra: { extra1: 'aa', extra2: 'bb', extra3: 'bb' },
      contexts: { os: { name: 'os2' }, culture: { display_name: 'name1' } },
      attachments: [attachment1, attachment2, attachment3],
      propagationContext: { traceId: '2', sampleRand: 0.42 },
      sdkProcessingMetadata: {
        aa: 'aa',
        bb: 'bb',
        cc: 'bb',
        obj: { key: 'value', key2: 'value2' },
        normalizedRequest: {
          url: 'newUrl',
          method: 'oldMethod',
          headers: {},
        },
      },
      fingerprint: ['aa', 'bb', 'cc'],
    });
  });
});

describe('applyScopeDataToEvent', () => {
  it('should correctly merge nested event and scope data with undefined values', () => {
    const eventData: Event = {
      user: {
        name: 'John',
        age: undefined,
        location: 'New York',
        newThing: undefined,
      },
      extra: {},
    };

    const scopeData: ScopeData = {
      eventProcessors: [],
      breadcrumbs: [],
      user: {
        name: 'John',
        age: 30,
        location: 'Vienna',
        role: 'developer',
        thing: undefined,
      },
      tags: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { traceId: '1', sampleRand: 0.42 },
      sdkProcessingMetadata: {},
      fingerprint: [],
    };

    applyScopeDataToEvent(eventData, scopeData);

    // Verify merged data structure
    expect(eventData).toEqual({
      user: {
        name: 'John',
        age: undefined,
        location: 'New York',
        role: 'developer',
        thing: undefined,
        newThing: undefined,
      },
      extra: {},
      breadcrumbs: undefined,
      sdkProcessingMetadata: {},
    });
  });

  it("doesn't apply scope.transactionName to transaction events", () => {
    const data: ScopeData = {
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { traceId: '1', sampleRand: 0.42 },
      sdkProcessingMetadata: {},
      fingerprint: [],
      transactionName: 'foo',
    };
    const event: Event = { type: 'transaction', transaction: '/users/:id' };

    applyScopeDataToEvent(event, data);

    expect(event.transaction).toBe('/users/:id');
  });

  it('applies the root span name to transaction events', () => {
    const data: ScopeData = {
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { traceId: '1', sampleRand: 0.42 },
      sdkProcessingMetadata: {},
      fingerprint: [],
      transactionName: 'foo',
      span: {
        attributes: {},
        startTime: 1,
        endTime: 2,
        status: 'ok',
        name: 'bar',
        // @ts-expect-error - we don't need to provide all span context fields
        spanContext: () => ({}),
      },
    };

    const event: Event = { type: 'transaction' };

    applyScopeDataToEvent(event, data);

    expect(event.transaction).toBe('bar');
  });

  it("doesn't apply the root span name to non-transaction events", () => {
    const data: ScopeData = {
      eventProcessors: [],
      breadcrumbs: [],
      user: {},
      tags: {},
      extra: {},
      contexts: {},
      attachments: [],
      propagationContext: { traceId: '1', sampleRand: 0.42 },
      sdkProcessingMetadata: {},
      fingerprint: [],
      transactionName: '/users/:id',
      span: startInactiveSpan({ name: 'foo' }),
    };
    const event: Event = { type: undefined };

    applyScopeDataToEvent(event, data);

    expect(event.transaction).toBe('/users/:id');
  });

  it.each([undefined, 'profile', 'replay_event', 'feedback'])(
    'applies scope.transactionName to event with type %s',
    type => {
      const data: ScopeData = {
        eventProcessors: [],
        breadcrumbs: [],
        user: {},
        tags: {},
        extra: {},
        contexts: {},
        attachments: [],
        propagationContext: { traceId: '1', sampleRand: 0.42 },
        sdkProcessingMetadata: {},
        fingerprint: [],
        transactionName: 'foo',
      };
      const event: Event = { type: type as EventType, transaction: '/users/:id' };

      applyScopeDataToEvent(event, data);

      expect(event.transaction).toBe('foo');
    },
  );
});

describe('getCombinedScopeData', () => {
  const globalScope = new Scope();
  const isolationScope = new Scope();
  const currentScope = new Scope();

  it('returns the combined scope data with correct precedence', () => {
    globalScope.setTag('foo', 'bar');
    globalScope.setTag('dogs', 'boring');
    globalScope.setTag('global', 'global');

    isolationScope.setTag('dogs', 'great');
    isolationScope.setTag('foo', 'nope');
    isolationScope.setTag('isolation', 'isolation');

    currentScope.setTag('foo', 'baz');
    currentScope.setTag('current', 'current');

    vi.spyOn(currentScopes, 'getGlobalScope').mockReturnValue(globalScope);

    expect(getCombinedScopeData(isolationScope, currentScope)).toEqual({
      attachments: [],
      attributes: {},
      breadcrumbs: [],
      contexts: {},
      eventProcessors: [],
      extra: {},
      fingerprint: [],
      level: undefined,
      propagationContext: {
        sampleRand: expect.any(Number),
        traceId: expect.any(String),
      },
      sdkProcessingMetadata: {},
      span: undefined,
      tags: {
        current: 'current',
        global: 'global',
        isolation: 'isolation',
        foo: 'baz',
        dogs: 'great',
      },
      transactionName: undefined,
      user: {},
    });
  });
});
