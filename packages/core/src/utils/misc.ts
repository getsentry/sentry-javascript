import type { Event } from '../types-hoist/event';
import type { Exception } from '../types-hoist/exception';
import type { Mechanism } from '../types-hoist/mechanism';
import type { StackFrame } from '../types-hoist/stackframe';
import { addNonEnumerableProperty } from './object';
import { snipLine } from './string';
import { GLOBAL_OBJ } from './worldwide';

interface CryptoInternal {
  getRandomValues(array: Uint8Array): Uint8Array;
  randomUUID?(): string;
}

/** An interface for common properties on global */
interface CryptoGlobal {
  msCrypto?: CryptoInternal;
  crypto?: CryptoInternal;
}

function getCrypto(): CryptoInternal | undefined {
  const gbl = GLOBAL_OBJ as typeof GLOBAL_OBJ & CryptoGlobal;
  return gbl.crypto || gbl.msCrypto;
}

/**
 * UUID4 generator
 * @param crypto Object that provides the crypto API.
 * @returns string Generated UUID4.
 */
export function uuid4(crypto = getCrypto()): string {
  let getRandomByte = (): number => Math.random() * 16;
  try {
    if (crypto?.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '');
    }
    if (crypto?.getRandomValues) {
      getRandomByte = () => {
        // crypto.getRandomValues might return undefined instead of the typed array
        // in old Chromium versions (e.g. 23.0.1235.0 (151422))
        // However, `typedArray` is still filled in-place.
        // @see https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues#typedarray
        const typedArray = new Uint8Array(1);
        crypto.getRandomValues(typedArray);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return typedArray[0]!;
      };
    }
  } catch {
    // some runtimes can crash invoking crypto
    // https://github.com/getsentry/sentry-javascript/issues/8935
  }

  // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/2117523#2117523
  // Concatenating the following numbers as strings results in '10000000100040008000100000000000'
  return (([1e7] as unknown as string) + 1e3 + 4e3 + 8e3 + 1e11).replace(/[018]/g, c =>
    // eslint-disable-next-line no-bitwise
    ((c as unknown as number) ^ ((getRandomByte() & 15) >> ((c as unknown as number) / 4))).toString(16),
  );
}

function getFirstException(event: Event): Exception | undefined {
  return event.exception?.values?.[0];
}

/**
 * Extracts either message or type+value from an event that can be used for user-facing logs
 * @returns event's description
 */
export function getEventDescription(event: Event): string {
  const { message, event_id: eventId } = event;
  if (message) {
    return message;
  }

  const firstException = getFirstException(event);
  if (firstException) {
    if (firstException.type && firstException.value) {
      return `${firstException.type}: ${firstException.value}`;
    }
    return firstException.type || firstException.value || eventId || '<unknown>';
  }
  return eventId || '<unknown>';
}

/**
 * Adds exception values, type and value to an synthetic Exception.
 * @param event The event to modify.
 * @param value Value of the exception.
 * @param type Type of the exception.
 * @hidden
 */
export function addExceptionTypeValue(event: Event, value?: string, type?: string): void {
  const exception = (event.exception = event.exception || {});
  const values = (exception.values = exception.values || []);
  const firstException = (values[0] = values[0] || {});
  if (!firstException.value) {
    firstException.value = value || '';
  }
  if (!firstException.type) {
    firstException.type = type || 'Error';
  }
}

/**
 * Adds exception mechanism data to a given event. Uses defaults if the second parameter is not passed.
 *
 * @param event The event to modify.
 * @param newMechanism Mechanism data to add to the event.
 * @hidden
 */
export function addExceptionMechanism(event: Event, newMechanism?: Partial<Mechanism>): void {
  const firstException = getFirstException(event);
  if (!firstException) {
    return;
  }

  const defaultMechanism = { type: 'generic', handled: true };
  const currentMechanism = firstException.mechanism;
  firstException.mechanism = { ...defaultMechanism, ...currentMechanism, ...newMechanism };

  if (newMechanism && 'data' in newMechanism) {
    const mergedData = { ...currentMechanism?.data, ...newMechanism.data };
    firstException.mechanism.data = mergedData;
  }
}

// https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const SEMVER_REGEXP =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Represents Semantic Versioning object
 */
interface SemVer {
  major?: number;
  minor?: number;
  patch?: number;
  prerelease?: string;
  buildmetadata?: string;
}

function _parseInt(input: string | undefined): number {
  return parseInt(input || '', 10);
}

/**
 * Parses input into a SemVer interface
 * @param input string representation of a semver version
 */
export function parseSemver(input: string): SemVer {
  const match = input.match(SEMVER_REGEXP) || [];
  const major = _parseInt(match[1]);
  const minor = _parseInt(match[2]);
  const patch = _parseInt(match[3]);
  return {
    buildmetadata: match[5],
    major: isNaN(major) ? undefined : major,
    minor: isNaN(minor) ? undefined : minor,
    patch: isNaN(patch) ? undefined : patch,
    prerelease: match[4],
  };
}

/**
 * This function adds context (pre/post/line) lines to the provided frame
 *
 * @param lines string[] containing all lines
 * @param frame StackFrame that will be mutated
 * @param linesOfContext number of context lines we want to add pre/post
 */
export function addContextToFrame(lines: string[], frame: StackFrame, linesOfContext: number = 5): void {
  // When there is no line number in the frame, attaching context is nonsensical and will even break grouping
  if (frame.lineno === undefined) {
    return;
  }

  const maxLines = lines.length;
  const sourceLine = Math.max(Math.min(maxLines - 1, frame.lineno - 1), 0);

  frame.pre_context = lines
    .slice(Math.max(0, sourceLine - linesOfContext), sourceLine)
    .map((line: string) => snipLine(line, 0));

  // We guard here to ensure this is not larger than the existing number of lines
  const lineIndex = Math.min(maxLines - 1, sourceLine);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  frame.context_line = snipLine(lines[lineIndex]!, frame.colno || 0);

  frame.post_context = lines
    .slice(Math.min(sourceLine + 1, maxLines), sourceLine + 1 + linesOfContext)
    .map((line: string) => snipLine(line, 0));
}

/**
 * Checks whether or not we've already captured the given exception (note: not an identical exception - the very object
 * in question), and marks it captured if not.
 *
 * This is useful because it's possible for an error to get captured by more than one mechanism. After we intercept and
 * record an error, we rethrow it (assuming we've intercepted it before it's reached the top-level global handlers), so
 * that we don't interfere with whatever effects the error might have had were the SDK not there. At that point, because
 * the error has been rethrown, it's possible for it to bubble up to some other code we've instrumented. If it's not
 * caught after that, it will bubble all the way up to the global handlers (which of course we also instrument). This
 * function helps us ensure that even if we encounter the same error more than once, we only record it the first time we
 * see it.
 *
 * Note: It will ignore primitives (always return `false` and not mark them as seen), as properties can't be set on
 * them. {@link: Object.objectify} can be used on exceptions to convert any that are primitives into their equivalent
 * object wrapper forms so that this check will always work. However, because we need to flag the exact object which
 * will get rethrown, and because that rethrowing happens outside of the event processing pipeline, the objectification
 * must be done before the exception captured.
 *
 * @param A thrown exception to check or flag as having been seen
 * @returns `true` if the exception has already been captured, `false` if not (with the side effect of marking it seen)
 */
export function checkOrSetAlreadyCaught(exception: unknown): boolean {
  if (isAlreadyCaptured(exception)) {
    return true;
  }

  try {
    // set it this way rather than by assignment so that it's not ennumerable and therefore isn't recorded by the
    // `ExtraErrorData` integration
    addNonEnumerableProperty(exception as { [key: string]: unknown }, '__sentry_captured__', true);
  } catch {
    // `exception` is a primitive, so we can't mark it seen
  }

  return false;
}

function isAlreadyCaptured(exception: unknown): boolean | void {
  try {
    return (exception as { __sentry_captured__?: boolean }).__sentry_captured__;
  } catch {} // eslint-disable-line no-empty
}
