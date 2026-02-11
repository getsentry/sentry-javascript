/**
 * An interface describing a user of an application or a handled request.
 */
export interface User {
  // TODO: fix in v11, convert any to unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  id?: string | number;
  ip_address?: string | null;
  email?: string;
  username?: string;
  geo?: GeoLocation;
}

export interface GeoLocation {
  country_code?: string;
  region?: string;
  city?: string;
}
