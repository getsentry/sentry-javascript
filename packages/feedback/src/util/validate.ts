import type { FeedbackFormData, FeedbackInternalOptions } from '../types';

export type Props = Pick<
  FeedbackInternalOptions,
  'emailLabel' | 'isEmailRequired' | 'isNameRequired' | 'messageLabel' | 'nameLabel'
>;

/**
 * Validate that a given feedback submission has the required fields
 */
export function getMissingFields(feedback: FeedbackFormData, props: Props): string[] {
  const emptyFields = [];
  if (props.isNameRequired && !feedback.name) {
    emptyFields.push(props.nameLabel);
  }
  if (props.isEmailRequired && !feedback.email) {
    emptyFields.push(props.emailLabel);
  }
  if (!feedback.message) {
    emptyFields.push(props.messageLabel);
  }

  return emptyFields;
}
