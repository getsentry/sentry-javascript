const INHERIT = 'inherit';
const PURPLE = 'rgba(88, 74, 192, 1)';
const PURPLE_HOVER = 'rgba(108, 95, 199, 1)';

export const LIGHT_THEME = {
  foreground: '#2b2233',
  successForeground: '#268d75',
  errorForeground: '#df3338',
  background: '#ffffff',
  border: '1.5px solid rgba(41, 35, 47, 0.13)',
  boxShadow: '0px 4px 24px 0px rgba(43, 34, 51, 0.12)',

  backgroundHover: '#f6f6f7',
  borderRadius: '25px',

  inputForeground: INHERIT,
  inputBackground: INHERIT,
  inputBackgroundHover: INHERIT,
  inputBackgroundFocus: INHERIT,
  inputBorder: 'var(--border)',
  inputBorderRadius: '6px',
  inputOutlineFocus: PURPLE_HOVER,

  buttonForeground: INHERIT,
  buttonForegroundHover: INHERIT,
  buttonBackground: 'var(--background)',
  buttonBackgroundHover: '#f6f6f7',
  buttonBorder: 'var(--border)',
  buttonOutlineFocus: 'var(--input-outline-focus)',

  submitForeground: '#ffffff',
  submitForegroundHover: '#ffffff',
  submitBackground: PURPLE,
  submitBackgroundHover: PURPLE_HOVER,
  submitBorder: PURPLE_HOVER,
  submitBorderRadius: 'var(--button-border-radius)',
  submitOutlineFocus: '#29232f',

  triggerBackground: 'var(--background)',
  triggerBackgroundHover: 'var(--button-background-hover)',
  triggerBorderRadius: '1.7em/50%',

  dialogBackground: 'var(--background)',
  dialogBorderRadius: '20px',
};

export const DEFAULT_THEME = {
  light: LIGHT_THEME,
  dark: {
    ...LIGHT_THEME,

    foreground: '#ebe6ef',
    successForeground: '#2da98c',
    errorForeground: '#f55459',
    background: '#29232f',
    border: '1.5px solid rgba(235, 230, 239, 0.15)',
    boxShadow: '0px 4px 24px 0px rgba(43, 34, 51, 0.12)',

    buttonBackgroundHover: '#352f3b',
  },
};
