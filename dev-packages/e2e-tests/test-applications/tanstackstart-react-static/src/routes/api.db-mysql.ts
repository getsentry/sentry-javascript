import { createFileRoute } from '@tanstack/react-router';
import mysql from 'mysql';

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

export const Route = createFileRoute('/api/db-mysql')({
  server: {
    handlers: {
      GET: () => {
        return new Promise<Response>(resolve => {
          connection.query('SELECT 1 + 1 AS solution', () => {
            connection.query('SELECT NOW()', ['1', '2'], () => {
              resolve(Response.json({ status: 'ok' }));
            });
          });
        });
      },
    },
  },
});
