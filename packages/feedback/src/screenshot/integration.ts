import type { FeedbackScreenshotIntegration, IntegrationFn } from '@sentry/core';
import type { Attachment } from '@sentry/core';
import type { h as hType } from 'preact';
import type * as Hooks from 'preact/hooks';
import { DOCUMENT } from '../constants';
import { ScreenshotEditorFactory } from './components/ScreenshotEditor';

export const feedbackScreenshotIntegration = ((): FeedbackScreenshotIntegration => {
  return {
    name: 'FeedbackScreenshot',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createInput: ({ h, hooks, dialog, options }) => {
      const imageBuffer = DOCUMENT.createElement('canvas');

      return {
        input: ScreenshotEditorFactory({
          h: h as typeof hType,
          hooks: hooks as typeof Hooks,
          imageBuffer,
          dialog,
          options,
        }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any

        value: async () => {
          const blob = await new Promise<Parameters<BlobCallback>[0]>(resolve => {
            imageBuffer.toBlob(resolve, 'image/png');
          });
          if (blob) {
            const data = new Uint8Array(await blob.arrayBuffer());
            const attachment: Attachment = {
              data,
              filename: 'screenshot.png',
              contentType: 'application/png',
              // attachmentType?: string;
            };
            return attachment;
          }
          return undefined;
        },
      };
    },
  };
}) satisfies IntegrationFn;
