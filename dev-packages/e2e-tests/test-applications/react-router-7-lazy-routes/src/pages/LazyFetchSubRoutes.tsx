import React from 'react';
import { Link } from 'react-router-dom';

const GqlPageB = () => {
  const [data, setData] = React.useState<{ data?: unknown } | null>(null);

  React.useEffect(() => {
    fetch('/api/graphql?op=UserBQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ userB { id email } }', operationName: 'UserBQuery' }),
    })
      .then(res => res.json())
      .then(setData)
      .catch(() => setData({ data: { error: 'failed' } }));
  }, []);

  return (
    <div id="gql-page-b">
      <h1>GQL Page B</h1>
      <p id="gql-page-b-data">{data ? JSON.stringify(data) : 'loading...'}</p>
      <Link to="/" id="gql-b-home-link">
        Go Home
      </Link>
    </div>
  );
};

export const lazyGqlBRoutes = [
  {
    path: 'fetch',
    element: <GqlPageB />,
  },
];
