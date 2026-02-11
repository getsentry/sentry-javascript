import type { MemoryHistory } from '@solidjs/router';
import { createMemoryHistory, MemoryRouter, Route } from '@solidjs/router';
import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { withSentryRouterRouting as withSentryClientRouterRouting } from '../../src/client/solidrouter';
import { withSentryRouterRouting as withSentryServerRouterRouting } from '../../src/server/solidrouter';

// solid router uses `window.scrollTo` when navigating
vi.spyOn(global, 'scrollTo').mockImplementation(() => {});

const renderRouter = (SentryRouter: typeof MemoryRouter, history: MemoryHistory) =>
  render(() => (
    <SentryRouter root={() => <div>Root</div>} history={history}>
      <Route path="/" component={() => <div>Home</div>} />
    </SentryRouter>
  ));

describe('withSentryRouterRouting', () => {
  it('should render the same output as on client', () => {
    const SentryClientRouter = withSentryClientRouterRouting(MemoryRouter);
    const SentryServerRouter = withSentryServerRouterRouting(MemoryRouter);

    const history = createMemoryHistory();
    history.set({ value: '/' });

    const { asFragment: asClientFragment } = renderRouter(SentryClientRouter, history);
    const { asFragment: asServerFragment } = renderRouter(SentryServerRouter, history);

    expect(asClientFragment()).toEqual(asServerFragment());
  });
});
