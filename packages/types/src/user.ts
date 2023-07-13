/** JSDoc */
export interface User {
  [key: string]: any;
  id?: string | number;
  ip_address?: string;
  email?: string;
  username?: string;
  segment?: string;
}

export interface UserFeedback {
  event_id: string;
  email: User['email'];
  name: string;
  comments: string;
}
