'use client';

import { useEffect, useState, useRef } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function AttachToFeedbackButton() {
  const [feedback, setFeedback] = useState<ReturnType<typeof Sentry.getFeedback>>();
  // Read `getFeedback` on the client only, to avoid hydration errors when server rendering
  useEffect(() => {
    setFeedback(Sentry.getFeedback());
  }, []);

  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (feedback && buttonRef.current) {
      const unsubscribe = feedback.attachTo(buttonRef.current, {
        tags: { component: 'AttachToFeedbackButton' },
        onSubmitSuccess: data => {
          console.log('onSubmitSuccess', data);
        },
      });
      return unsubscribe;
    }
    return () => {};
  }, [feedback]);

  return (
    <button
      className="hover:bg-hover px-4 py-2 rounded-md"
      type="button"
      ref={buttonRef}
      data-testid="attach-to-button"
    >
      Give me feedback (attachTo)
    </button>
  );
}
