import React from 'react';

export const someMoreNestedRoutes = [
  {
    path: 'level-1',
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
                  Level 1 ID Another ID Some Another ID
                </div>,
              },
            ],
          },
        ],
      },
    ],
  },
];
