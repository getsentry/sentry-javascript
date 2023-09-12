// @ts-expect-error This will be replaced with the user's sentry config gile
// eslint-disable-next-line import/no-unresolved
import '__SENTRY_CONFIG_IMPORT_PATH__';

// @ts-expect-error This is the file we're wrapping
// eslint-disable-next-line import/no-unresolved
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

// @ts-expect-error This is the file we're wrapping
// eslint-disable-next-line import/no-unresolved
export { default } from '__SENTRY_WRAPPING_TARGET_FILE__';
