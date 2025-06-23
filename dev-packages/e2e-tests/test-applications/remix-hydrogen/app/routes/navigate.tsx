import { useLoaderData } from '@remix-run/react';
import type { LoaderFunction } from '@shopify/remix-oxygen';

export const loader: LoaderFunction = async ({ params: { id } }) => {
  if (id === '-1') {
    throw new Error('Unexpected Server Error');
  }

  return null;
};

export default function LoaderError() {
  const data = useLoaderData() as { test?: string };

  return (
    <div>
      <h1>{data && data.test ? data.test : 'Not Found'}</h1>
    </div>
  );
}
