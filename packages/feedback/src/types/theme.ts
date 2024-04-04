export interface FeedbackTheme {
  /**
   * Font family for widget
   */
  fontFamily: string;
  /**
   * Font size for widget
   */
  fontSize: string;
  /**
   * Background color for actor and dialog
   */
  background: string;
  /**
   * Background color on hover
   */
  backgroundHover: string;
  /**
   * Border styling for actor and dialog
   */
  border: string;
  /**
   * Border radius styling for actor
   */
  borderRadius: string;
  /**
   * Box shadow for actor and dialog
   */
  boxShadow: string;
  /**
   * Foreground color (i.e. text color)
   */
  foreground: string;
  /**
   * Success color
   */
  success: string;
  /**
   * Error color
   */
  error: string;

  /**
   * Background color for the submit button
   */
  submitBackground: string;
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
  /**
   * Foreground color for the submit button
   */
  submitForeground: string;

  /**
   * Foreground color for the submit button, in the hover state
   */
  submitForegroundHover: string;

  /**
   * Background color for the cancel button
   */
  cancelBackground: string;
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
  /**
   * Foreground color for the cancel button
   */
  cancelForeground: string;
  /**
   * Foreground color for the cancel button, in the hover state
   */
  cancelForegroundHover: string;

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
  /**
   * Border radius for dialog
   */
  formBorderRadius: string;
  /**
   * Border radius for form inputs
   */
  formContentBorderRadius: string;
}
