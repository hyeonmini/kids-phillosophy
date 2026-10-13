import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createStaticServer } from '../scripts/server.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

function get(port, path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function close(server) {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
}

test('static server serves the web and isolates optional documents', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'kids-server-test-'));
  const rootDir = join(fixture, 'public');
  const docsDir = join(fixture, 'docs');
  const html = '<!doctype html><html lang="ko"><h1>철학 갈림길</h1></html>';
  const document = '# 첫 번째 에피소드\n함께 생각해 봐요.';
  let server;
  let withoutDocs;

  try {
    await mkdir(join(rootDir, 'docs'), { recursive: true });
    await mkdir(docsDir);
    const files = {
      'index.html': html,
      'app.js': 'export const ready = true;',
      'module.mjs': 'export const answer = 42;',
      'style.css': 'body { color: black; }',
      'data.json': '{"ready":true}',
      'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'clip.mp4': '0123456789abcdefghij',
      'captions.vtt': 'WEBVTT\n\n00:00.000 --> 00:02.000\n어떻게 나눌까?\n',
      'docs/shadow.md': '# This must not become the document route',
    };
    for (const [path, body] of Object.entries(files)) {
      await writeFile(join(rootDir, path), body);
    }
    await writeFile(join(docsDir, 'episode.md'), document);
    await writeFile(join(fixture, 'outside.txt'), 'outside either serving root');
    await symlink(join(fixture, 'outside.txt'), join(rootDir, 'escape.txt'));
    await symlink(join(fixture, 'outside.txt'), join(docsDir, 'escape.txt'));
    await symlink(docsDir, join(rootDir, 'escaped-docs'));

    server = createStaticServer({ rootDir, docsDir });
    withoutDocs = createStaticServer({ rootDir });
    const port = await listen(server);
    const noDocsPort = await listen(withoutDocs);

    await t.test('serves Korean HTML and JavaScript modules with correct MIME types', async () => {
      const page = await get(port, '/?preview=1');
      assert.equal(page.status, 200);
      assert.equal(page.body, html);
      assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
      for (const path of ['/app.js', '/module.mjs']) {
        const response = await get(port, path);
        assert.equal(response.status, 200);
        assert.equal(response.headers['content-type'], 'text/javascript; charset=utf-8');
      }
      for (const [path, mime] of [
        ['/style.css', 'text/css; charset=utf-8'],
        ['/data.json', 'application/json; charset=utf-8'],
        ['/icon.svg', 'image/svg+xml'],
      ]) {
        const response = await get(port, path);
        assert.equal(response.status, 200);
        assert.equal(response.headers['content-type'], mime);
      }
    });

    await t.test('HEAD returns byte length and headers without a response body', async () => {
      const response = await get(port, '/', 'HEAD');
      assert.equal(response.status, 200);
      assert.equal(response.body, '');
      assert.equal(Number(response.headers['content-length']), Buffer.byteLength(html));
      assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
      const missing = await get(port, '/missing', 'HEAD');
      assert.equal(missing.status, 404);
      assert.equal(missing.body, '');
    });

    await t.test('streams requested video bytes for playback seeking and serves Korean captions', async () => {
      // The payload checks HTTP byte transport; browser QA uses the actual pilot MP4.
      const complete = await get(port, '/clip.mp4');
      assert.equal(complete.status, 200);
      assert.equal(complete.headers['content-type'], 'video/mp4');
      assert.equal(complete.headers['accept-ranges'], 'bytes');
      for (const [range, expected, contentRange] of [
        ['bytes=0-3', '0123', 'bytes 0-3/20'],
        ['bytes=16-', 'ghij', 'bytes 16-19/20'],
        ['bytes=-4', 'ghij', 'bytes 16-19/20'],
        ['bytes=18-999', 'ij', 'bytes 18-19/20'],
      ]) {
        const response = await get(port, '/clip.mp4', 'GET', { Range: range });
        assert.equal(response.status, 206, range);
        assert.equal(response.body, expected, range);
        assert.equal(response.headers['content-range'], contentRange, range);
        assert.equal(Number(response.headers['content-length']), Buffer.byteLength(expected), range);
      }
      for (const range of ['bytes=20-', 'bytes=6-2', 'bytes=-0']) {
        const response = await get(port, '/clip.mp4', 'GET', { Range: range });
        assert.equal(response.status, 416, range);
        assert.equal(response.headers['content-range'], 'bytes */20', range);
      }
      const head = await get(port, '/clip.mp4', 'HEAD', { Range: 'bytes=0-3' });
      assert.equal(head.status, 200);
      assert.equal(head.body, '');
      assert.equal(Number(head.headers['content-length']), 20);
      const captions = await get(port, '/captions.vtt');
      assert.equal(captions.headers['content-type'], 'text/vtt; charset=utf-8');
      assert.match(captions.body, /어떻게 나눌까/);
    });

    await t.test('rejects raw and encoded traversal in both serving roots', async () => {
      for (const path of [
        '/../outside.txt',
        '/%2e%2e%2foutside.txt',
        '/docs/../index.html',
        '/docs/%2e%2e%2foutside.txt',
        '/docs/%5c..%5coutside.txt',
      ]) {
        assert.equal((await get(port, path)).status, 403, path);
      }
      assert.equal((await get(port, '/%ZZ')).status, 400);
    });

    await t.test('serves only explicitly configured docs and blocks symlink escapes', async () => {
      const response = await get(port, '/docs/episode.md');
      assert.equal(response.status, 200);
      assert.equal(response.body, document);
      assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
      const head = await get(port, '/docs/episode.md', 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.body, '');
      assert.equal(Number(head.headers['content-length']), Buffer.byteLength(document));
      assert.equal((await get(port, '/docs/shadow.md')).status, 404);
      assert.equal((await get(port, '/episode.md')).status, 404);
      assert.equal((await get(port, '/docs-library/episode.md')).status, 404);
      for (const path of ['/escape.txt', '/docs/escape.txt', '/escaped-docs/episode.md']) {
        assert.equal((await get(port, path)).status, 403, path);
      }
      assert.equal((await get(noDocsPort, '/docs/episode.md')).status, 404);
      assert.equal((await get(noDocsPort, '/docs/shadow.md')).status, 404);
    });

    await t.test('returns 404 for missing files and 405 for unsupported methods', async () => {
      assert.equal((await get(port, '/missing')).status, 404);
      assert.equal((await get(port, '/docs/missing.md')).status, 404);
      const response = await get(port, '/', 'POST');
      assert.equal(response.status, 405);
      assert.equal(response.headers.allow, 'GET, HEAD');
    });
  } finally {
    await Promise.all([close(server), close(withoutDocs)]);
    await rm(fixture, { recursive: true, force: true });
  }
});
