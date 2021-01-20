/**
 * @external https://develop.sentry.dev/sdk/event-payloads/exception/#exception-mechanism
 */
export interface Mechanism {
  /**
   * Unique identifier of this mechanism determining rendering and processing of the mechanism data.
   */
  type: string;

  /**
   * Human-readable description of the error mechanism and a possible hint on how to solve this error.
   */
  description?: string;

  /**
   * Human-readable description of the error mechanism and a possible hint on how to solve this error.
   */
  helpLink?: string;

  /**
   * Flag indicating whether the user has handled the exception (for example, via try ... catch).
   */
  handled?: boolean;

  /**
   * An flag indicating that this error is synthetic.
   * Synthetic errors are errors that carry little meaning by themselves.
   * This may be because they are created at a central place (like a crash handler),
   * and are all called the same: Error, Segfault etc.
   * When the flag is set,
   * Sentry will then try to use other information (top in-app frame function)
   * rather than exception type and value in the UI for the primary event display.
   * This flag should be set for all "segfaults" for instance as every
   * single error group would look very similar otherwise.
   */
  synthetic?: boolean;

  /**
   * Information from the operating system or runtime on the exception mechanism.
   */
  meta?: MechanismMeta;

  /**
   * Arbitrary extra data that might help the user understand the error thrown by this mechanism.
   */
  data?: Record<string, unknown>;
}

export interface MechanismMeta {
  /**
   * Information on the POSIX signal.
   * On Apple systems, signals also carry a code in addition to the signal number describing the signal in more detail.
   * On Linux, this code does not exist.
   */
  signal?: MechanismMetaSignal;

  /**
   * A Mach Exception on Apple systems comprising a code triple and optional descriptions.
   */
  mach_exception?: MechanismMetaMachException;

  /**
   * Error codes set by Linux system calls and some library functions as
   * specified in ISO C99, POSIX.1-2001, and POSIX.1-2008.
   * See errno(3) for more information.
   */
  errno?: MechanismMetaErrorNo;
}

/**
 * @external https://develop.sentry.dev/sdk/event-payloads/exception/#meta-information
 */
export interface MechanismMetaSignal {
  /**
   * The POSIX signal number.
   */
  number: number;

  /**
   * Apple signal code.
   */
  code?: string;

  /**
   * Name of the signal based on the signal number.
   */
  name?: string;

  /**
   * Name of the signal code.
   */
  code_name?: string;
}

/**
 * @external https://develop.sentry.dev/sdk/event-payloads/exception/#meta-information
 */
export interface MechanismMetaMachException {
  /**
   * Numeric exception number.
   */
  exception: number;

  /**
   * Numeric exception code.
   */
  code: number;

  /**
   * Numeric exception subcode.
   */
  subcode: number;

  /**
   * Name of the exception constant in iOS / macOS.
   */
  name?: string;
}

/**
 * @external https://develop.sentry.dev/sdk/event-payloads/exception/#meta-information
 */
export interface MechanismMetaErrorNo {
  /**
   * The error number
   */
  number: number;

  /**
   * Name of the error
   */
  name?: string;
}
