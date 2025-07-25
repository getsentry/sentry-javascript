import { useLoaderData } from 'react-router';
import type { LoaderFunction } from '@shopify/remix-oxygen';

export default function LoaderError() {
  useLoaderData();

  return (
    <div>
      <h1>Loader Error</h1>
    </div>
  );
}

export const loader: LoaderFunction = () => {
  throw new Error('Loader Error');
};
