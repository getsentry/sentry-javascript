export interface ExtensionEvent {
  eventType?: string;
  /** Absolute Unix ms. On SHUTDOWN, when Lambda SIGKILLs the process. */
  deadlineMs?: number;
}

/** Why `run` stopped polling. Only `shutdown` means the environment is going away. */
export interface PollOutcome {
  reason: 'shutdown' | 'unrecoverable';
  /**
   * Whether the Extensions API ever took a poll from us. Lambda releases the init phase on the
   * first one it accepts, so until then this extension is what every invocation is waiting for.
   */
  pollAccepted: boolean;
  error?: unknown;
}

export interface ExtensionsApiRequest {
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

export interface ExtensionsApiResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export type EnvelopeHeader = {
  dsn?: string;
};
