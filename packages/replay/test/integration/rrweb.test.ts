import { MASK_ALL_TEXT_SELECTOR } from '../../src/constants';
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
        ignoreClass: 'sentry-test-ignore',
        stickySession: false,
      },
    });
    expect(mockRecord.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blockClass": "sentry-block",
        "blockSelector": "[data-sentry-block],img,image,svg,path,rect,area,video,object,picture,embed,map,audio",
        "emit": [Function],
        "ignoreClass": "sentry-test-ignore",
        "maskAllInputs": true,
        "maskTextClass": "sentry-mask",
        "maskTextSelector": "${MASK_ALL_TEXT_SELECTOR}",
      }
    `);
  });
});
