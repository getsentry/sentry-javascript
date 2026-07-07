import { json } from '@sveltejs/kit';
import mysql from 'mysql';

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

export const GET = async () => {
  const connection = mysql.createConnection({ user: 'root', password: 'docker' });
  try {
    await new Promise<void>((resolve, reject) => {
      connection.query('SELECT 1 + 1 AS solution', err1 => {
        if (err1) return reject(err1);
        connection.query('SELECT NOW()', ['1', '2'], err2 => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
    return json({ status: 'ok' });
  } finally {
    connection.end(() => {});
  }
};
