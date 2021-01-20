/**
 * @external https://develop.sentry.dev/sdk/event-payloads/stacktrace/#frame-attributes
 */
export interface StackFrame {
  /**
   * The path to the source file relative to the project root directory.
   * The value should not make file names indistinguishable and should only change between releases for files that were actually renamed.
   * In some SDKs, this is implemented as the path relative to a certain entry point relevant to the language/platform.
   */
  filename?: string;

  /**
   * The name of the function being called.
   * This function name may be shortened or demangled. If not, Sentry will demangle and shorten it.
   * The original function name will be stored in rawFunction.
   */
  function?: string;

  /**
   * The original function name, if the function name is shortened or demangled.
   * Sentry shows the raw function when clicking on the shortened one in the UI.
   */
  raw_function?: string;

  /**
   * Platform-specific module path (e.g. sentry.interfaces.Stacktrace).
   */
  module?: string;

  /**
   * The line number of the call, starting at 1.
   */
  lineno?: number;

  /**
   * The column number of the call, starting at 1.
   */
  colno?: number;

  /**
   * The absolute path to the source file.
   */
  abs_path?: string;

  /**
   * Source code in filename at lineno.
   */
  context_line?: string;

  /**
   * A list of source code lines before context_line (in order) –
   * usually [lineno - 5:lineno].
   */
  pre_context?: string[];

  /**
   * A list of source code lines after context_line (in order) –
   * usually [lineno + 1:lineno + 5].
   */
  post_context?: string[];

  /**
   * Signals whether this frame is related to the execution of the relevant code in this stack trace.
   * For example, the frames that might power the framework’s web server of your app are probably not relevant.
   * However, calls to the framework’s library once you start handling code likely are relevant.
   */
  in_app?: boolean;

  /**
   * A mapping of variables which were available within this frame (usually context-locals).
   */
  vars?: Record<string, unknown>;

  /**
   * An instruction address for symbolication.
   * This should be a string with a hexadecimal number that includes a 0x prefix.
   * If this is set and a known image is defined in the Debug Meta Interface,
   * then symbolication can take place.
   * Note that the addr_mode attribute can control the behavior of this address.
   */
  instruction_addr?: string;

  /**
   * Optionally changes the addressing mode.
   * The default value is the same as "abs" which means absolute referencing.
   * This can also be set to "rel:DEBUG_ID" or "rel:IMAGE_INDEX" to make addresses relative to an object referenced by debug id or index.
   * This for instance is necessary for WASM processing as WASM does not use a unified address space.
   */
  addr_mode?: string;

  /**
   * An address that points to a symbol.
   * We use the instruction address for symbolication,
   * but this can be used to calculate an instruction offset automatically.
   * Note that the addr_mode attribute can control the behavior of this address.
   */
  symbol_addr?: string;

  /**
   * An address of the debug image to reference.
   */
  image_addr?: string;

  /**
   * The "package" the frame was contained in.
   * Depending on the platform, this can be different things.
   */
  package?: string;

  /**
   * This can override the platform for a single frame.
   * Otherwise, the platform of the event is assumed.
   * This can be used for multi-platform stack traces, such as in React Native.
   */
  platform?: string;
}
