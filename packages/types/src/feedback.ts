import type { Event } from './event';

interface FeedbackContext extends Record<string, unknown> {
  message: string;
  contact_email?: string;
  name?: string;
  replay_id?: string;
  url?: string;
}

/**
 * NOTE: These types are still considered Alpha and subject to change.
 * @hidden
 */
export interface FeedbackEvent extends Event {
  type: 'feedback';
  contexts: Event['contexts'] & {
    feedback: FeedbackContext;
  };
}

export interface FeedbackComponent<T extends HTMLElement> {
  el: T | null;
}

export interface FeedbackDialogComponent extends FeedbackComponent<HTMLDialogElement> {
  showError: (message: string) => void;
  hideError: () => void;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}
