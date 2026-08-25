import { defineEventHandler } from '#imports';
import mysql from 'mysql';

export default defineEventHandler(() => {
  const connection = mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'docker',
  });

  connection.on('error', () => {
    // no-op
  });

  return new Promise((resolve, reject) => {
    connection.query('SELECT 1 + 1 AS solution', error => {
      if (error) {
        connection.end();
        reject(error);
        return;
      }

      connection.query('SELECT NOW()', nestedError => {
        connection.end();
        if (nestedError) {
          reject(nestedError);
          return;
        }

        resolve({ status: 'ok' });
      });
    });
  });
});
