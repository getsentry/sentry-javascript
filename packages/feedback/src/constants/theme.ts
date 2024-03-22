const LIGHT_BACKGROUND = '#ffffff';
const INHERIT = 'inherit';
const SUBMIT_COLOR = 'rgba(108, 95, 199, 1)';

export const LIGHT_THEME = {
  fontFamily: "system-ui, 'Helvetica Neue', Arial, sans-serif",
  fontSize: '14px',

  background: LIGHT_BACKGROUND,
  backgroundHover: '#f6f6f7',
  foreground: '#2b2233',
  border: '1.5px solid rgba(41, 35, 47, 0.13)',
  borderRadius: '12px',
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

  formBorderRadius: '20px',
  formContentBorderRadius: '6px',
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
