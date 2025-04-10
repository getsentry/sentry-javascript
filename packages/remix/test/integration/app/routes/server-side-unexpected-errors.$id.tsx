import { ActionFunction } from '@remix-run/node';
import { useActionData } from '@remix-run/react';

export const action: ActionFunction = async ({ params: { id } }) => {
  // Throw string
  if (id === '-1') {
    throw 'Thrown String Error';
  }

  // Throw object
  if (id === '-2') {
    throw {
      message: 'Thrown Object Error',
      statusCode: 500,
    };
  }
};

export default function ActionJSONResponse() {
  const data = useActionData();

  return (
    <div>
      <h1>{data?.test ? data.test : 'Not Found'}</h1>
    </div>
  );
}
