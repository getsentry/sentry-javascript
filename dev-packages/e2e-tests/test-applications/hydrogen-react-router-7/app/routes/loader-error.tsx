import { useLoaderData } from 'react-router';
import type { LoaderFunction } from 'react-router';

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
