import { GLOBAL_OBJ } from '@sentry/utils';

// exporting a separate copy of `WINDOW` rather than exporting the one from `@sentry/browser`
// prevents the browser package from being bundled in the CDN bundle, and avoids a
// circular dependency between the browser and feedback packages
export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

const LIGHT_BACKGROUND = '#ffffff';
const INHERIT = 'inherit';
const SUBMIT_COLOR = 'rgba(108, 95, 199, 1)';
const LIGHT_THEME = {
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  fontSize: '14px',

  background: LIGHT_BACKGROUND,
  backgroundHover: '#f6f6f7',
  foreground: '#2b2233',
  border: '1.5px solid rgba(41, 35, 47, 0.13)',
  boxShadow: '0px 4px 24px 0px rgba(43, 34, 51, 0.12)',

  success: '#268d75',
  error: '#df3338',

  submitBackground: 'rgba(88, 74, 192, 1)',
  submitBackgroundHover: SUBMIT_COLOR,
  submitBorder: SUBMIT_COLOR,
  submitOutlineFocus: '#29232f',
  submitForeground: LIGHT_BACKGROUND,
  submitForegroundHover: LIGHT_BACKGROUND,

  cancelBackground: 'transparent',
  cancelBackgroundHover: 'var(--background-hover)',
  cancelBorder: 'var(--border)',
  cancelOutlineFocus: 'var(--input-outline-focus)',
  cancelForeground: 'var(--foreground)',
  cancelForegroundHover: 'var(--foreground)',

  inputBackground: INHERIT,
  inputForeground: INHERIT,
  inputBorder: 'var(--border)',
  inputOutlineFocus: SUBMIT_COLOR,
};

export const DEFAULT_THEME = {
  light: LIGHT_THEME,
  dark: {
    ...LIGHT_THEME,

    background: '#29232f',
    backgroundHover: '#352f3b',
    foreground: '#ebe6ef',
    border: '1.5px solid rgba(235, 230, 239, 0.15)',

    success: '#2da98c',
    error: '#f55459',
  },
};

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

export const FEEDBACK_WIDGET_SOURCE = 'widget';
export const FEEDBACK_API_SOURCE = 'api';
