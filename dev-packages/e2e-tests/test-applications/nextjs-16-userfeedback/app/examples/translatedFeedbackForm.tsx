'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

type FeedbackIntegration = ReturnType<typeof Sentry.getFeedback>;

export default function TranslatedFeedbackForm() {
  const [feedback, setFeedback] = useState<FeedbackIntegration>();
  // Read `getFeedback` on the client only, to avoid hydration errors when server rendering
  useEffect(() => {
    setFeedback(Sentry.getFeedback());
  }, []);

  // Don't render custom feedback button if Feedback integration isn't installed
  if (!feedback) {
    return null;
  }

  return (
    <button
      className="hover:bg-hover px-4 py-2 rounded-md"
      type="button"
      data-testid="translated-feedback-button"
      onClick={async () => {
        const form = await feedback.createForm({
          tags: { component: 'TranslatedFeedbackForm' },
          triggerLabel: 'Lets get started',
          triggerAriaLabel: 'Send it!',
          cancelButtonLabel: 'Nevermind',
          submitButtonLabel: 'Send it!',
          confirmButtonLabel: 'I confirm',
          formTitle: 'Feedback Test Area',
          emailLabel: 'Email or contact info',
          emailPlaceholder: 'you@example.com or (555) 555-5555',
          messageLabel: "What's up?",
          messagePlaceholder: 'Tell me about it',
          nameLabel: 'Who dis?',
          namePlaceholder: 'Name, nickname, etc.',
          successMessageText: 'Thanks, we got it!',
          isRequiredLabel: 'critical',
          addScreenshotButtonLabel: 'Add a pic',
          removeScreenshotButtonLabel: 'Drop the pic',
        });
        form.appendToDom();
        form.open();
      }}
    >
      Give me feedback (translated)
    </button>
  );
}
