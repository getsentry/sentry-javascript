import { describe, expect, it } from 'vitest';
import { spanKindToName } from '../../src/spanKind';

describe('spanKindToName', () => {
  it('resolves each span kind value to its name', () => {
    expect(spanKindToName(0)).toBe(undefined);
    expect(spanKindToName(1)).toBe('server');
    expect(spanKindToName(2)).toBe('client');
    expect(spanKindToName(3)).toBe('producer');
    expect(spanKindToName(4)).toBe('consumer');
  });
});
