'use client';

import * as Sentry from '@sentry/nextjs';

export default function MyFeedbackForm() {
  return (
    <form
      id="my-feedback-form"
      data-testid="my-feedback-form"
      onSubmit={async event => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        const attachment = async () => {
          const attachmentField = formData.get('attachment') as File;
          if (!attachmentField || attachmentField.size === 0) {
            return null;
          }
          const data = new Uint8Array(await attachmentField.arrayBuffer());
          const attachmentData = {
            data,
            filename: 'upload',
          };
          return attachmentData;
        };

        Sentry.getCurrentScope().setTags({ component: 'MyFeedbackForm' });
        const attachmentData = await attachment();
        Sentry.captureFeedback(
          {
            name: String(formData.get('name')),
            email: String(formData.get('email')),
            message: String(formData.get('message')),
          },
          attachmentData ? { attachments: [attachmentData] } : undefined,
        );
      }}
    >
      <input name="name" placeholder="Your Name" data-testid="my-form-name" />
      <input name="email" placeholder="Your Email" data-testid="my-form-email" />
      <textarea name="message" placeholder="What's the issue?" data-testid="my-form-message" />
      <input type="file" name="attachment" data-testid="my-form-attachment" />
      <button type="submit" data-testid="my-form-submit">
        Submit
      </button>
    </form>
  );
}
