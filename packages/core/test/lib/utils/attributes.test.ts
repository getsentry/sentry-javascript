import { describe, expect, it } from 'vitest';
import { attributesFromObject } from '../../../src/utils/attributes';

describe('attributesFromObject', () => {
  it('flattens an object', () => {
    const context = {
      a: 1,
      b: { c: { d: 2 } },
    };

    const result = attributesFromObject(context);

    expect(result).toEqual({
      a: 1,
      'b.c.d': 2,
    });
  });

  it('flattens an object with a max depth', () => {
    const context = {
      a: 1,
      b: { c: { d: 2 } },
    };

    const result = attributesFromObject(context, 2);

    expect(result).toEqual({
      a: 1,
      'b.c': '[Object]',
    });
  });

  it('flattens an object an array', () => {
    const context = {
      a: 1,
      b: { c: { d: 2 } },
      integrations: ['foo', 'bar'],
    };

    const result = attributesFromObject(context);

    expect(result).toEqual({
      a: 1,
      'b.c.d': 2,
      integrations: '["foo","bar"]',
    });
  });

  it('handles a circular object', () => {
    const context = {
      a: 1,
      b: { c: { d: 2 } },
    };
    context.b.c.e = context.b;

    const result = attributesFromObject(context, 5);

    expect(result).toEqual({
      a: 1,
      'b.c.d': 2,
      'b.c.e': '[Circular ~]',
    });
  });

  it('handles a circular object in an array', () => {
    const context = {
      a: 1,
      b: { c: { d: 2 } },
      integrations: ['foo', 'bar'],
    };

    // @ts-expect-error - this is fine
    context.integrations[0] = context.integrations;

    const result = attributesFromObject(context, 5);

    expect(result).toEqual({
      a: 1,
      'b.c.d': 2,
      integrations: '["[Circular ~]","bar"]',
    });
  });

  it('handles objects in arrays', () => {
    const context = {
      a: 1,
      b: { c: { d: 2 } },
      integrations: [{ name: 'foo' }, { name: 'bar' }],
    };

    const result = attributesFromObject(context);

    expect(result).toEqual({
      a: 1,
      'b.c.d': 2,
      integrations: '[{"name":"foo"},{"name":"bar"}]',
    });
  });
});
