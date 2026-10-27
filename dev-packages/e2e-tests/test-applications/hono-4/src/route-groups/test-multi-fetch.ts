import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

const ITEMS: Record<string, { name: string; stock: number; price: number }> = {
  'self-watering-plant': { name: 'Self-Watering Plant', stock: 5, price: 2500 },
  'solar-powered-cyberdeck': { name: 'Solar-Powered Cyberdeck', stock: 0, price: 5000 },
};

// Inventory service — standalone sub-app used as a data source.
// Mounted on the main app AND called internally via .request() from the storefront.
const inventoryApp = new Hono();

inventoryApp.get('/item/:productId', c => {
  const productId = c.req.param('productId');
  const item = ITEMS[productId];
  if (!item) {
    throw new HTTPException(404, { message: `Item ${productId} not found` });
  }
  return c.json({ productId, ...item });
});

inventoryApp.get('/item/:productId/stock', c => {
  const productId = c.req.param('productId');
  const item = ITEMS[productId];
  if (!item) {
    throw new HTTPException(404, { message: `Stock check failed: ${productId}` });
  }
  return c.json({ productId, inStock: item.stock > 0, quantity: item.stock });
});

// Simulates an inner-route failure (a plain 5xx Error, not an HTTPException) reached only via an
// internal .request() — used by the storefront's `/degraded` route below. Each throw gets a unique
// suffix so the Dedupe integration doesn't collapse repeats across test retries.
let dbErrorCount = 0;
inventoryApp.get('/item/:productId/db-error', () => {
  throw new Error(`inventory db is down #${(dbErrorCount += 1)}`);
});

// Storefront service — orchestrates internal .request() calls to inventoryApp.
const storefrontApp = new Hono();

storefrontApp.use('/*', async function storefrontAuth(_c, next) {
  await new Promise(resolve => setTimeout(resolve, 10));
  await next();
});

// Single internal fetch: look up one product
storefrontApp.get('/product/:productId', async c => {
  const res = await inventoryApp.request(`/item/${c.req.param('productId')}`);
  if (!res.ok) {
    throw new HTTPException(404, { message: 'Product not found' });
  }
  const item = await res.json();
  return c.json({ product: item, source: 'storefront' });
});

// Parallel internal fetches: compare two products via Promise.all
storefrontApp.get('/compare/:productId1/:productId2', async c => {
  const [res1, res2] = await Promise.all([
    inventoryApp.request(`/item/${c.req.param('productId1')}`),
    inventoryApp.request(`/item/${c.req.param('productId2')}`),
  ]);
  if (!res1.ok || !res2.ok) {
    throw new HTTPException(404, { message: 'One or more products not found' });
  }
  const [item1, item2] = (await Promise.all([res1.json(), res2.json()])) as [
    Record<string, number>,
    Record<string, number>,
  ];
  return c.json({
    items: [item1, item2],
    priceDifference: Math.abs(item1.price - item2.price),
  });
});

// Sequential chained fetches: look up item, then check its stock
storefrontApp.get('/product/:productId/availability', async c => {
  const itemRes = await inventoryApp.request(`/item/${c.req.param('productId')}`);
  if (!itemRes.ok) {
    throw new HTTPException(404, { message: 'Product not found' });
  }
  const item: Record<string, string | number> = await itemRes.json();

  const stockRes = await inventoryApp.request(`/item/${item.productId}/stock`);
  const stock: Record<string, string | number | boolean> = await stockRes.json();

  return c.json({
    product: item.name,
    available: stock.inStock,
    quantity: stock.quantity,
  });
});

// Degraded response: the inner route throws, but the outer handler swallows the failed internal
// response and returns a 200 instead of propagating. The inner error should still reach Sentry (auto
// instrumentation); the outer request stays healthy.
storefrontApp.get('/product/:productId/degraded', async c => {
  const res = await inventoryApp.request(`/item/${c.req.param('productId')}/db-error`);
  if (!res.ok) {
    return c.json({ product: null, degraded: true }, 200);
  }
  return c.json({ product: await res.json() });
});

// Error propagation: internal 404 causes the handler to throw a plain Error
storefrontApp.get('/product-or-throw/:productId', async c => {
  const res = await inventoryApp.request(`/item/${c.req.param('productId')}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch product: ${c.req.param('productId')}`);
  }
  return c.json({ product: await res.json() });
});

const multiFetchRoutes = new Hono();
multiFetchRoutes.route('/inventory', inventoryApp);
multiFetchRoutes.route('/storefront', storefrontApp);

export { multiFetchRoutes };
