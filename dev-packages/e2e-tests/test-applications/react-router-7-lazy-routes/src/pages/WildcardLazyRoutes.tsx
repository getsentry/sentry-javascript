import React from 'react';
import { useParams } from 'react-router-dom';

// Simulate slow lazy route loading (500ms delay via top-level await)
await new Promise(resolve => setTimeout(resolve, 500));

function WildcardItem() {
  const { id } = useParams();
  return <div>Wildcard Item: {id}</div>;
}

export const wildcardRoutes = [
  {
    path: ':id',
    element: <WildcardItem />,
  },
];
