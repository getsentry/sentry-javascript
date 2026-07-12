import type { FeedbackInternalOptions } from '@sentry/core';
import type { VNode } from 'preact';
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars

interface Props {
  options: FeedbackInternalOptions;
  onFileSelected: (file: File) => void;
}

export function ScreenshotFallback({ options, onFileSelected }: Props): VNode {
  return (
    <label class="screenshot-fallback">
      {options.addScreenshotButtonLabel}
      <input
        accept="image/*"
        aria-label={options.addScreenshotButtonLabel}
        class="screenshot-fallback__input"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            onFileSelected(file);
          }
        }}
        type="file"
      />
    </label>
  );
}
