const LIGHT_BACKGROUND = '#ffffff';
const INHERIT = 'inherit';
const SUBMIT_COLOR = 'rgba(108, 95, 199, 1)';

export const LIGHT_THEME = {
  fontFamily: "system-ui, 'Helvetica Neue', Arial, sans-serif",
  fontSize: '14px',

  foreground: '#2b2233',
  background: LIGHT_BACKGROUND,
  success: '#268d75',
  error: '#df3338',

  zIndex: 100000,
  border: '1.5px solid rgba(41, 35, 47, 0.13)',
  boxShadow: '0px 4px 24px 0px rgba(43, 34, 51, 0.12)',

  backgroundHover: '#f6f6f7',
  borderRadius: '25px',

  formBorderRadius: '20px',
  formContentBorderRadius: '6px',

  submitForeground: LIGHT_BACKGROUND,
  submitBackground: 'rgba(88, 74, 192, 1)',
  submitForegroundHover: LIGHT_BACKGROUND,
  submitBackgroundHover: SUBMIT_COLOR,
  submitBorder: SUBMIT_COLOR,
  submitOutlineFocus: '#29232f',

  cancelForeground: 'var(--foreground)',
  cancelBackground: 'transparent',
  cancelForegroundHover: 'var(--foreground)',
  cancelBackgroundHover: 'var(--background-hover)',
  cancelBorder: 'var(--border)',
  cancelOutlineFocus: 'var(--input-outline-focus)',

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
