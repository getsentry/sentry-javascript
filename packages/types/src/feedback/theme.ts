interface BaseStyles {
  /**
   * Foreground color (i.e. text color)
   */
  foreground: string;

  /**
   * Success color
   */
  successForeground: string;

  /**
   * Error color
   */
  errorForeground: string;

  /**
   * Background color for actor and dialog
   */
  background: string;

  /**
   * Border styling for actor and dialog
   */
  border: string;

  /**
   * Box shadow for actor and dialog
   */
  boxShadow: string;
}

interface Input {
  /**
   * Foreground color for form inputs
   */
  inputForeground: string;

  /**
   * Background color for form inputs
   */
  inputBackground: string;

  /**
   * Background color for form inputs, in the hover state
   */
  inputBackgroundHover: string;

  /**
   * Background color for form inputs, in the focus state
   */
  inputBackgroundFocus: string;

  /**
   * Border styles for form inputs
   */
  inputBorder: string;

  /**
   * Border radius for form inputs
   */
  inputBorderRadius: string;

  /**
   * Border styles for form inputs when focused
   */
  inputOutlineFocus: string;
}

interface Button {
  /**
   * Foreground color for buttons
   */
  buttonForeground: string;

  /**
   * Foreground color for buttons, in the hover state
   */
  buttonForegroundHover: string;

  /**
   * Background color for buttons
   */
  buttonBackground: string;

  /**
   * Background color when hovering over buttons
   */
  buttonBackgroundHover: string;

  /**
   * Border style for buttons
   */
  buttonBorder: string;

  /**
   * Border style for buttons, in the focued state
   */
  buttonOutlineFocus: string;
}

interface SubmitButton {
  /**
   * Foreground color for submit buttons
   */
  submitForeground: string;

  /**
   * Foreground color for submit buttons, in the hover state
   */
  submitForegroundHover: string;

  /**
   * Background color for submit buttons
   */
  submitBackground: string;

  /**
   * Background color when hovering over submit buttons
   */
  submitBackgroundHover: string;

  /**
   * Border style for submit buttons
   */
  submitBorder: string;

  /**
   * Border style for submit buttons, in the focued state
   */
  submitOutlineFocus: string;
}

interface Trigger {
  /**
   * Background color of the actor button
   */
  triggerBackground: string;

  /**
   * Background color on hover
   */
  triggerBackgroundHover: string;

  /**
   * Border radius styling for actor
   */
  triggerBorderRadius: string;
}

interface Dialog {
  /**
   * Background color of the open dialog
   */
  dialogBackground: string;

  /**
   * Border radius for dialog
   */
  dialogBorderRadius: string;
}

export interface FeedbackTheme extends BaseStyles, Input, Button, SubmitButton, Trigger, Dialog {}
