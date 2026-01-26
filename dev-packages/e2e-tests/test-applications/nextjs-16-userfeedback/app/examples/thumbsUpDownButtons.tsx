'use client';

import * as Sentry from '@sentry/nextjs';
import { Fragment, useEffect, useState } from 'react';

export default function ThumbsUpDownButtons() {
  const [feedback, setFeedback] = useState<ReturnType<typeof Sentry.getFeedback>>();
  // Read `getFeedback` on the client only, to avoid hydration errors when server rendering
  useEffect(() => {
    setFeedback(Sentry.getFeedback());
  }, []);

  return (
    <Fragment>
      <strong>Was this helpful?</strong>
      <button
        title="I like this"
        data-testid="thumbs-up-button"
        onClick={async () => {
          const form = await feedback?.createForm({
            messagePlaceholder: 'What did you like most?',
            tags: {
              component: 'ThumbsUpDownButtons',
              'feedback.type': 'positive',
            },
          });
          form?.appendToDom();
          form?.open();
        }}
      >
        Yes
      </button>

      <button
        title="I don't like this"
        data-testid="thumbs-down-button"
        onClick={async () => {
          const form = await feedback?.createForm({
            messagePlaceholder: 'How can we improve?',
            tags: {
              component: 'ThumbsUpDownButtons',
              'feedback.type': 'negative',
            },
          });
          form?.appendToDom();
          form?.open();
        }}
      >
        No
      </button>
    </Fragment>
  );
}
