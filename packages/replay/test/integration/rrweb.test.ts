import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | rrweb', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls rrweb.record with custom options', async () => {
    const { mockRecord } = await resetSdkMock({
      replayOptions: {
        ignore: ['.sentry-test-ignore'],
        stickySession: false,
      },
    });
    expect(mockRecord.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blockSelector": ".sentry-block,[data-sentry-block],base[href=\\"/\\"],img,image,svg,video,object,picture,embed,map,audio,link[rel=\\"icon\\"],link[rel=\\"apple-touch-icon\\"]",
        "collectFonts": true,
        "emit": [Function],
        "errorHandler": [Function],
        "ignoreSelector": ".sentry-test-ignore,.sentry-ignore,[data-sentry-ignore],input[type=\\"file\\"]",
        "inlineImages": false,
        "inlineStylesheet": true,
        "maskAllInputs": true,
        "maskAllText": true,
        "maskAttributeFn": [Function],
        "maskInputFn": undefined,
        "maskInputOptions": Object {
          "password": true,
        },
        "maskTextFn": undefined,
        "maskTextSelector": ".sentry-mask,[data-sentry-mask]",
        "onMutation": [Function],
        "slimDOMOptions": "all",
        "unblockSelector": ".sentry-unblock,[data-sentry-unblock]",
        "unmaskTextSelector": ".sentry-unmask,[data-sentry-unmask]",
      }
    `);
  });

  it('calls rrweb.record with default canvas options', async () => {
    const { mockRecord } = await resetSdkMock({
      replayOptions: {
        _experiments: {
          canvas: {
            // @ts-expect-error This should return
            // CanvasManagerInterface, but we don't care about it
            // for this test
            manager: () => null,
          },
        },
      },
    });

    expect(mockRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recordCanvas: true,
        getCanvasManager: expect.any(Function),
        dataURLOptions: {
          quality: 0.4,
          type: 'image/webp',
        },
        sampling: {
          canvas: 2,
        },
      }),
    );
  });
});
