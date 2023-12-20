import { applyScopeDataToEvent } from '@sentry/core';
import type { Attachment, Breadcrumb, EventProcessor } from '@sentry/types';
import { clearGlobalData } from '../../src/globals';
import { Scope, getGlobalScope } from '../../src/scope';

describe('Unit | Scope', () => {
  beforeEach(() => {
    clearGlobalData();
  });

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

  describe('global scope', () => {
    beforeEach(() => {
      clearGlobalData();
    });

    it('works', () => {
      const globalScope = getGlobalScope();
      expect(globalScope).toBeDefined();
      expect(globalScope).toBeInstanceOf(Scope);

      // Repeatedly returns the same instance
      expect(getGlobalScope()).toBe(globalScope);

      globalScope.setTag('tag1', 'val1');
      globalScope.setTag('tag2', 'val2');

      expect(globalScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });
    });
  });

  describe('applyScopeDataToEvent', () => {
    it('works without any data', async () => {
      const scope = new Scope();

      const event = { message: 'foo' };
      applyScopeDataToEvent(event, scope.getScopeData());

      expect(event).toEqual({
        message: 'foo',
        sdkProcessingMetadata: {
          propagationContext: {
            spanId: expect.any(String),
            traceId: expect.any(String),
          },
        },
      });
    });

    it('works with data', async () => {
      const breadcrumb1 = { message: '1', timestamp: 111 } as Breadcrumb;
      const breadcrumb2 = { message: '1', timestamp: 111 } as Breadcrumb;

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
      scope.setSDKProcessingMetadata({ aa: 'aa' });

      const event = { message: 'foo', breadcrumbs: [breadcrumb2], fingerprint: ['dd'] };

      applyScopeDataToEvent(event, scope.getScopeData());

      expect(event).toEqual({
        message: 'foo',
        user: { id: '1', email: 'test@example.com' },
        tags: { tag1: 'aa', tag2: 'aa' },
        extra: { extra1: 'aa', extra2: 'aa' },
        contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
        fingerprint: ['dd', 'aa'],
        breadcrumbs: [breadcrumb2, breadcrumb1],
        sdkProcessingMetadata: {
          aa: 'aa',
          propagationContext: {
            spanId: '1',
            traceId: '1',
          },
        },
      });
    });
  });

  describe('getAttachments', () => {
    /* eslint-disable deprecation/deprecation */
    it('works without any data', async () => {
      const scope = new Scope();

      const actual = scope.getAttachments();
      expect(actual).toEqual([]);
    });

    it('works with attachments', async () => {
      const attachment1 = { filename: '1' } as Attachment;
      const attachment2 = { filename: '2' } as Attachment;

      const scope = new Scope();
      scope.addAttachment(attachment1);
      scope.addAttachment(attachment2);

      const actual = scope.getAttachments();
      expect(actual).toEqual([attachment1, attachment2]);
    });
    /* eslint-enable deprecation/deprecation */
  });
});
