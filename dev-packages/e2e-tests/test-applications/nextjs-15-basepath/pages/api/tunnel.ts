import * as Sentry from '@sentry/nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

// The tunnel streams the raw body, so Next must not parse it first.
export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await Sentry.handleTunnelRequest(req, res, { allowedDsns: ['http://public@localhost:3031/1337'] });
}
