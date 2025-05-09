import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import { getSpanKind } from '../../src/utils/getSpanKind';

describe('getSpanKind', () => {
  it('works', () => {
    expect(getSpanKind({} as Span)).toBe(SpanKind.INTERNAL);
    expect(getSpanKind({ kind: SpanKind.CLIENT } as unknown as Span)).toBe(SpanKind.CLIENT);
  });
});
