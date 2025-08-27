import React from 'react';
import { Link } from 'react-router-dom';

export const anotherNestedRoutes = [
  {
    path: 'sub',
    children: [
      {
        index: true,
        element: (
          <div id="another-lazy-route">
            Another Lazy Route
            <Link to="/lazy/inner/999/888/777" id="navigate-to-inner">
              Navigate to Inner Lazy Route
            </Link>
          </div>
        ),
      },
      {
        path: ':id',
        children: [
          {
            index: true,
            element: <div id="another-lazy-route-with-id">Another Lazy Route with ID</div>,
          },
          {
            path: ':subId',
            element: (
              <div id="another-lazy-route-deep">
                Another Deep Lazy Route
                <Link to="/lazy/inner/111/222/333" id="navigate-to-inner-from-deep">
                  Navigate to Inner from Deep
                </Link>
              </div>
            ),
          },
        ],
      },
    ],
  },
];
