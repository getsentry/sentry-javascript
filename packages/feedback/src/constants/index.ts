import { GLOBAL_OBJ } from '@sentry/utils';

export { DEFAULT_THEME } from './theme';

// exporting a separate copy of `WINDOW` rather than exporting the one from `@sentry/browser`
// prevents the browser package from being bundled in the CDN bundle, and avoids a
// circular dependency between the browser and feedback packages
export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;
export const DOCUMENT = WINDOW.document;
export const NAVIGATOR = WINDOW.navigator;

export const ACTOR_LABEL = 'Report a Bug';
export const CANCEL_BUTTON_LABEL = 'Cancel';
export const SUBMIT_BUTTON_LABEL = 'Send Bug Report';
export const FORM_TITLE = 'Report a Bug';
export const EMAIL_PLACEHOLDER = 'your.email@example.org';
export const EMAIL_LABEL = 'Email';
export const MESSAGE_PLACEHOLDER = "What's the bug? What did you expect?";
export const MESSAGE_LABEL = 'Description';
export const NAME_PLACEHOLDER = 'Your Name';
export const NAME_LABEL = 'Name';
export const SUCCESS_MESSAGE_TEXT = 'Thank you for your report!';
export const IS_REQUIRED_TEXT = '(required)';

export const FEEDBACK_WIDGET_SOURCE = 'widget';
export const FEEDBACK_API_SOURCE = 'api';

export const SUCCESS_MESSAGE_TIMEOUT = 5000;

export const CROP_COLOR = '#ffffff';
