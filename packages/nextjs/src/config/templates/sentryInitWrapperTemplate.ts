// @ts-expect-error This will be replaced with the user's sentry config gile
import '__SENTRY_CONFIG_IMPORT_PATH__';

// @ts-expect-error This is the file we're wrapping
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

// @ts-expect-error This is the file we're wrapping
export { default } from '__SENTRY_WRAPPING_TARGET_FILE__';
