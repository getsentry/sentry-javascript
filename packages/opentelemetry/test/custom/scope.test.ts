import { makeSession } from '@sentry/core';
import type { Breadcrumb } from '@sentry/types';

import { OpenTelemetryScope } from '../../src/custom/scope';
import { InternalSentrySemanticAttributes } from '../../src/semanticAttributes';
import { setSpanParent } from '../../src/utils/spanData';
import { createSpan } from '../helpers/createSpan';
import * as GetActiveSpan from './../../src/utils/getActiveSpan';

describe('NodeExperimentalScope', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('clone() correctly clones the scope', () => {
    const scope = new OpenTelemetryScope();

    scope['_breadcrumbs'] = [{ message: 'test' }];
    scope['_tags'] = { tag: 'bar' };
    scope['_extra'] = { extra: 'bar' };
    scope['_contexts'] = { os: { name: 'Linux' } };
    scope['_user'] = { id: '123' };
    scope['_level'] = 'warning';
    // we don't care about _span
    scope['_session'] = makeSession({ sid: '123' });
    // we don't care about transactionName
    scope['_fingerprint'] = ['foo'];
    scope['_eventProcessors'] = [() => ({})];
    scope['_requestSession'] = { status: 'ok' };
    scope['_attachments'] = [{ data: '123', filename: 'test.txt' }];
    scope['_sdkProcessingMetadata'] = { sdk: 'bar' };

    // eslint-disable-next-line deprecation/deprecation
    const scope2 = OpenTelemetryScope.clone(scope);

    expect(scope2).toBeInstanceOf(OpenTelemetryScope);
    expect(scope2).not.toBe(scope);

    // Ensure everything is correctly cloned
    expect(scope2['_breadcrumbs']).toEqual(scope['_breadcrumbs']);
    expect(scope2['_tags']).toEqual(scope['_tags']);
    expect(scope2['_extra']).toEqual(scope['_extra']);
    expect(scope2['_contexts']).toEqual(scope['_contexts']);
    expect(scope2['_user']).toEqual(scope['_user']);
    expect(scope2['_level']).toEqual(scope['_level']);
    expect(scope2['_session']).toEqual(scope['_session']);
    expect(scope2['_fingerprint']).toEqual(scope['_fingerprint']);
    expect(scope2['_eventProcessors']).toEqual(scope['_eventProcessors']);
    expect(scope2['_requestSession']).toEqual(scope['_requestSession']);
    expect(scope2['_attachments']).toEqual(scope['_attachments']);
    expect(scope2['_sdkProcessingMetadata']).toEqual(scope['_sdkProcessingMetadata']);
    expect(scope2['_propagationContext']).toEqual(scope['_propagationContext']);

    // Ensure things are not copied by reference
    expect(scope2['_breadcrumbs']).not.toBe(scope['_breadcrumbs']);
    expect(scope2['_tags']).not.toBe(scope['_tags']);
    expect(scope2['_extra']).not.toBe(scope['_extra']);
    expect(scope2['_contexts']).not.toBe(scope['_contexts']);
    expect(scope2['_eventProcessors']).not.toBe(scope['_eventProcessors']);
    expect(scope2['_attachments']).not.toBe(scope['_attachments']);
    expect(scope2['_sdkProcessingMetadata']).not.toBe(scope['_sdkProcessingMetadata']);
    expect(scope2['_propagationContext']).not.toBe(scope['_propagationContext']);

    // These are actually copied by reference
    expect(scope2['_user']).toBe(scope['_user']);
    expect(scope2['_session']).toBe(scope['_session']);
    expect(scope2['_requestSession']).toBe(scope['_requestSession']);
    expect(scope2['_fingerprint']).toBe(scope['_fingerprint']);
  });

  it('clone() works without existing scope', () => {
    // eslint-disable-next-line deprecation/deprecation
    const scope = OpenTelemetryScope.clone(undefined);

    expect(scope).toBeInstanceOf(OpenTelemetryScope);
  });

  it('getSpan returns undefined', () => {
    const scope = new OpenTelemetryScope();

    // Pretend we have a _span set
    scope['_span'] = {} as any;

    expect(scope.getSpan()).toBeUndefined();
  });

  it('setSpan is a noop', () => {
    const scope = new OpenTelemetryScope();

    scope.setSpan({} as any);

    expect(scope['_span']).toBeUndefined();
  });

  describe('addBreadcrumb', () => {
    it('adds to scope if no root span is found', () => {
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(undefined);

      const scope = new OpenTelemetryScope();
      const breadcrumb: Breadcrumb = { message: 'test' };

      const now = Date.now();
      jest.useFakeTimers();
      jest.setSystemTime(now);

      scope.addBreadcrumb(breadcrumb);

      expect(scope['_breadcrumbs']).toEqual([{ message: 'test', timestamp: now / 1000 }]);
    });

    it('adds to scope if no root span is found & uses given timestamp', () => {
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(undefined);

      const scope = new OpenTelemetryScope();
      const breadcrumb: Breadcrumb = { message: 'test', timestamp: 1234 };

      scope.addBreadcrumb(breadcrumb);

      expect(scope['_breadcrumbs']).toEqual([breadcrumb]);
    });

    it('adds to root span if found', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();
      const breadcrumb: Breadcrumb = { message: 'test' };

      const now = Date.now();
      jest.useFakeTimers();
      jest.setSystemTime(now);

      scope.addBreadcrumb(breadcrumb);

      expect(scope['_breadcrumbs']).toEqual([]);
      expect(span.events).toEqual([
        expect.objectContaining({
          name: 'test',
          time: [Math.floor(now / 1000), (now % 1000) * 1_000_000],
          attributes: {},
        }),
      ]);
    });

    it('adds to root span if found & uses given timestamp', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();
      const breadcrumb: Breadcrumb = { timestamp: 12345, message: 'test' };

      scope.addBreadcrumb(breadcrumb);

      expect(scope['_breadcrumbs']).toEqual([]);
      expect(span.events).toEqual([
        expect.objectContaining({
          name: 'test',
          time: [12345, 0],
          attributes: {},
        }),
      ]);
    });

    it('adds many breadcrumbs to root span if found', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();
      const breadcrumb1: Breadcrumb = { timestamp: 12345, message: 'test1' };
      const breadcrumb2: Breadcrumb = { timestamp: 5678, message: 'test2' };
      const breadcrumb3: Breadcrumb = { timestamp: 9101112, message: 'test3' };

      scope.addBreadcrumb(breadcrumb1);
      scope.addBreadcrumb(breadcrumb2);
      scope.addBreadcrumb(breadcrumb3);

      expect(scope['_breadcrumbs']).toEqual([]);
      expect(span.events).toEqual([
        expect.objectContaining({
          name: 'test1',
          time: [12345, 0],
          attributes: {},
        }),
        expect.objectContaining({
          name: 'test2',
          time: [5678, 0],
          attributes: {},
        }),
        expect.objectContaining({
          name: 'test3',
          time: [9101112, 0],
          attributes: {},
        }),
      ]);
    });

    it('adds to root span if found & no message is given', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();
      const breadcrumb: Breadcrumb = { timestamp: 12345 };

      scope.addBreadcrumb(breadcrumb);

      expect(scope['_breadcrumbs']).toEqual([]);
      expect(span.events).toEqual([
        expect.objectContaining({
          name: '<no message>',
          time: [12345, 0],
          attributes: {},
        }),
      ]);
    });

    it('adds to root span with full attributes', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();
      const breadcrumb: Breadcrumb = {
        timestamp: 12345,
        message: 'test',
        data: { nested: { indeed: true } },
        level: 'info',
        category: 'test-category',
        type: 'test-type',
        event_id: 'test-event-id',
      };

      scope.addBreadcrumb(breadcrumb);

      expect(scope['_breadcrumbs']).toEqual([]);
      expect(span.events).toEqual([
        expect.objectContaining({
          name: 'test',
          time: [12345, 0],
          attributes: {
            [InternalSentrySemanticAttributes.BREADCRUMB_DATA]: JSON.stringify({ nested: { indeed: true } }),
            [InternalSentrySemanticAttributes.BREADCRUMB_TYPE]: 'test-type',
            [InternalSentrySemanticAttributes.BREADCRUMB_LEVEL]: 'info',
            [InternalSentrySemanticAttributes.BREADCRUMB_EVENT_ID]: 'test-event-id',
            [InternalSentrySemanticAttributes.BREADCRUMB_CATEGORY]: 'test-category',
          },
        }),
      ]);
    });

    it('adds to root span with empty data', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();
      const breadcrumb: Breadcrumb = { timestamp: 12345, message: 'test', data: {} };

      scope.addBreadcrumb(breadcrumb);

      expect(scope['_breadcrumbs']).toEqual([]);
      expect(span.events).toEqual([
        expect.objectContaining({
          name: 'test',
          time: [12345, 0],
          attributes: {},
        }),
      ]);
    });
  });

  describe('_getBreadcrumbs', () => {
    it('gets from scope if no root span is found', () => {
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(undefined);

      const scope = new OpenTelemetryScope();
      const breadcrumbs: Breadcrumb[] = [
        { message: 'test1', timestamp: 1234 },
        { message: 'test2', timestamp: 12345 },
        { message: 'test3', timestamp: 12346 },
      ];
      scope['_breadcrumbs'] = breadcrumbs;

      expect(scope['_getBreadcrumbs']()).toEqual(breadcrumbs);
    });

    it('gets from root span if found', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();

      const now = Date.now();

      span.addEvent('basic event', now);
      span.addEvent('breadcrumb event', {}, now + 1000);
      span.addEvent(
        'breadcrumb event 2',
        {
          [InternalSentrySemanticAttributes.BREADCRUMB_DATA]: JSON.stringify({ nested: { indeed: true } }),
          [InternalSentrySemanticAttributes.BREADCRUMB_TYPE]: 'test-type',
          [InternalSentrySemanticAttributes.BREADCRUMB_LEVEL]: 'info',
          [InternalSentrySemanticAttributes.BREADCRUMB_EVENT_ID]: 'test-event-id',
          [InternalSentrySemanticAttributes.BREADCRUMB_CATEGORY]: 'test-category',
        },
        now + 3000,
      );
      span.addEvent(
        'breadcrumb event invalid JSON data',
        {
          [InternalSentrySemanticAttributes.BREADCRUMB_DATA]: 'this is not JSON...',
        },
        now + 2000,
      );

      expect(scope['_getBreadcrumbs']()).toEqual([
        { message: 'basic event', timestamp: now / 1000 },
        { message: 'breadcrumb event', timestamp: now / 1000 + 1 },
        {
          message: 'breadcrumb event 2',
          timestamp: now / 1000 + 3,
          data: { nested: { indeed: true } },
          level: 'info',
          event_id: 'test-event-id',
          category: 'test-category',
          type: 'test-type',
        },
        { message: 'breadcrumb event invalid JSON data', timestamp: now / 1000 + 2 },
      ]);
    });

    it('gets from spans up the parent chain if found', () => {
      const span = createSpan();
      const parentSpan = createSpan();
      const rootSpan = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      setSpanParent(span, parentSpan);
      setSpanParent(parentSpan, rootSpan);

      const scope = new OpenTelemetryScope();

      const now = Date.now();

      span.addEvent('basic event', now);
      parentSpan.addEvent('parent breadcrumb event', {}, now + 1000);
      span.addEvent(
        'breadcrumb event 2',
        {
          [InternalSentrySemanticAttributes.BREADCRUMB_DATA]: JSON.stringify({ nested: true }),
        },
        now + 3000,
      );
      rootSpan.addEvent(
        'breadcrumb event invalid JSON data',
        {
          [InternalSentrySemanticAttributes.BREADCRUMB_DATA]: 'this is not JSON...',
        },
        now + 2000,
      );

      expect(scope['_getBreadcrumbs']()).toEqual([
        { message: 'basic event', timestamp: now / 1000 },
        { message: 'breadcrumb event 2', timestamp: now / 1000 + 3, data: { nested: true } },
        { message: 'parent breadcrumb event', timestamp: now / 1000 + 1 },
        { message: 'breadcrumb event invalid JSON data', timestamp: now / 1000 + 2 },
      ]);
    });

    it('combines scope & span breadcrumbs if both exist', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();

      const breadcrumbs: Breadcrumb[] = [
        { message: 'test1', timestamp: 1234 },
        { message: 'test2', timestamp: 12345 },
        { message: 'test3', timestamp: 12346 },
      ];
      scope['_breadcrumbs'] = breadcrumbs;

      const now = Date.now();

      span.addEvent('basic event', now);
      span.addEvent('breadcrumb event', {}, now + 1000);

      expect(scope['_getBreadcrumbs']()).toEqual([
        { message: 'test1', timestamp: 1234 },
        { message: 'test2', timestamp: 12345 },
        { message: 'test3', timestamp: 12346 },
        { message: 'basic event', timestamp: now / 1000 },
        { message: 'breadcrumb event', timestamp: now / 1000 + 1 },
      ]);
    });

    it('gets from activeSpan if defined', () => {
      const span = createSpan();
      jest.spyOn(GetActiveSpan, 'getActiveSpan').mockReturnValue(span);

      const scope = new OpenTelemetryScope();

      const now = Date.now();

      span.addEvent('basic event', now);
      span.addEvent('breadcrumb event', {}, now + 1000);
      span.addEvent(
        'breadcrumb event 2',
        {
          [InternalSentrySemanticAttributes.BREADCRUMB_DATA]: JSON.stringify({ nested: { indeed: true } }),
          [InternalSentrySemanticAttributes.BREADCRUMB_TYPE]: 'test-type',
          [InternalSentrySemanticAttributes.BREADCRUMB_LEVEL]: 'info',
          [InternalSentrySemanticAttributes.BREADCRUMB_EVENT_ID]: 'test-event-id',
          [InternalSentrySemanticAttributes.BREADCRUMB_CATEGORY]: 'test-category',
        },
        now + 3000,
      );
      span.addEvent(
        'breadcrumb event invalid JSON data',
        {
          [InternalSentrySemanticAttributes.BREADCRUMB_DATA]: 'this is not JSON...',
        },
        now + 2000,
      );

      const activeSpan = createSpan();
      activeSpan.addEvent('event 1', now);
      activeSpan.addEvent('event 2', {}, now + 1000);
      scope.activeSpan = activeSpan;

      expect(scope['_getBreadcrumbs']()).toEqual([
        { message: 'event 1', timestamp: now / 1000 },
        { message: 'event 2', timestamp: now / 1000 + 1 },
      ]);
    });
  });
});
