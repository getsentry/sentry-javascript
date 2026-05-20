import { ActionFunction } from '@remix-run/node';
import { useActionData } from '@remix-run/react';

export const action: ActionFunction = async ({ params: { id } }) => {
  if (id === '-1') {
    throw 'Thrown String Error';
  }

  if (id === '-2') {
    throw {
      message: 'Thrown Object Error',
      statusCode: 500,
    };
  }
};

export default function ServerSideUnexpectedErrors() {
  const data = useActionData<{ test?: string }>();

  return (
    <div>
      <h1>{data?.test ? data.test : 'Not Found'}</h1>
    </div>
  );
}
