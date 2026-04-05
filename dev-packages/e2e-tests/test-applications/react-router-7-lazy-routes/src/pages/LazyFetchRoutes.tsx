import React from 'react';
import { Link } from 'react-router-dom';

const GqlPageA = () => {
  const [data, setData] = React.useState<{ data?: unknown } | null>(null);

  React.useEffect(() => {
    fetch('/api/graphql?op=UserAQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ userA { id name } }', operationName: 'UserAQuery' }),
    })
      .then(res => res.json())
      .then(setData)
      .catch(() => setData({ data: { error: 'failed' } }));
  }, []);

  return (
    <div id="gql-page-a">
      <h1>GQL Page A</h1>
      <p id="gql-page-a-data">{data ? JSON.stringify(data) : 'loading...'}</p>
      <Link to="/lazy-gql-b/fetch" id="navigate-to-gql-b">
        Navigate to GQL Page B
      </Link>
    </div>
  );
};

export const lazyGqlARoutes = [
  {
    path: 'fetch',
    element: <GqlPageA />,
  },
];
