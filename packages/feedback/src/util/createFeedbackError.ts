import type { FeedbackErrorCode, FeedbackErrorMessages } from '@sentry/core';
import {
  ERROR_EMPTY_MESSAGE_TEXT,
  ERROR_FORBIDDEN_TEXT,
  ERROR_GENERIC_TEXT,
  ERROR_NO_CLIENT_TEXT,
  ERROR_TIMEOUT_TEXT,
} from '../constants';

const DEFAULT_MESSAGES: Record<FeedbackErrorCode, string> = {
  ERROR_EMPTY_MESSAGE: ERROR_EMPTY_MESSAGE_TEXT,
  ERROR_NO_CLIENT: ERROR_NO_CLIENT_TEXT,
  ERROR_TIMEOUT: ERROR_TIMEOUT_TEXT,
  ERROR_FORBIDDEN: ERROR_FORBIDDEN_TEXT,
  ERROR_GENERIC: ERROR_GENERIC_TEXT,
};

export function resolveFeedbackErrorMessage(code: FeedbackErrorCode, messages?: FeedbackErrorMessages): string {
  return messages?.[code] ?? DEFAULT_MESSAGES[code];
}

export function createFeedbackError(code: FeedbackErrorCode, messages?: FeedbackErrorMessages): Error {
  return new Error(resolveFeedbackErrorMessage(code, messages));
}
