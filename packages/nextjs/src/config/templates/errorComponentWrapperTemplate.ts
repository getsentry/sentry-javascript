import * as Sentry from '@sentry/nextjs';
// @ts-expect-error This is the file we're wrapping
import component from '__SENTRY_WRAPPING_TARGET_FILE__';

export default Sentry.wrapErrorComponentWithSentry(component);

// @ts-expect-error This is the file we're wrapping
export * from '__SENTRY_WRAPPING_TARGET_FILE__';
