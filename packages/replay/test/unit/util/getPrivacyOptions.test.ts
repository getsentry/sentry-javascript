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
        "blockSelector": ".custom-block,.sentry-block,[data-sentry-block]",
        "ignoreSelector": ".custom-ignore,.sentry-ignore,[data-sentry-ignore]",
        "maskInputSelector": ".custom-mask,.sentry-mask,[data-sentry-mask]",
        "maskTextSelector": ".custom-mask,.sentry-mask,[data-sentry-mask]",
        "unblockSelector": ".custom-unblock,.sentry-unblock,[data-sentry-unblock]",
        "unmaskInputSelector": ".custom-unmask,.sentry-unmask,[data-sentry-unmask]",
        "unmaskTextSelector": ".custom-unmask,.sentry-unmask,[data-sentry-unmask]",
      }
    `);
  });

  it('supports deprecated options', () => {
    expect(
      getPrivacyOptions({
        mask: ['.custom-mask'],
        unmask: ['.custom-unmask'],
        block: ['.custom-block'],
        unblock: ['.custom-unblock'],
        ignore: ['.custom-ignore'],

        blockClass: 'deprecated-block-class',
        blockSelector: '.deprecated-block-selector',
        maskTextClass: 'deprecated-mask-class',
        maskTextSelector: '.deprecated-mask-selector',
        ignoreClass: 'deprecated-ignore-class',
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "blockSelector": ".custom-block,.deprecated-block-selector,.sentry-block,[data-sentry-block],.deprecated-block-class",
        "ignoreSelector": ".custom-ignore,.sentry-ignore,[data-sentry-ignore],.deprecated-ignore-class",
        "maskInputSelector": ".custom-mask,.deprecated-mask-selector,.sentry-mask,[data-sentry-mask],.deprecated-mask-class",
        "maskTextSelector": ".custom-mask,.deprecated-mask-selector,.sentry-mask,[data-sentry-mask],.deprecated-mask-class",
        "unblockSelector": ".custom-unblock,.sentry-unblock,[data-sentry-unblock]",
        "unmaskInputSelector": ".custom-unmask,.sentry-unmask,[data-sentry-unmask]",
        "unmaskTextSelector": ".custom-unmask,.sentry-unmask,[data-sentry-unmask]",
      }
    `);
  });

  it('supports deprecated regexp class name', () => {
    expect(
      getPrivacyOptions({
        mask: ['.custom-mask'],
        unmask: ['.custom-unmask'],
        block: ['.custom-block'],
        unblock: ['.custom-unblock'],
        ignore: ['.custom-ignore'],

        blockClass: /deprecated-block-*/,
        maskTextClass: /deprecated-mask-*/,
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "blockClass": /deprecated-block-\\*/,
        "blockSelector": ".custom-block,.sentry-block,[data-sentry-block]",
        "ignoreSelector": ".custom-ignore,.sentry-ignore,[data-sentry-ignore]",
        "maskInputSelector": ".custom-mask,.sentry-mask,[data-sentry-mask]",
        "maskTextClass": /deprecated-mask-\\*/,
        "maskTextSelector": ".custom-mask,.sentry-mask,[data-sentry-mask]",
        "unblockSelector": ".custom-unblock,.sentry-unblock,[data-sentry-unblock]",
        "unmaskInputSelector": ".custom-unmask,.sentry-unmask,[data-sentry-unmask]",
        "unmaskTextSelector": ".custom-unmask,.sentry-unmask,[data-sentry-unmask]",
      }
    `);
  });
});
