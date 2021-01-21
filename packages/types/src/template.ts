/**
 * Template interface is useful for template engine specific reporting when
 * regular stack traces do not contain template data.
 * @external https://develop.sentry.dev/sdk/event-payloads/template/
 */
export interface Template {
  /**
   * The line number of the call.
   */
  lineno: number;

  /**
   * The absolute path to the template on the file system.
   */
  abs_path?: string;

  /**
   * The filename as it was passed to the template loader.
   */
  filename: string;

  /**
   * Source code in filename at lineno.
   */
  context_line: string;

  /**
   * A list of source code lines before context_line (in order) –
   * usually [lineno - 5:lineno].
   */
  pre_context?: string[];

  /**
   * A list of source code lines after context_line (in order) –
   * usually [lineno + 1:lineno + 5].
   */
  post_context: string[];
}
