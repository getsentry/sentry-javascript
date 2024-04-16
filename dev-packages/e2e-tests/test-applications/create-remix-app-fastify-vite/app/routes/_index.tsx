import type { MetaFunction } from '@remix-run/node';
import * as Sentry from '@sentry/remix';

export const meta: MetaFunction = () => {
  return [{ title: 'New Remix App' }, { name: 'description', content: 'Welcome to Remix!' }];
};

export default function Index() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Welcome to Remix</h1>
      <ul>
        <li>
          <a target="_blank" href="https://remix.run/tutorials/blog" rel="noreferrer">
            15m Quickstart Blog Tutorial
          </a>
        </li>
        <li>
          <a target="_blank" href="https://remix.run/tutorials/jokes" rel="noreferrer">
            Deep Dive Jokes App Tutorial
          </a>
        </li>
        <li>
          <a target="_blank" href="https://remix.run/docs" rel="noreferrer">
            Remix Docs
          </a>
        </li>
        <li>
          <div>
            <span>Remix + Sentry on the client</span>
            <input
              type="button"
              value="Capture Exception"
              id="exception-button"
              onClick={() => {
                const eventId = Sentry.captureException(new Error('I am an error!'));
                window.capturedExceptionId = eventId;
              }}
            />
          </div>
        </li>
      </ul>
    </div>
  );
}
