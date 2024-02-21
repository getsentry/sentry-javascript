/**
 * An interface describing a user of an application or a handled request.
 */
export interface User {
  [key: string]: any;
  id?: string | number;
  ip_address?: string;
  email?: string;
  username?: string;
}

export interface UserFeedback {
  event_id: string;
  email: User['email'];
  name: string;
  comments: string;
}
