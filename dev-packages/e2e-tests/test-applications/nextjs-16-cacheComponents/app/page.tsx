'use client';

import { useEffect, useState } from 'react';

type Scenario = { name: string; href: (id: string) => string; description: string };

const groups: { title: string; scenarios: Scenario[] }[] = [
  {
    title: 'Route handlers (JSON)',
    scenarios: [
      {
        name: '/api/use-cache',
        href: id => `/api/use-cache?id=${id}`,
        description: 'cached function that lives for hours. The second request with the same id is a hit.',
      },
      {
        name: '/api/use-cache-expiring',
        href: id => `/api/use-cache-expiring?id=${id}`,
        description: 'the entry expires after 2 seconds. Request again after 3 seconds for a refill.',
      },
      {
        name: '/api/use-cache-swr',
        href: id => `/api/use-cache-swr?id=${id}`,
        description:
          'the entry goes stale after 2 seconds. A stale read serves the old value and refills in the background.',
      },
    ],
  },
  {
    title: 'Rendered pages',
    scenarios: [
      {
        name: '/use-cache-page',
        href: id => `/use-cache-page?id=${id}`,
        description: 'a cached data function inside a dynamic hole.',
      },
      {
        name: '/cached-sibling-components',
        href: id => `/cached-sibling-components?id=${id}`,
        description: 'two cached sibling components. Each section is its own cache entry.',
      },
      {
        name: '/nested-caches',
        href: id => `/nested-caches?id=${id}`,
        description:
          'a cached component that expires after 2 seconds and calls a cached function that lives for hours.',
      },
    ],
  },
  {
    title: 'Nested layouts',
    scenarios: [
      {
        name: '/cached-mid-layout/[id]',
        href: id => `/cached-mid-layout/${id}`,
        description: 'a cached layout above a dynamic page.',
      },
      {
        name: '/dynamic-layouts/[id]/layout-cached-leaf',
        href: id => `/dynamic-layouts/${id}/layout-cached-leaf`,
        description: 'dynamic layouts above a cached leaf component.',
      },
      {
        name: '/mixed-lifetimes/[id]',
        href: id => `/mixed-lifetimes/${id}`,
        description: 'a cached layout that expires after 2 seconds around a cached component that lives for hours.',
      },
      {
        name: '/shared-layout/[id]/a',
        href: id => `/shared-layout/${id}/a`,
        description: 'route a fills the layout entry that routes a and b share.',
      },
      {
        name: '/shared-layout/[id]/b',
        href: id => `/shared-layout/${id}/b`,
        description: 'route b hits the layout entry that route a filled.',
      },
    ],
  },
  {
    title: 'Pageload',
    scenarios: [
      {
        name: '/pageload-tracing',
        href: () => '/pageload-tracing',
        description: 'a prerendered shell with a dynamic hole. Check the pageload and server trace connection here.',
      },
    ],
  },
];

// The links are plain `<a>` elements so that every click is a full document request with its own
// server trace. `<Link>` would navigate through the client-side router instead.
export default function Page() {
  const [id, setId] = useState('');
  // Generated after hydration so the prerendered shell does not bake in one fixed id.
  useEffect(() => setId(crypto.randomUUID()), []);

  return (
    <main>
      <h1>Next 16 Cache Components scenarios</h1>
      <p>
        Every link carries a random id that becomes part of the cache key. The first click fills the cache. A second
        click on the same link, or a reload of the target page, hits it. Reload this page to get fresh ids.
      </p>
      {groups.map(group => (
        <section key={group.title}>
          <h2 style={{ fontSize: 16 }}>{group.title}</h2>
          <ul>
            {group.scenarios.map(scenario => (
              <li key={scenario.name} style={{ margin: '6px 0' }}>
                <a href={id ? scenario.href(id) : '#'}>{scenario.name}</a>: {scenario.description}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
