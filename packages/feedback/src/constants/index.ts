import { GLOBAL_OBJ } from '@sentry/core';

// exporting a separate copy of `WINDOW` rather than exporting the one from `@sentry/browser`
// prevents the browser package from being bundled in the CDN bundle, and avoids a
// circular dependency between the browser and feedback packages
export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;
export const DOCUMENT = WINDOW.document;
export const NAVIGATOR = WINDOW.navigator;

export const TRIGGER_LABEL = 'Report a Bug';
export const CANCEL_BUTTON_LABEL = 'Cancel';
export const SUBMIT_BUTTON_LABEL = 'Send Bug Report';
export const CONFIRM_BUTTON_LABEL = 'Confirm';
export const FORM_TITLE = 'Report a Bug';
export const EMAIL_PLACEHOLDER = 'your.email@example.org';
export const EMAIL_LABEL = 'Email';
export const MESSAGE_PLACEHOLDER = "What's the bug? What did you expect?";
export const MESSAGE_LABEL = 'Description';
export const NAME_PLACEHOLDER = 'Your Name';
export const NAME_LABEL = 'Name';
export const SUCCESS_MESSAGE_TEXT = 'Thank you for your report!';
export const IS_REQUIRED_LABEL = '(required)';
export const ADD_SCREENSHOT_LABEL = 'Add a screenshot';
export const REMOVE_SCREENSHOT_LABEL = 'Remove screenshot';
export const HIGHLIGHT_TOOL_TEXT = 'Highlight';
export const HIDE_TOOL_TEXT = 'Hide';
export const REMOVE_HIGHLIGHT_TEXT = 'Remove';

export const FEEDBACK_WIDGET_SOURCE = 'widget';
export const FEEDBACK_API_SOURCE = 'api';

export const SUCCESS_MESSAGE_TIMEOUT = 5000;
