import { useEffect, useState } from 'react';

const CARDS = [
  { title: 'Performance', body: 'Measure and optimize your app render times and interaction latency.' },
  { title: 'Accessibility', body: 'Ensure your interface is usable by everyone, including assistive technologies.' },
  { title: 'Best Practices', body: 'Follow modern web development patterns for secure and maintainable code.' },
  { title: 'SEO', body: 'Optimize discoverability with semantic markup and structured metadata.' },
  { title: 'PWA', body: 'Add offline support and installability via service workers and manifests.' },
  { title: 'Security', body: 'Protect users with CSP headers, HTTPS, and input validation.' },
];

export default function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = `Lighthouse Fixture (${count})`;
  }, [count]);

  return (
    <main>
      <header>
        <nav>
          <a href="/">Home</a>
          <a href="/docs">Docs</a>
          <a href="/about">About</a>
        </nav>
      </header>

      <section className="hero">
        <img src="/logo.svg" alt="Lighthouse logo" width={120} height={120} />
        <h1>Lighthouse Fixture</h1>
        <p>
          This app exists to measure JavaScript bundle size and runtime cost across three Sentry instrumentation
          configurations. Each build mode ships a different level of SDK integration.
        </p>
      </section>

      <section className="cards">
        {CARDS.map(card => (
          <article key={card.title} className="card">
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </article>
        ))}
      </section>

      <form
        onSubmit={e => {
          e.preventDefault();
          setCount(c => c + 1);
        }}
      >
        <input type="text" name="name" placeholder="Name" aria-label="Name" />
        <input type="email" name="email" placeholder="Email" aria-label="Email" />
        <input type="text" name="message" placeholder="Message" aria-label="Message" />
        <button type="submit">Submit ({count})</button>
      </form>
    </main>
  );
}
