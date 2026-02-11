import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { SELF, createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';

describe('Hono app on Cloudflare Workers', () => {
  describe('Unit Tests', () => {
    it('should return welcome message', async () => {
      const res = await app.request('/', {}, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ message: 'Welcome to Hono API' });
    });

    it('should greet a user with their name', async () => {
      const res = await app.request('/hello/tester', {}, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ message: 'Hello, tester!' });
    });

    it('should handle errors with custom error handler', async () => {
      const res = await app.request('/error', {}, env);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toHaveProperty('error', 'This is a test error');
    });

    it('should handle 404 with custom not found handler', async () => {
      const res = await app.request('/non-existent-route', {}, env);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({ message: 'Not Found' });
    });
  });

  // Integration test style with worker.fetch
  describe('Integration Tests', () => {
    it('should fetch the root endpoint', async () => {
      // Create request and context
      const request = new Request('http://localhost/');
      const ctx = createExecutionContext();

      const response = await app.fetch(request, env, ctx);

      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: 'Welcome to Hono API' });
    });

    it('should handle a parameter route', async () => {
      // Create request and context
      const request = new Request('http://localhost/hello/cloudflare');
      const ctx = createExecutionContext();

      const response = await app.fetch(request, env, ctx);

      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: 'Hello, cloudflare!' });
    });

    it('should handle errors gracefully', async () => {
      const response = await SELF.fetch('http://localhost/error');

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'This is a test error');
    });
  });
});
