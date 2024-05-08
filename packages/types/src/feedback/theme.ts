interface BaseStyles {
  /**
   * Font family for widget
   */
  fontFamily: string;

  /**
   * Font size for widget
   */
  fontSize: string;

  /**
   * Foreground color (i.e. text color)
   */
  foreground: string;

  /**
   * Background color for actor and dialog
   */
  background: string;

  /**
   * Success color
   */
  success: string;

  /**
   * Error color
   */
  error: string;
}

interface ActorAndModal {
  /**
   * z-index of the floating Actor or Modal
   */
  zIndex: number;

  /**
   * Border styling for actor and dialog
   */
  border: string;

  /**
   * Box shadow for actor and dialog
   */
  boxShadow: string;
}

interface ActorButton {
  /**
   * Background color on hover
   */
  backgroundHover: string;

  /**
   * Border radius styling for actor
   */
  borderRadius: string;
}

interface Modal {
  /**
   * Border radius for dialog
   */
  formBorderRadius: string;

  /**
   * Border radius for form inputs
   */
  formContentBorderRadius: string;
}

interface SubmitButton {
  /**
   * Foreground color for the submit button
   */
  submitForeground: string;

  /**
   * Background color for the submit button
   */
  submitBackground: string;

  /**
   * Foreground color for the submit button, in the hover state
   */
  submitForegroundHover: string;

  /**
   * Background color when hovering over the submit button
   */
  submitBackgroundHover: string;

  /**
   * Border style for the submit button
   */
  submitBorder: string;

  /**
   * Border style for the submit button, in the focued state
   */
  submitOutlineFocus: string;
}

interface CancelButton {
  /**
   * Foreground color for the cancel button
   */
  cancelForeground: string;

  /**
   * Background color for the cancel button
   */
  cancelBackground: string;

  /**
   * Foreground color for the cancel button, in the hover state
   */
  cancelForegroundHover: string;

  /**
   * Background color when hovering over the cancel button
   */
  cancelBackgroundHover: string;

  /**
   * Border style for the cancel button
   */
  cancelBorder: string;

  /**
   * Border style for the cancel button, in the focued state
   */
  cancelOutlineFocus: string;
}

interface Input {
  /**
   * Background color for form inputs
   */
  inputBackground: string;

  /**
   * Foreground color for form inputs
   */
  inputForeground: string;

  /**
   * Border styles for form inputs
   */
  inputBorder: string;

  /**
   * Border styles for form inputs when focused
   */
  inputOutlineFocus: string;
}

export interface FeedbackTheme
  extends BaseStyles,
    ActorAndModal,
    ActorButton,
    Modal,
    SubmitButton,
    CancelButton,
    Input {}
