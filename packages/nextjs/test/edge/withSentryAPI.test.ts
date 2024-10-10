import { wrapApiHandlerWithSentry } from '../../src/edge';

const origRequest = global.Request;
const origResponse = global.Response;

// @ts-expect-error Request does not exist on type Global
global.Request = class Request {
  public url: string;

  public headers = {
    get() {
      return null;
    },
  };

  public method = 'POST';

  public constructor(input: string) {
    this.url = input;
  }
};

// @ts-expect-error Response does not exist on type Global
global.Response = class Response {};

afterAll(() => {
  global.Request = origRequest;
  global.Response = origResponse;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('wrapApiHandlerWithSentry', () => {
  it('should return a function that does not throw when no request is passed', async () => {
    const origFunction = jest.fn(() => new Response());

    const wrappedFunction = wrapApiHandlerWithSentry(origFunction, '/user/[userId]/post/[postId]');

    await wrappedFunction();
  });
});
