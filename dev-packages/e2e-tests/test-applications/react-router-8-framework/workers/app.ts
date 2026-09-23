import { createRequestHandler } from 'react-router';

const requestHandler = createRequestHandler(() => import('virtual:react-router/server-build'), import.meta.env.MODE);

export default {
  async fetch(request: Request) {
    return requestHandler(request);
  },
};
