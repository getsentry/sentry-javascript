/// <reference types="node" />
/// <reference types="jest" />
import * as Sentry from '@sentry/core';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
const Puppeteer = require('puppeteer');
import { SentryBrowser } from '../index';

describe('Browser Interface', () => {
  test('sending a message', async done => {
    let countExpects = 0;
    const expectedAssertions = 2;
    expect.assertions(expectedAssertions);

    const server = http
      .createServer((request, response) => {
        if (request.url === '/index.html') {
          response.writeHead(200, { 'Content-Type': 'text/html' });
          const contents = fs.readFileSync(path.join(__dirname, './index.html'));
          response.write(contents);
        }
        if (request.url === '/dist/bundle.js') {
          response.writeHead(200, { 'Content-Type': 'text/javscript' });
          const contents = fs.readFileSync(path.join(__dirname, '../dist/bundle.js'));
          response.write(contents);
        }
        response.end();
      })
      .listen(8999);

    const browser = await Puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    page.on('request', async (request: any) => {
      // @ts-ignore
      if (request.resourceType() === 'other' || request.resourceType() === 'xhr') {
        const data = JSON.parse(request.postData() as any);
        if (data.exception) {
          expect(data.exception).not.toBeUndefined();
        } else {
          expect(data.message).toBe('PICKLE RIIIICK!');
        }
        countExpects++;
      }
      if (countExpects === expectedAssertions) {
        await browser.close();
        done();
      }
    });
    await page.goto('http://localhost:8999/index.html');
    server.close();
  });
});
