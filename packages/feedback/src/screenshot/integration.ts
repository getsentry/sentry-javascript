import type { Attachment, FeedbackScreenshotIntegration, IntegrationFn } from '@sentry/core';
import type { h as hType } from 'preact';
import type * as Hooks from 'preact/hooks';
import { DOCUMENT } from '../constants';
import { ScreenshotEditorFactory } from './components/ScreenshotEditor';

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read screenshot file'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read screenshot file'));
    reader.readAsArrayBuffer(file);
  });
}

export const feedbackScreenshotIntegration = ((): FeedbackScreenshotIntegration => {
  return {
    name: 'FeedbackScreenshot' as const,
    setupOnce() {},
    createInput: ({ h, hooks, dialog, options }) => {
      const outputBuffer = DOCUMENT.createElement('canvas');
      let selectedFile: File | undefined;
      let hasCapturedScreenshot = false;

      const reset = (): void => {
        selectedFile = undefined;
        hasCapturedScreenshot = false;
        outputBuffer.width = 0;
        outputBuffer.height = 0;
      };

      return {
        input: ScreenshotEditorFactory({
          h: h as typeof hType,
          hooks: hooks as typeof Hooks,
          outputBuffer,
          dialog,
          options,
          onScreenshotStart: reset,
          onScreenshotCaptured: () => {
            selectedFile = undefined;
            hasCapturedScreenshot = true;
          },
          onFileSelected: file => {
            selectedFile = file;
            hasCapturedScreenshot = false;
          },
          onReset: reset,
        }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any

        value: async () => {
          if (selectedFile) {
            return {
              data: new Uint8Array(await readFile(selectedFile)),
              filename: selectedFile.name,
              contentType: selectedFile.type || 'application/octet-stream',
            };
          }

          if (!hasCapturedScreenshot) {
            return undefined;
          }

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
