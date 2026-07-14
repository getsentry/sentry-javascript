import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@sentry/core';
import { collectGraphqlDocument } from '../../src/graphql/utils';
import type { GraphqlDocumentNode } from '../../src/graphql/utils';

vi.spyOn(core, 'getClient');

function mockClient(graphQLDocument: boolean): void {
  vi.mocked(core.getClient).mockReturnValue({
    getDataCollectionOptions: () => ({ graphQL: { document: graphQLDocument, variables: true } }),
  } as any);
}

function makeDocument(body: string): GraphqlDocumentNode {
  const token = { kind: 'Name', start: 0, end: body.length, next: null };
  return {
    loc: {
      startToken: token,
      source: { body },
    },
  };
}

describe('collectGraphqlDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the redacted document when graphQL.document is true', () => {
    mockClient(true);
    const doc = makeDocument('{ hello }');
    expect(collectGraphqlDocument(doc)).toBe('{ hello }');
  });

  it('returns undefined when graphQL.document is false', () => {
    mockClient(false);
    const doc = makeDocument('{ hello }');
    expect(collectGraphqlDocument(doc)).toBeUndefined();
  });

  it('returns undefined when getClient() is undefined', () => {
    vi.mocked(core.getClient).mockReturnValue(undefined);
    const doc = makeDocument('{ hello }');
    expect(collectGraphqlDocument(doc)).toBeUndefined();
  });
});
