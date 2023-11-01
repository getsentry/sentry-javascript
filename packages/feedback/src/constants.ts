const LIGHT_BORDER = '1.5px solid rgba(41, 35, 47, 0.13)';
const LIGHT_BACKGROUND_HOVER = '#f6f6f7';
const LIGHT_FOREGROUND = '#2B2233';

const DARK_BACKGROUND_HOVER = '#352f3b';
const DARK_BORDER = '1.5px solid rgba(235, 230, 239, 0.15)';
const DARK_FOREGROUND = '#EBE6EF';

const SUBMIT_FOREGROUND = '#ffffff';

export const DEFAULT_THEME = {
  light: {
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    fontSize: '14px',
    background: '#ffffff',
    backgroundHover: LIGHT_BACKGROUND_HOVER,

    submitButtonBackground: 'rgba(88, 74, 192, 1)',
    submitButtonBackgroundHover: 'rgba(108, 95, 199, 1)',
    submitButtonBorder: 'rgba(108, 95, 199, 1)',
    submitButtonForeground: SUBMIT_FOREGROUND,

    cancelButtonBackground: 'transparent',
    cancelButtonBackgroundHover: LIGHT_BACKGROUND_HOVER,
    cancelButtonBorder: LIGHT_BORDER,
    cancelButtonForeground: LIGHT_FOREGROUND,

    foreground: LIGHT_FOREGROUND,
    success: '#268d75',
    error: '#df3338',
    border: LIGHT_BORDER,
    boxShadow: '0px 4px 24px 0px rgba(43, 34, 51, 0.12)',
  },
  dark: {
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    fontSize: '14px',
    background: '#29232f',
    backgroundHover: DARK_BACKGROUND_HOVER,
    foreground: DARK_FOREGROUND,

    submitButtonBackground: 'rgba(88, 74, 192, 1)',
    submitButtonBackgroundHover: 'rgba(108, 95, 199, 1)',
    submitButtonBorder: 'rgba(108, 95, 199, 1)',
    submitButtonForeground: SUBMIT_FOREGROUND,

    cancelButtonBackground: 'transparent',
    cancelButtonBackgroundHover: DARK_BACKGROUND_HOVER,
    cancelButtonBorder: DARK_BORDER,
    cancelButtonForeground: DARK_FOREGROUND,

    success: '#2da98c',
    error: '#f55459',
    border: DARK_BORDER,
    boxShadow: '0px 4px 24px 0px rgba(43, 34, 51, 0.12)',
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
