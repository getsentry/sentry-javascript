// @ts-ignore This will be replaced with the user's sentry config gile
// eslint-disable-next-line import/no-unresolved
import '__SENTRY_CONFIG_IMPORT_PATH__';

// @ts-ignore This is the file we're wrapping
// eslint-disable-next-line import/no-unresolved
import * as wrappee from '__SENTRY_WRAPPING_TARGET_FILE__';

// @ts-ignore default either exists, or it doesn't - we don't care
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const defaultExport = wrappee.default;

// @ts-ignore This is the file we're wrapping
// eslint-disable-next-line import/no-unresolved
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

export default defaultExport;
