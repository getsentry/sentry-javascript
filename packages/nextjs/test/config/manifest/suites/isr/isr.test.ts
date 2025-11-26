import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('ISR route detection and matching', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  describe('ISR detection', () => {
    test('should detect static ISR pages with generateStaticParams', () => {
      expect(manifest.isrRoutes).toContain('/');
      expect(manifest.isrRoutes).toContain('/blog');
    });

    test('should detect dynamic ISR pages with generateStaticParams', () => {
      expect(manifest.isrRoutes).toContain('/products/:id');
      expect(manifest.isrRoutes).toContain('/posts/:slug');
    });

    test('should detect nested dynamic ISR pages', () => {
      expect(manifest.isrRoutes).toContain('/articles/:category/:slug');
    });

    test('should detect optional catchall ISR pages', () => {
      expect(manifest.isrRoutes).toContain('/docs/:path*?');
    });

    test('should detect required catchall ISR pages', () => {
      expect(manifest.isrRoutes).toContain('/guides/:segments*');
    });

    test('should detect mixed static-dynamic ISR pages', () => {
      expect(manifest.isrRoutes).toContain('/users/:id/profile');
    });

    test('should NOT detect pages without generateStaticParams as ISR', () => {
      expect(manifest.isrRoutes).not.toContain('/regular');
    });

    test('should detect both function and const generateStaticParams', () => {
      // /blog uses function declaration
      // /posts/[slug] uses const declaration
      expect(manifest.isrRoutes).toContain('/blog');
      expect(manifest.isrRoutes).toContain('/posts/:slug');
    });

    test('should detect async generateStaticParams', () => {
      // Multiple pages use async - this should work
      expect(manifest.isrRoutes).toContain('/products/:id');
      expect(manifest.isrRoutes).toContain('/posts/:slug');
    });
  });

  describe('Route matching against pathnames', () => {
    describe('single dynamic segment ISR routes', () => {
      test('should match /products/:id against various product IDs', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/products/:id');
        expect(route).toBeDefined();
        const regex = new RegExp(route!.regex!);

        // Should match
        expect(regex.test('/products/1')).toBe(true);
        expect(regex.test('/products/123')).toBe(true);
        expect(regex.test('/products/abc-def')).toBe(true);
        expect(regex.test('/products/product-with-dashes')).toBe(true);
        expect(regex.test('/products/UPPERCASE')).toBe(true);

        // Should NOT match
        expect(regex.test('/products')).toBe(false);
        expect(regex.test('/products/')).toBe(false);
        expect(regex.test('/products/123/extra')).toBe(false);
        expect(regex.test('/product/123')).toBe(false); // typo
      });

      test('should match /posts/:slug against various slugs', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/posts/:slug');
        expect(route).toBeDefined();
        const regex = new RegExp(route!.regex!);

        // Should match
        expect(regex.test('/posts/hello')).toBe(true);
        expect(regex.test('/posts/world')).toBe(true);
        expect(regex.test('/posts/my-awesome-post')).toBe(true);
        expect(regex.test('/posts/post_with_underscores')).toBe(true);

        // Should NOT match
        expect(regex.test('/posts')).toBe(false);
        expect(regex.test('/posts/')).toBe(false);
        expect(regex.test('/posts/hello/world')).toBe(false);
      });
    });

    describe('nested dynamic segments ISR routes', () => {
      test('should match /articles/:category/:slug against various paths', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/articles/:category/:slug');
        expect(route).toBeDefined();
        const regex = new RegExp(route!.regex!);

        // Should match
        expect(regex.test('/articles/tech/nextjs-guide')).toBe(true);
        expect(regex.test('/articles/tech/react-tips')).toBe(true);
        expect(regex.test('/articles/programming/typescript-advanced')).toBe(true);
        expect(regex.test('/articles/news/breaking-news-2024')).toBe(true);

        // Should NOT match
        expect(regex.test('/articles')).toBe(false);
        expect(regex.test('/articles/tech')).toBe(false);
        expect(regex.test('/articles/tech/nextjs-guide/extra')).toBe(false);

        // Extract parameters
        const match = '/articles/tech/nextjs-guide'.match(regex);
        expect(match).toBeTruthy();
        expect(match?.[1]).toBe('tech');
        expect(match?.[2]).toBe('nextjs-guide');
      });
    });

    describe('mixed static-dynamic ISR routes', () => {
      test('should match /users/:id/profile against user profile paths', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/users/:id/profile');
        expect(route).toBeDefined();
        const regex = new RegExp(route!.regex!);

        // Should match
        expect(regex.test('/users/user1/profile')).toBe(true);
        expect(regex.test('/users/user2/profile')).toBe(true);
        expect(regex.test('/users/john-doe/profile')).toBe(true);
        expect(regex.test('/users/123/profile')).toBe(true);

        // Should NOT match
        expect(regex.test('/users/user1')).toBe(false);
        expect(regex.test('/users/user1/profile/edit')).toBe(false);
        expect(regex.test('/users/profile')).toBe(false);
        expect(regex.test('/user/user1/profile')).toBe(false); // typo

        // Extract parameter
        const match = '/users/john-doe/profile'.match(regex);
        expect(match).toBeTruthy();
        expect(match?.[1]).toBe('john-doe');
      });
    });

    describe('optional catchall ISR routes', () => {
      test('should match /docs/:path*? against various documentation paths', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/docs/:path*?');
        expect(route).toBeDefined();
        const regex = new RegExp(route!.regex!);

        // Should match - with paths
        expect(regex.test('/docs/getting-started')).toBe(true);
        expect(regex.test('/docs/api/reference')).toBe(true);
        expect(regex.test('/docs/guides/installation/quick-start')).toBe(true);
        expect(regex.test('/docs/a')).toBe(true);
        expect(regex.test('/docs/a/b/c/d/e')).toBe(true);

        // Should match - without path (optional catchall)
        expect(regex.test('/docs')).toBe(true);

        // Should NOT match
        expect(regex.test('/doc')).toBe(false); // typo
        expect(regex.test('/')).toBe(false);
        expect(regex.test('/documents/test')).toBe(false);

        // Extract parameters
        const matchWithPath = '/docs/api/reference'.match(regex);
        expect(matchWithPath).toBeTruthy();
        expect(matchWithPath?.[1]).toBe('api/reference');

        const matchNoPath = '/docs'.match(regex);
        expect(matchNoPath).toBeTruthy();
        // Optional catchall without path
        expect(matchNoPath?.[1]).toBeUndefined();
      });
    });

    describe('required catchall ISR routes', () => {
      test('should match /guides/:segments* against guide paths', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/guides/:segments*');
        expect(route).toBeDefined();
        const regex = new RegExp(route!.regex!);

        // Should match - with paths (required)
        expect(regex.test('/guides/intro')).toBe(true);
        expect(regex.test('/guides/advanced/topics')).toBe(true);
        expect(regex.test('/guides/getting-started/installation/setup')).toBe(true);

        // Should NOT match - without path (required catchall needs at least one segment)
        expect(regex.test('/guides')).toBe(false);
        expect(regex.test('/guides/')).toBe(false);

        // Should NOT match - wrong path
        expect(regex.test('/guide/intro')).toBe(false); // typo
        expect(regex.test('/')).toBe(false);

        // Extract parameters
        const match = '/guides/advanced/topics'.match(regex);
        expect(match).toBeTruthy();
        expect(match?.[1]).toBe('advanced/topics');
      });
    });

    describe('real-world pathname simulations', () => {
      test('should identify ISR pages from window.location.pathname examples', () => {
        const testCases = [
          { pathname: '/', isISR: true, matchedRoute: '/' },
          { pathname: '/blog', isISR: true, matchedRoute: '/blog' },
          { pathname: '/products/123', isISR: true, matchedRoute: '/products/:id' },
          { pathname: '/products/gaming-laptop', isISR: true, matchedRoute: '/products/:id' },
          { pathname: '/posts/hello-world', isISR: true, matchedRoute: '/posts/:slug' },
          { pathname: '/articles/tech/nextjs-guide', isISR: true, matchedRoute: '/articles/:category/:slug' },
          { pathname: '/users/john/profile', isISR: true, matchedRoute: '/users/:id/profile' },
          { pathname: '/docs', isISR: true, matchedRoute: '/docs/:path*?' },
          { pathname: '/docs/getting-started', isISR: true, matchedRoute: '/docs/:path*?' },
          { pathname: '/docs/api/reference/advanced', isISR: true, matchedRoute: '/docs/:path*?' },
          { pathname: '/guides/intro', isISR: true, matchedRoute: '/guides/:segments*' },
          { pathname: '/guides/advanced/topics/performance', isISR: true, matchedRoute: '/guides/:segments*' },
          { pathname: '/regular', isISR: false, matchedRoute: null },
        ];

        testCases.forEach(({ pathname, isISR, matchedRoute }) => {
          // Check if pathname matches any ISR route
          let foundMatch = false;
          let foundRoute = null;

          // Check static ISR routes
          if (manifest.isrRoutes.includes(pathname)) {
            foundMatch = true;
            foundRoute = pathname;
          }

          // Check dynamic ISR routes
          if (!foundMatch) {
            for (const route of manifest.dynamicRoutes) {
              if (manifest.isrRoutes.includes(route.path)) {
                const regex = new RegExp(route.regex!);
                if (regex.test(pathname)) {
                  foundMatch = true;
                  foundRoute = route.path;
                  break;
                }
              }
            }
          }

          expect(foundMatch).toBe(isISR);
          if (matchedRoute) {
            expect(foundRoute).toBe(matchedRoute);
          }
        });
      });
    });

    describe('edge cases and special characters', () => {
      test('should handle paths with special characters in dynamic segments', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/products/:id');
        const regex = new RegExp(route!.regex!);

        expect(regex.test('/products/product-123')).toBe(true);
        expect(regex.test('/products/product_456')).toBe(true);
        expect(regex.test('/products/PRODUCT-ABC')).toBe(true);
        expect(regex.test('/products/2024-new-product')).toBe(true);
      });

      test('should handle deeply nested catchall paths', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/docs/:path*?');
        const regex = new RegExp(route!.regex!);

        expect(regex.test('/docs/a/b/c/d/e/f/g/h/i/j')).toBe(true);
      });

      test('should not match paths with trailing slashes if route does not have them', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/products/:id');
        const regex = new RegExp(route!.regex!);

        // Most Next.js routes don't match trailing slashes
        expect(regex.test('/products/123/')).toBe(false);
      });
    });

    describe('parameter extraction for ISR routes', () => {
      test('should extract single parameter from ISR route', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/products/:id');
        const regex = new RegExp(route!.regex!);

        const match = '/products/gaming-laptop'.match(regex);
        expect(match).toBeTruthy();
        expect(route?.paramNames).toEqual(['id']);
        expect(match?.[1]).toBe('gaming-laptop');
      });

      test('should extract multiple parameters from nested ISR route', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/articles/:category/:slug');
        const regex = new RegExp(route!.regex!);

        const match = '/articles/programming/typescript-advanced'.match(regex);
        expect(match).toBeTruthy();
        expect(route?.paramNames).toEqual(['category', 'slug']);
        expect(match?.[1]).toBe('programming');
        expect(match?.[2]).toBe('typescript-advanced');
      });

      test('should extract catchall parameter from ISR route', () => {
        const route = manifest.dynamicRoutes.find(r => r.path === '/docs/:path*?');
        const regex = new RegExp(route!.regex!);

        const match = '/docs/api/reference/advanced'.match(regex);
        expect(match).toBeTruthy();
        expect(route?.paramNames).toEqual(['path']);
        expect(match?.[1]).toBe('api/reference/advanced');
      });
    });
  });

  describe('complete manifest structure', () => {
    test('should have correct structure with all route types', () => {
      expect(manifest).toHaveProperty('staticRoutes');
      expect(manifest).toHaveProperty('dynamicRoutes');
      expect(manifest).toHaveProperty('isrRoutes');
      expect(Array.isArray(manifest.staticRoutes)).toBe(true);
      expect(Array.isArray(manifest.dynamicRoutes)).toBe(true);
      expect(Array.isArray(manifest.isrRoutes)).toBe(true);
    });

    test('should include both ISR and non-ISR routes in main route lists', () => {
      // ISR static routes should be in staticRoutes
      expect(manifest.staticRoutes.some(r => r.path === '/')).toBe(true);
      expect(manifest.staticRoutes.some(r => r.path === '/blog')).toBe(true);

      // Non-ISR static routes should also be in staticRoutes
      expect(manifest.staticRoutes.some(r => r.path === '/regular')).toBe(true);

      // ISR dynamic routes should be in dynamicRoutes
      expect(manifest.dynamicRoutes.some(r => r.path === '/products/:id')).toBe(true);
    });

    test('should only include ISR routes in isrRoutes list', () => {
      // ISR routes should be in the list
      expect(manifest.isrRoutes).toContain('/');
      expect(manifest.isrRoutes).toContain('/blog');
      expect(manifest.isrRoutes).toContain('/products/:id');

      // Non-ISR routes should NOT be in the list
      expect(manifest.isrRoutes).not.toContain('/regular');
    });
  });
});
