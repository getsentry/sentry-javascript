import { GLOBAL_OBJ } from '@sentry/utils';

// exporting a separate copy of `WINDOW` rather than exporting the one from `@sentry/browser`
// prevents the browser package from being bundled in the CDN bundle, and avoids a
// circular dependency between the browser and feedback packages
export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;
export const DOCUMENT = WINDOW.document;
