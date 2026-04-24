export type FeedbackErrorCode =
  | 'ERROR_EMPTY_MESSAGE'
  | 'ERROR_NO_CLIENT'
  | 'ERROR_TIMEOUT'
  | 'ERROR_FORBIDDEN'
  | 'ERROR_GENERIC';

export function createFeedbackError(reason: FeedbackErrorCode): Error {
  return new Error(reason);
}
