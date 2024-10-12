import { parseFetchArgs, resolveResponse } from '../../src/instrument/fetch';

async function delay(ms: number) {
  await new Promise(res => {
    setTimeout(() => {
      res(true);
    }, ms);
  });
}

describe('instrument > parseFetchArgs', () => {
  it.each([
    ['string URL only', ['http://example.com'], { method: 'GET', url: 'http://example.com' }],
    ['URL object only', [new URL('http://example.com')], { method: 'GET', url: 'http://example.com/' }],
    ['Request URL only', [{ url: 'http://example.com' }], { method: 'GET', url: 'http://example.com' }],
    [
      'Request URL & method only',
      [{ url: 'http://example.com', method: 'post' }],
      { method: 'POST', url: 'http://example.com' },
    ],
    ['string URL & options', ['http://example.com', { method: 'post' }], { method: 'POST', url: 'http://example.com' }],
    [
      'URL object & options',
      [new URL('http://example.com'), { method: 'post' }],
      { method: 'POST', url: 'http://example.com/' },
    ],
    [
      'Request URL & options',
      [{ url: 'http://example.com' }, { method: 'post' }],
      { method: 'POST', url: 'http://example.com' },
    ],
  ])('%s', (_name, args, expected) => {
    const actual = parseFetchArgs(args as unknown[]);

    expect(actual).toEqual(expected);
  });
});

describe('instrument > fetch > resolveResponse', () => {
  let mockReader: jest.Mocked<ReadableStreamDefaultReader<any>>;
  let mockResponse: jest.Mocked<Response>;
  let mockParentResponse: jest.Mocked<Response>;
  let mockParentReader: jest.Mocked<ReadableStreamDefaultReader<any>>;
  let onFinishedResolving: jest.Mock;

  beforeEach(() => {
    mockReader = {
      read: jest.fn(),
      cancel: jest.fn(async (reason?: any) => {
        // Set read to reject on next call after cancel
        mockReader.read.mockRejectedValueOnce(new Error(reason));
      }),
      releaseLock: jest.fn(),
    } as unknown as jest.Mocked<ReadableStreamDefaultReader<any>>;

    mockResponse = {
      body: {
        getReader: jest.fn(() => mockReader),
        cancel: jest.fn(),
      } as unknown as ReadableStream<any>,
    } as jest.Mocked<Response>;

    mockParentReader = {
      read: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn(),
    } as unknown as jest.Mocked<ReadableStreamDefaultReader<any>>;

    mockParentResponse = {
      body: {
        cancel: jest.fn().mockResolvedValue(undefined),
        getReader: jest.fn(() => mockParentReader),
      } as unknown as ReadableStream<any>,
    } as jest.Mocked<Response>;

    onFinishedResolving = jest.fn();
  });

  test('should call onFinishedResolving when the stream is fully read', async () => {
    mockReader.read
      .mockResolvedValueOnce({ done: false, value: 'chunk' })
      .mockResolvedValueOnce({ done: true, value: null });

    resolveResponse(mockResponse, mockParentResponse, onFinishedResolving);

    // wait 100ms so all promise can be resolved/rejected
    await delay(100);

    expect(mockReader.read).toHaveBeenCalledTimes(2);
    expect(onFinishedResolving).toHaveBeenCalled();
  });

  test('should handle read errors gracefully', async () => {
    mockReader.read.mockRejectedValue(new Error('Read error'));

    resolveResponse(mockResponse, mockParentResponse, onFinishedResolving);

    await delay(100);

    expect(onFinishedResolving).not.toHaveBeenCalled();
    expect(mockReader.releaseLock).toHaveBeenCalled();
    expect(mockResponse.body?.cancel).toHaveBeenCalled();
  });

  test('should cancel reader and gracefully exit when parent response is cancelled', async () => {
    mockReader.read
      .mockResolvedValueOnce({ done: false, value: 'chunk1' })
      .mockResolvedValueOnce({ done: false, value: 'chunk2' });

    resolveResponse(mockResponse, mockParentResponse, onFinishedResolving);

    await Promise.resolve();
    await mockParentResponse.body?.cancel();
    await delay(100);

    expect(onFinishedResolving).not.toHaveBeenCalled();
    expect(mockReader.releaseLock).toHaveBeenCalled();
    expect(mockReader.cancel).toHaveBeenCalled();
    expect(mockResponse.body?.cancel).toHaveBeenCalled();
  });

  test('should cancel reader and gracefully exit when parent reader is cancelled', async () => {
    mockReader.read
      .mockResolvedValueOnce({ done: false, value: 'chunk1' })
      .mockResolvedValueOnce({ done: false, value: 'chunk2' });

    resolveResponse(mockResponse, mockParentResponse, onFinishedResolving);

    const parentReader = mockParentResponse.body!.getReader();
    await Promise.resolve();

    await parentReader.cancel();
    await delay(100);

    expect(onFinishedResolving).not.toHaveBeenCalled();
    expect(mockReader.releaseLock).toHaveBeenCalled();
    expect(mockReader.cancel).toHaveBeenCalled();
    expect(mockResponse.body?.cancel).toHaveBeenCalled();
  });
});
