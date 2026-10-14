/**
 * Security regression for the synthetic-only browser test HTTP server.
 * Exercises raw HTTP request paths against disposable files in the OS temp dir.
 * No real vault, browser profile, or personal file is opened.
 */
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStaticServer } from './static-server.mjs';

async function getRaw(port, path) {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port, method: 'GET', path },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => resolve({
          status: response.statusCode,
          mime: response.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8')
        }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

const parent = await mkdtemp(join(tmpdir(), 'cryptokeep-server-fixture-'));
const inside = join(parent, 'app-fixture');
const outside = join(parent, 'app-fixture-private');
let server;
try {
  await mkdir(inside);
  await mkdir(outside);
  await writeFile(join(inside, 'index.html'), '<p>synthetic-index</p>');
  await writeFile(join(inside, 'test.js'), 'export const marker = 1;');
  await writeFile(join(outside, 'canary.txt'), 'synthetic-secret-must-not-leak');

  server = await startStaticServer(inside);
  const port = Number(new URL(server.origin).port);

  const index = await getRaw(port, '/');
  assert.equal(index.status, 200);
  assert.match(index.body, /synthetic-index/);

  const module = await getRaw(port, '/test.js');
  assert.equal(module.status, 200);
  assert.match(module.mime, /^text\/javascript/);

  for (const path of [
    '/../app-fixture-private/canary.txt',
    '/%2e%2e/app-fixture-private/canary.txt',
    '/%2E%2E/app-fixture-private/canary.txt'
  ]) {
    const result = await getRaw(port, path);
    assert.equal(result.status, 403, `Traversal not refused: ${path}`);
    assert.ok(!result.body.includes('synthetic-secret-must-not-leak'));
  }

  console.log('Synthetic test server security passed (6 paths).');
} finally {
  if (server) await server.close();
  await rm(parent, { recursive: true, force: true });
}
