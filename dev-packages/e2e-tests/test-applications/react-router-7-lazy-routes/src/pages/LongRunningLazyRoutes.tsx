import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

// Component that simulates a long-running component load
//  This is used to test the POP guard during long-running pageloads
const SlowLoadingComponent = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate a component that takes time to initialize
    // This extends the pageload duration to create a window where POP events might occur
    setTimeout(() => {
      setData(`Data loaded for ID: ${id}`);
      setIsLoading(false);
    }, 1000);
  }, [id]);

  if (isLoading) {
    return <div id="loading-indicator">Loading...</div>;
  }

  return (
    <div id="slow-loading-content">
      <div>{data}</div>
      <Link to="/" id="navigate-home">
        Go Home
      </Link>
    </div>
  );
};

export const longRunningNestedRoutes = [
  {
    path: 'slow',
    children: [
      {
        path: ':id',
        element: <SlowLoadingComponent />,
        loader: async () => {
          // Simulate slow data fetching in the loader
          await new Promise(resolve => setTimeout(resolve, 2000));
          return null;
        },
      },
    ],
  },
];
