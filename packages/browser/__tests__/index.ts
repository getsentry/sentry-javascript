/// <reference types="node" />
/// <reference types="jest" />
/// <reference types="puppeteer" />
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as Sentry from '@sentry/core';
import { Browser } from '../index';
import * as Puppeteer from 'puppeteer';

describe('Browser Interface', () => {
  test('sending a message', async done => {
    expect.assertions(1);

    let server = http
      .createServer(function(request, response) {
        if (request.url === '/index.html') {
          response.writeHead(200, { 'Content-Type': 'text/html' });
          let contents = fs.readFileSync(path.join(__dirname, './index.html'));
          response.write(contents);
        }
        if (request.url === '/dist/bundle.js') {
          response.writeHead(200, { 'Content-Type': 'text/javscript' });
          let contents = fs.readFileSync(path.join(__dirname, '../dist/bundle.js'));
          response.write(contents);
        }
        response.end();
      })
      .listen(8999);

    let browser = await Puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.on('request', async request => {
      if (request.resourceType === 'XHR') {
        let data = JSON.parse(<any>request.postData);
        expect(data.message).toBe('PICKLE RIIIICK!');
        await browser.close();
        done();
      }
    });
    await page.goto('http://localhost:8999/index.html');
    server.close();
  });
});
