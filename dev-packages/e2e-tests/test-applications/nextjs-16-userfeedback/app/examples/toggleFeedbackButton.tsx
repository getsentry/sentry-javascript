'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function ToggleFeedbackButton() {
  const [feedback, setFeedback] = useState<ReturnType<typeof Sentry.getFeedback>>();
  // Read `getFeedback` on the client only, to avoid hydration errors when server rendering
  useEffect(() => {
    setFeedback(Sentry.getFeedback());
  }, []);

  const [widget, setWidget] = useState<null | { removeFromDom: () => void }>();
  return (
    <button
      className="hover:bg-hover px-4 py-2 rounded-md"
      type="button"
      data-testid="toggle-feedback-button"
      onClick={async () => {
        if (widget) {
          widget.removeFromDom();
          setWidget(null);
        } else if (feedback) {
          setWidget(
            feedback.createWidget({
              tags: { component: 'ToggleFeedbackButton' },
            }),
          );
        }
      }}
    >
      {widget ? 'Remove Widget' : 'Create Widget'}
    </button>
  );
}
