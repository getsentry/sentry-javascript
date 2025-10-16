Welcome to your new TanStack app!

# Getting Started

To run this application:

```bash
pnpm install
pnpm start
```

# Building For Production

To build this application for production:

```bash
pnpm build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

## Routing

This project uses [TanStack Router](https://tanstack.com/router). The initial setup is a code based router. Which means that the routes are defined in code (in the `./src/main.tsx` file). If you like you can also use a file based routing setup by following the [File Based Routing](https://tanstack.com/router/latest/docs/framework/solid/guide/file-based-routing) guide.

### Adding A Route

To add a new route to your application just add another `createRoute` call to the `./src/main.tsx` file. The example below adds a new `/about`route to the root route.

```tsx
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: () => <h1>About</h1>,
});
```

You will also need to add the route to the `routeTree` in the `./src/main.tsx` file.

```tsx
const routeTree = rootRoute.addChildren([indexRoute, aboutRoute]);
```

With this set up you should be able to navigate to `/about` and see the about page.

Of course you don't need to implement the About page in the `main.tsx` file. You can create that component in another file and import it into the `main.tsx` file, then use it in the `component` property of the `createRoute` call, like so:

```tsx
import About from './components/About.tsx';

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: About,
});
```

That is how we have the `App` component set up with the home page.

For more information on the options you have when you are creating code based routes check out the [Code Based Routing](https://tanstack.com/router/latest/docs/framework/solid/guide/code-based-routing) documentation.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/solid-router`.

```tsx
import { Link } from '@tanstack/solid-router';
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/solid/api/router/linkComponent).

### Using A Layout

Layouts can be used to wrap the contents of the routes in menus, headers, footers, etc.

There is already a layout in the `src/main.tsx` file:

```tsx
const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
```

You can use the Soliid component specified in the `component` property of the `rootRoute` to wrap the contents of the routes. The `<Outlet />` component is used to render the current route within the body of the layout. For example you could add a header to the layout like so:

```tsx
import { Link } from '@tanstack/solid-router';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <header>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
        </nav>
      </header>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
```

The `<TanStackRouterDevtools />` component is not required so you can remove it if you don't want it in your layout.

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/solid/guide/routing-concepts#layouts).

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/people',
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people');
    return response.json() as Promise<{
      results: {
        name: string;
      }[];
    }>;
  },
  component: () => {
    const data = peopleRoute.useLoaderData();
    return (
      <ul>
        {data.results.map(person => (
          <li key={person.name}>{person.name}</li>
        ))}
      </ul>
    );
  },
});
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/solid/guide/data-loading#loader-parameters).

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).
