import type { DsnLike } from './types/dsn';

/**
 * All properties the report dialog supports
 */
export interface ReportDialogOptions extends Record<string, unknown> {
  eventId?: string;
  dsn?: DsnLike;
  user?: {
    email?: string;
    name?: string;
  };
  lang?: string;
  title?: string;
  subtitle?: string;
  subtitle2?: string;
  labelName?: string;
  labelEmail?: string;
  labelComments?: string;
  labelClose?: string;
  labelSubmit?: string;
  errorGeneric?: string;
  errorFormEntry?: string;
  successMessage?: string;
  /** Callback after reportDialog showed up */
  onLoad?(this: void): void;
  /** Callback after reportDialog closed */
  onClose?(this: void): void;
  /**
   * Callback if the reportDialog cannot be shown. This happens when:
   * - there is no event ID (no `eventId` option and no event captured yet)
   * - the dialog script fails to load (e.g. blocked by an ad blocker or a network error)
   */
  onError?(this: void, error: Error): void;
}
