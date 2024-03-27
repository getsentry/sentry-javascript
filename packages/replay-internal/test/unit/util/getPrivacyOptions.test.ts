import { getPrivacyOptions } from '../../../src/util/getPrivacyOptions';

describe('Unit | util | getPrivacyOptions', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('has correct default options', () => {
    expect(
      getPrivacyOptions({
        mask: ['.custom-mask'],
        unmask: ['.custom-unmask'],
        block: ['.custom-block'],
        unblock: ['.custom-unblock'],
        ignore: ['.custom-ignore'],
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "blockSelector": ".custom-block,.sentry-block,[data-sentry-block],base[href=\\"/\\"]",
        "ignoreSelector": ".custom-ignore,.sentry-ignore,[data-sentry-ignore],input[type=\\"file\\"]",
        "maskTextSelector": ".custom-mask,.sentry-mask,[data-sentry-mask]",
        "unblockSelector": ".custom-unblock",
        "unmaskTextSelector": ".custom-unmask",
      }
    `);
  });
});
