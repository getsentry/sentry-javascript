import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-core-integration-tests';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

const app = new Hono();

Sentry.setupHonoErrorHandler(app);

// Global middleware to capture all requests
app.use(async function global(c, next) {
  await next();
});

const basePaths = ['/sync', '/async'];
const methods = ['get', 'post', 'put', 'delete', 'patch'];

basePaths.forEach(basePath => {
  // Sub-path middleware to capture all requests under the basePath
  app.use(`${basePath}/*`, async function base(c, next) {
    await next();
  });

  const baseApp = new Hono();
  methods.forEach(method => {
    baseApp[method]('/', c => {
      const response = c.text('response 200');
      if (basePath === '/sync') return response;
      return Promise.resolve(response);
    });

    baseApp[method](
      '/middleware',
      // anonymous middleware
      async (c, next) => {
        await next();
      },
      c => {
        const response = c.text('response 200');
        if (basePath === '/sync') return response;
        return Promise.resolve(response);
      },
    );

    // anonymous middleware
    baseApp[method]('/middleware/separately', async (c, next) => {
      await next();
    });

    baseApp[method]('/middleware/separately', async c => {
      const response = c.text('response 200');
      if (basePath === '/sync') return response;
      return Promise.resolve(response);
    });

    baseApp.all('/all', c => {
      const response = c.text('response 200');
      if (basePath === '/sync') return response;
      return Promise.resolve(response);
    });

    baseApp.all(
      '/all/middleware',
      // anonymous middleware
      async (c, next) => {
        await next();
      },
      c => {
        const response = c.text('response 200');
        if (basePath === '/sync') return response;
        return Promise.resolve(response);
      },
    );

    // anonymous middleware
    baseApp.all('/all/middleware/separately', async (c, next) => {
      await next();
    });

    baseApp.all('/all/middleware/separately', async c => {
      const response = c.text('response 200');
      if (basePath === '/sync') return response;
      return Promise.resolve(response);
    });

    baseApp.on(method, '/on', c => {
      const response = c.text('response 200');
      if (basePath === '/sync') return response;
      return Promise.resolve(response);
    });

    baseApp.on(
      method,
      '/on/middleware',
      // anonymous middleware
      async (c, next) => {
        await next();
      },
      c => {
        const response = c.text('response 200');
        if (basePath === '/sync') return response;
        return Promise.resolve(response);
      },
    );

    // anonymous middleware
    baseApp.on(method, '/on/middleware/separately', async (c, next) => {
      await next();
    });

    baseApp.on(method, '/on/middleware/separately', async c => {
      const response = c.text('response 200');
      if (basePath === '/sync') return response;
      return Promise.resolve(response);
    });

    baseApp[method]('/401', () => {
      const response = new HTTPException(401, { message: 'response 401' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp.all('/all/401', () => {
      const response = new HTTPException(401, { message: 'response 401' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp.on(method, '/on/401', () => {
      const response = new HTTPException(401, { message: 'response 401' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp[method]('/402', () => {
      const response = new HTTPException(402, { message: 'response 402' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp.all('/all/402', () => {
      const response = new HTTPException(402, { message: 'response 402' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp.on(method, '/on/402', () => {
      const response = new HTTPException(402, { message: 'response 402' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp[method]('/403', () => {
      const response = new HTTPException(403, { message: 'response 403' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp.all('/all/403', () => {
      const response = new HTTPException(403, { message: 'response 403' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp.on(method, '/on/403', () => {
      const response = new HTTPException(403, { message: 'response 403' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp[method]('/500', () => {
      const response = new HTTPException(500, { message: 'response 500' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp.all('/all/500', () => {
      const response = new HTTPException(500, { message: 'response 500' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });

    baseApp.on(method, '/on/500', () => {
      const response = new HTTPException(500, { message: 'response 500' });
      if (basePath === '/sync') throw response;
      return Promise.reject(response);
    });
  });

  app.route(basePath, baseApp);
});

const port = 8787;
serve({ fetch: app.fetch, port });
sendPortToRunner(port);
