import '__SENTRY_CONFIG_IMPORT_PATH__';
// @ts-expect-error This is the file we're wrapping
import * as wrappingTargetModule from '__SENTRY_WRAPPING_TARGET_FILE__';

// @ts-expect-error This is the file we're wrapping
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export default wrappingTargetModule.default;
