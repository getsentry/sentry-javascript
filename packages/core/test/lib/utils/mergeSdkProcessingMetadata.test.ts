import { mergeSdkProcessingMetadata } from '../../../src/utils/mergeSdkProcessingMetadata';

describe('mergeSdkProcessingMetadata', () => {
  it('works with empty objects', () => {
    const oldData = {};
    const newData = {};

    const actual = mergeSdkProcessingMetadata(oldData, newData);

    expect(actual).toEqual({});
    expect(actual).not.toBe(oldData);
    expect(actual).not.toBe(newData);
  });

  it('works with arbitrary data', () => {
    const oldData = {
      old1: 'old1',
      old2: 'old2',
      obj: { key: 'value' },
    };
    const newData = {
      new1: 'new1',
      old2: 'new2',
      obj: { key2: 'value2' },
    };

    const actual = mergeSdkProcessingMetadata(oldData, newData);

    expect(actual).toEqual({
      old1: 'old1',
      old2: 'new2',
      new1: 'new1',
      obj: { key2: 'value2' },
    });
    expect(actual).not.toBe(oldData);
    expect(actual).not.toBe(newData);
  });

  it('merges normalizedRequest', () => {
    const oldData = {
      old1: 'old1',
      normalizedRequest: {
        url: 'oldUrl',
        method: 'oldMethod',
      },
    };
    const newData = {
      new1: 'new1',
      normalizedRequest: {
        url: 'newUrl',
        headers: {},
      },
    };

    const actual = mergeSdkProcessingMetadata(oldData, newData);

    expect(actual).toEqual({
      old1: 'old1',
      new1: 'new1',
      normalizedRequest: {
        url: 'newUrl',
        method: 'oldMethod',
        headers: {},
      },
    });
  });

  it('keeps existing normalizedRequest', () => {
    const oldData = {
      old1: 'old1',
      normalizedRequest: {
        url: 'oldUrl',
        method: 'oldMethod',
      },
    };
    const newData = {
      new1: 'new1',
    };

    const actual = mergeSdkProcessingMetadata(oldData, newData);

    expect(actual).toEqual({
      old1: 'old1',
      new1: 'new1',
      normalizedRequest: {
        url: 'oldUrl',
        method: 'oldMethod',
      },
    });
  });

  it('adds new normalizedRequest', () => {
    const oldData = {
      old1: 'old1',
    };
    const newData = {
      new1: 'new1',
      normalizedRequest: {
        url: 'newUrl',
        method: 'newMethod',
      },
    };

    const actual = mergeSdkProcessingMetadata(oldData, newData);

    expect(actual).toEqual({
      old1: 'old1',
      new1: 'new1',
      normalizedRequest: {
        url: 'newUrl',
        method: 'newMethod',
      },
    });
  });
});
