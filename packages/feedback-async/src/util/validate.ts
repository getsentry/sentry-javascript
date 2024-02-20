import type { FeedbackFormData, FeedbackInternalOptions } from '../types';

/**
 * Validate that a given feedback submission has the required fields
 */
export function getMissingFields(feedback: FeedbackFormData, options: FeedbackInternalOptions): string[] {
  const emptyFields = [];
  if (options.isNameRequired && !feedback.name) {
    emptyFields.push(options.nameLabel);
  }
  if (options.isEmailRequired && !feedback.email) {
    emptyFields.push(options.emailLabel);
  }
  if (!feedback.message) {
    emptyFields.push(options.messageLabel);
  }

  return emptyFields;
}
