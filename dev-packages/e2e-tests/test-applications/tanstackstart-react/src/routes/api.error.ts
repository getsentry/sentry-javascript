import * as Sentry from '@sentry/tanstackstart-react';
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/error')({
    server: {
        handlers: {
            GET: async () => {
                // This will throw a server-side error that Sentry should catch
                try {
                    throw new Error('Sentry API Route Test Error');
                } catch (error) {
                    Sentry.captureException(error);
                    throw error;
                }
            },
        },
    },
});
