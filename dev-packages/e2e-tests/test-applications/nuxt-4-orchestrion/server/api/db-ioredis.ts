import mysql from 'mysql';
import { defineEventHandler } from '#imports';
import Redis from "ioredis";

export default defineEventHandler((event) => {
  const redis = new Redis();

  redis.set("test-key", "test-value");

  return redis.get("test-key");
});


/*
const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

export default defineEventHandler(() => {
  return new Promise(resolve => {
    connection.query('SELECT 1 + 1 AS solution', () => {
      connection.query('SELECT NOW()', ['1', '2'], () => {
        resolve({ status: 'ok' });
      });
    });
  });
});

 */
