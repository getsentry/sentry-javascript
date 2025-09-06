import React from 'react';
import { Link } from 'react-router-dom';

export const someMoreNestedRoutes = [
  {
    path: 'inner',
    children: [
      {
        index: true,
        element: <>Level 1</>,
      },
      {
        path: ':id',
        children: [
          {
            index: true,
            element: <>Level 1 ID</>,
          },
          {
            path: ':anotherId',
            children: [
              {
                index: true,
                element: <>Level 1 ID Another ID</>,
              },
              {
                path: ':someAnotherId',
                element: (
                  <div id="innermost-lazy-route">
                    Rendered
                    <br />
                    <Link to="/another-lazy/sub/888/999" id="navigate-to-another-from-inner">
                      Navigate to Another Lazy Route
                    </Link>
                    <Link to="/lazy/inner/1/2/" id="navigate-to-upper">
                      Navigate to Upper Lazy Route
                    </Link>
                  </div>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
];
