'use client';

import type { RefObject } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useEffect, useRef, useState } from 'react';

export default function FeedbackButton() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useFeedbackWidget({
    buttonRef,
    options: {
      tags: {
        component: 'FeedbackButton',
      },
    },
  });

  return (
    <button ref={buttonRef} data-testid="feedback-button">
      Give Feedback
    </button>
  );
}

function useFeedbackWidget({
  buttonRef,
  options = {},
}: {
  buttonRef?: RefObject<HTMLButtonElement | null> | RefObject<HTMLAnchorElement | null>;
  options?: {
    tags?: Record<string, string>;
  };
}) {
  const [feedback, setFeedback] = useState<ReturnType<typeof Sentry.getFeedback>>();
  // Read `getFeedback` on the client only, to avoid hydration errors when server rendering
  useEffect(() => {
    setFeedback(Sentry.getFeedback());
  }, []);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    if (buttonRef) {
      if (buttonRef.current) {
        return feedback.attachTo(buttonRef.current, options);
      }
    } else {
      const widget = feedback.createWidget(options);
      return () => {
        widget.removeFromDom();
      };
    }

    return undefined;
  }, [buttonRef, feedback, options]);

  return feedback;
}
