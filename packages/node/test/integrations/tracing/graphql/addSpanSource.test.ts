import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@sentry/core';
import { addSpanSource } from '../../../../src/integrations/tracing/graphql/vendored/utils';
import type { Location, Token } from '@sentry/server-utils/orchestrion';

vi.spyOn(core, 'getClient');

function mockClient(graphQLDocument: boolean): void {
  vi.mocked(core.getClient).mockReturnValue({
    getDataCollectionOptions: () => ({ graphQL: { document: graphQLDocument, variables: true } }),
  } as any);
}

function makeLocation(): Location {
  const token: Token = {
    kind: 'Name',
    start: 0,
    end: 5,
    line: 1,
    column: 1,
    value: 'hello',
    prev: null,
    next: null,
  };
  return { start: 0, end: 5, startToken: token };
}

describe('addSpanSource dataCollection gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets graphql.source attribute when graphQL.document is true', () => {
    mockClient(true);
    const span = { setAttribute: vi.fn() } as any;
    addSpanSource(span, makeLocation());
    expect(span.setAttribute).toHaveBeenCalledWith('graphql.source', expect.any(String));
  });

  it('does not set attribute when graphQL.document is false', () => {
    mockClient(false);
    const span = { setAttribute: vi.fn() } as any;
    addSpanSource(span, makeLocation());
    expect(span.setAttribute).not.toHaveBeenCalled();
  });

  it('does not set attribute when getClient() is undefined', () => {
    vi.mocked(core.getClient).mockReturnValue(undefined);
    const span = { setAttribute: vi.fn() } as any;
    addSpanSource(span, makeLocation());
    expect(span.setAttribute).not.toHaveBeenCalled();
  });
});
