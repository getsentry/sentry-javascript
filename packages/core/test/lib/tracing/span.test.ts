import { Span } from '../../../src';

describe('span', () => {
  it('works with name', () => {
    const span = new Span({ name: 'span name' });
    expect(span.name).toEqual('span name');
    expect(span.description).toEqual('span name');
  });

  it('works with description', () => {
    const span = new Span({ description: 'span name' });
    expect(span.name).toEqual('span name');
    expect(span.description).toEqual('span name');
  });

  it('works without name', () => {
    const span = new Span({});
    expect(span.name).toEqual('');
    expect(span.description).toEqual(undefined);
  });

  it('allows to update the name', () => {
    const span = new Span({ name: 'span name' });
    expect(span.name).toEqual('span name');
    expect(span.description).toEqual('span name');

    span.name = 'new name';

    expect(span.name).toEqual('new name');
    expect(span.description).toEqual('new name');
  });
});
