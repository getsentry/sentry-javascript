import type { Attachment, FeedbackScreenshotIntegration, IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { h as hType } from 'preact';
import type * as Hooks from 'preact/hooks';
import { DOCUMENT } from '../constants';
import { ScreenshotEditorFactory } from './components/ScreenshotEditor';

const _feedbackScreenshotIntegration = ((): FeedbackScreenshotIntegration => {
  return {
    name: 'FeedbackScreenshot' as const,
    setupOnce() {},
    createInput: ({ h, hooks, dialog, options }) => {
      const outputBuffer = DOCUMENT.createElement('canvas');

      return {
        input: ScreenshotEditorFactory({
          h: h as typeof hType,
          hooks: hooks as typeof Hooks,
          outputBuffer,
          dialog,
          options,
        }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any

        value: async () => {
          const blob = await new Promise<Parameters<BlobCallback>[0]>(resolve => {
            outputBuffer.toBlob(resolve, 'image/png');
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

export const feedbackScreenshotIntegration = defineIntegration(
  _feedbackScreenshotIntegration,
) as typeof _feedbackScreenshotIntegration;
