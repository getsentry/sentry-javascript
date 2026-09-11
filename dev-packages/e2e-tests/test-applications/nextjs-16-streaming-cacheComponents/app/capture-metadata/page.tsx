import { captureException } from '@sentry/nextjs';
import type { Metadata } from 'next';

/**
 * Calling captureException synchronously inside generateMetadata
 * during `next build` prerender (cacheComponents). uuid4 -> crypto.randomUUID() runs
 */
export const generateMetadata = (): Metadata => {
  captureException(new Error('diagnostic: data missing for this page'));
  return { title: 'capture-metadata' };
};

export default function Page() {
  return <h1>capture-metadata</h1>;
}
