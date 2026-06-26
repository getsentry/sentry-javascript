import { describe, expect, it } from 'vitest';
import { SPAN_KIND, spanKindToName } from '../../src/spanKind';

describe('spanKindToName', () => {
  it('resolves each span kind value to its name', () => {
    expect(spanKindToName(SPAN_KIND.INTERNAL)).toBe('INTERNAL');
    expect(spanKindToName(SPAN_KIND.SERVER)).toBe('SERVER');
    expect(spanKindToName(SPAN_KIND.CLIENT)).toBe('CLIENT');
    expect(spanKindToName(SPAN_KIND.PRODUCER)).toBe('PRODUCER');
    expect(spanKindToName(SPAN_KIND.CONSUMER)).toBe('CONSUMER');
  });

  it('returns undefined for an unknown kind value', () => {
    expect(spanKindToName(99)).toBeUndefined();
  });
});
