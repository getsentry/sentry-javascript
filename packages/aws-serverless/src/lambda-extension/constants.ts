/** Extensions API endpoints sit under this path on `AWS_LAMBDA_RUNTIME_API`. */
export const EXTENSIONS_API_PATH = '/2020-01-01/extension';

/**
 * "Lambda uses the full file name of the extension to validate that the extension has completed
 * the bootstrap sequence", so this has to match the wrapper in `/opt/extensions/`.
 * https://docs.aws.amazon.com/lambda/latest/dg/runtimes-extensions-api.html#extensions-registration-api-a
 */
export const EXTENSION_NAME = 'sentry-extension';

export const POLL_RETRY_BASE_MS = 100;
export const POLL_RETRY_MAX_MS = 5_000;

/** A poll that outlasted the longest retry delay is the closest thing to a health signal here. */
export const POLL_ESTABLISHED_MS = POLL_RETRY_MAX_MS;

/**
 * Clear of the 900s function ceiling, so an outage spanning one whole maximum-length invocation
 * cannot trip it on its own.
 */
export const POLL_GIVE_UP_MS = 16 * 60_000;

/** A lifetime cap: the retry budget restarts on every established poll, so a per-streak one never would. */
export const MAX_REPORTED_FAILURES = 20;

/**
 * The only statuses the Extensions API documents for `/event/next` besides 200.
 * https://docs.aws.amazon.com/lambda/latest/dg/runtimes-extensions-api.html#extensions-api-next
 */
export const TERMINAL_POLL_STATUSES = [403, 500];

/** A poll issued while the environment is already tearing down is answered 500, and that clears. */
export const TERMINAL_POLL_CONFIRMATIONS = 3;

export const ERROR_BODY_MAX_LENGTH = 200;

/**
 * How far a compressed body is inflated: only the envelope's first line is ever read, and without a
 * bound a body expanding 1029:1 drove RSS to 3.1GiB, which on a 128MB function is an OOM the
 * platform reports as `Extension.Crash`.
 *
 * Sized from the header rather than picked: its one unbounded-looking field is `trace`, the
 * sampling context, whose source baggage `@sentry/core` caps at `MAX_BAGGAGE_STRING_LENGTH`. A
 * header saturating that cap measures 8,085 bytes against 1,273 for a typical one, so this leaves
 * roughly double the worst case a well-formed envelope can reach.
 */
export const ENVELOPE_HEADER_MAX_BYTES = 16 * 1024;

/** Detects a peer that vanished without a FIN/RST — the poll itself may carry no deadline. */
export const POLL_KEEPALIVE_MS = 30_000;

/** Where the SDK posts envelopes when the layer extension is in use. */
export const TUNNEL_PORT = 9000;

/** What `init` points `tunnel` at, so the two halves of the contract cannot drift apart. */
export const TUNNEL_URL = `http://localhost:${TUNNEL_PORT}/envelope`;

/**
 * Lambda's shutdown limit for a function with one or more registered external extensions; it
 * SIGKILLs whatever is still running at the end of it.
 * https://docs.aws.amazon.com/lambda/latest/dg/runtimes-extensions-api.html#runtimes-lifecycle-extensions-shutdown
 */
export const SHUTDOWN_BUDGET_MS = 2_000;

/** Headroom so the drain returns on its own terms rather than being SIGKILLed mid-upload. */
export const SHUTDOWN_MARGIN_MS = 200;

/** The runtime's SIGTERM handlers keep posting envelopes after the shutdown event arrives. */
export const SHUTDOWN_IDLE_GRACE_MS = 300;

/**
 * A runaway backstop, not a capacity plan. Nothing here caps in-flight uploads today, and no
 * measurement says what the right cap would be — the tunnel answers the SDK before its own upstream
 * request finishes, so this count is bounded by posting rate times upstream latency rather than by
 * anything the SDK holds. The number is therefore chosen, and only its relationship is derived: it
 * sits far above the 64 a single `@sentry/node` transport can hold in flight, so a well-behaved SDK
 * can never be refused an envelope it could legitimately have outstanding. A refusal is reported
 * like any other drop rather than swallowed.
 */
export const MAX_PENDING_UPLOADS = 1_000;

/**
 * Node's largest accepted timer delay; anything above it overflows and fires immediately. Used to
 * hold the event loop open with as few wakeups as possible when the extension has stopped polling
 * but must not exit.
 */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;
