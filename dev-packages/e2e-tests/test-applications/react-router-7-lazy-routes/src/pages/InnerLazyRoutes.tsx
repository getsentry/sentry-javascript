import React from 'react';

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
                element: <div id="innermost-lazy-route">
                  Rendered
                </div>,
              },
            ],
          },
        ],
      },
    ],
  },
];
