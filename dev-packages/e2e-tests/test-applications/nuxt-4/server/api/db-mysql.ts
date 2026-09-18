import { defineEventHandler } from '#imports';
import mysql from 'mysql';

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

export default defineEventHandler(() => {
  return new Promise((resolve, reject) => {
    connection.query('SELECT 1 + 1 AS solution', error => {
      if (error) {
        reject(error);
        return;
      }

      connection.query('SELECT NOW()', ['1', '2'], nestedError => {
        if (nestedError) {
          reject(nestedError);
          return;
        }

        resolve({ status: 'ok' });
      });
    });
  });
});
