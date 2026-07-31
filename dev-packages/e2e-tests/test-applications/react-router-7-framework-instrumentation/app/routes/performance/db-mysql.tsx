import mysql from 'mysql';
import type { Route } from './+types/db-mysql';

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

export function loader() {
  return new Promise<{ status: string }>(resolve => {
    connection.query('SELECT 1 + 1 AS solution', () => {
      connection.query('SELECT NOW()', ['1', '2'], () => {
        resolve({ status: 'ok' });
      });
    });
  });
}

export default function DbMysql(_props: Route.ComponentProps) {
  return <div>db-mysql</div>;
}
