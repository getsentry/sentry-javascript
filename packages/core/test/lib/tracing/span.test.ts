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

  it('allows to update the name via setter', () => {
    const span = new Span({ name: 'span name' });
    expect(span.name).toEqual('span name');
    expect(span.description).toEqual('span name');

    span.name = 'new name';

    expect(span.name).toEqual('new name');
    expect(span.description).toEqual('new name');
  });

  it('allows to update the name via setName', () => {
    const span = new Span({ name: 'span name' });
    expect(span.name).toEqual('span name');
    expect(span.description).toEqual('span name');

    // eslint-disable-next-line deprecation/deprecation
    span.setName('new name');

    expect(span.name).toEqual('new name');
    expect(span.description).toEqual('new name');
  });

  it('allows to update the name via updateName', () => {
    const span = new Span({ name: 'span name' });
    expect(span.name).toEqual('span name');
    expect(span.description).toEqual('span name');

    span.updateName('new name');

    expect(span.name).toEqual('new name');
    expect(span.description).toEqual('new name');
  });

  describe('setAttribute', () => {
    it('allows to set attributes', () => {
      const span = new Span();

      span.setAttribute('str', 'bar');
      span.setAttribute('num', 1);
      span.setAttribute('zero', 0);
      span.setAttribute('bool', true);
      span.setAttribute('false', false);
      span.setAttribute('undefined', undefined);
      span.setAttribute('numArray', [1, 2]);
      span.setAttribute('strArray', ['aa', 'bb']);
      span.setAttribute('boolArray', [true, false]);
      span.setAttribute('arrayWithUndefined', [1, undefined, 2]);

      expect(span.attributes).toEqual({
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
      });
    });

    it('deletes attributes when setting to `undefined`', () => {
      const span = new Span();

      span.setAttribute('str', 'bar');

      expect(Object.keys(span.attributes).length).toEqual(1);

      span.setAttribute('str', undefined);

      expect(Object.keys(span.attributes).length).toEqual(0);
    });

    it('disallows invalid attribute types', () => {
      const span = new Span();

      /** @ts-expect-error this is invalid */
      span.setAttribute('str', {});

      /** @ts-expect-error this is invalid */
      span.setAttribute('str', null);

      /** @ts-expect-error this is invalid */
      span.setAttribute('str', [1, 'a']);
    });
  });

  describe('setAttributes', () => {
    it('allows to set attributes', () => {
      const span = new Span();

      const initialAttributes = span.attributes;

      expect(initialAttributes).toEqual({});

      const newAttributes = {
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        undefined: undefined,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
      };
      span.setAttributes(newAttributes);

      expect(span.attributes).toEqual({
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
      });

      expect(span.attributes).not.toBe(newAttributes);

      span.setAttributes({
        num: 2,
        numArray: [3, 4],
      });

      expect(span.attributes).toEqual({
        str: 'bar',
        num: 2,
        zero: 0,
        bool: true,
        false: false,
        numArray: [3, 4],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
      });
    });

    it('deletes attributes when setting to `undefined`', () => {
      const span = new Span();

      span.setAttribute('str', 'bar');

      expect(Object.keys(span.attributes).length).toEqual(1);

      span.setAttributes({ str: undefined });

      expect(Object.keys(span.attributes).length).toEqual(0);
    });
  });

  // Ensure that attributes & data are merged together
  describe('_getData', () => {
    it('works without data & attributes', () => {
      const span = new Span();

      expect(span['_getData']()).toEqual(undefined);
    });

    it('works with data only', () => {
      const span = new Span();
      span.setData('foo', 'bar');

      expect(span['_getData']()).toEqual({ foo: 'bar' });
      expect(span['_getData']()).toBe(span.data);
    });

    it('works with attributes only', () => {
      const span = new Span();
      span.setAttribute('foo', 'bar');

      expect(span['_getData']()).toEqual({ foo: 'bar' });
      expect(span['_getData']()).toBe(span.attributes);
    });

    it('merges data & attributes', () => {
      const span = new Span();
      span.setAttribute('foo', 'foo');
      span.setAttribute('bar', 'bar');
      span.setData('foo', 'foo2');
      span.setData('baz', 'baz');

      expect(span['_getData']()).toEqual({ foo: 'foo', bar: 'bar', baz: 'baz' });
      expect(span['_getData']()).not.toBe(span.attributes);
      expect(span['_getData']()).not.toBe(span.data);
    });
  });
});
