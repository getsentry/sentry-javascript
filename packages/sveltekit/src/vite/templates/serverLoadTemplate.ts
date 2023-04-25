// @ts-ignore - this import placeholed will be replaced!
import * as userModule from '__SENTRY_WRAPPING_TARGET_FILE__';
// eslint-disable-next-line import/no-extraneous-dependencies
import { wrapServerLoadWithSentry } from '@sentry/sveltekit';

// @ts-ignore whatever
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const load = userModule.load ? wrapServerLoadWithSentry(userModule.load) : undefined;

// Re-export anything exported by the page module we're wrapping.
// @ts-ignore See import on top
export * from '__SENTRY_WRAPPING_TARGET_FILE__';
