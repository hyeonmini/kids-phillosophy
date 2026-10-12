import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isWithin(rootDir, target) {
  const pathFromRoot = relative(rootDir, target);
  return pathFromRoot !== '..'
    && !pathFromRoot.startsWith(`..${sep}`)
    && !isAbsolute(pathFromRoot);
}

function sendText(req, res, statusCode, message, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message),
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : message);
}

export function createStaticServer({ rootDir = resolve(projectDir, 'public'), docsDir } = {}) {
  const root = resolve(rootDir);
  const docsRoot = docsDir ? resolve(docsDir) : undefined;

  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(req, res, 405, 'Method not allowed\n', { Allow: 'GET, HEAD' });
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      sendText(req, res, 400, 'Invalid URL\n');
      return;
    }

    if (!pathname.startsWith('/') || pathname.includes('\0')) {
      sendText(req, res, 400, 'Invalid URL\n');
      return;
    }
    if (pathname.includes('\\') || pathname.split('/').includes('..')) {
      sendText(req, res, 403, 'Forbidden\n');
      return;
    }

    const isDocsRequest = pathname === '/docs' || pathname.startsWith('/docs/');
    if (isDocsRequest && !docsRoot) {
      sendText(req, res, 404, 'Not found\n');
      return;
    }
    const requestRoot = isDocsRequest ? docsRoot : root;
    const requestPath = isDocsRequest ? pathname.slice('/docs'.length) || '/' : pathname;
    let filePath = resolve(requestRoot, `.${requestPath}`);
    if (!isWithin(requestRoot, filePath)) {
      sendText(req, res, 403, 'Forbidden\n');
      return;
    }

    try {
      let fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        filePath = resolve(filePath, 'index.html');
        fileStat = await stat(filePath);
      }
      if (!fileStat.isFile()) {
        sendText(req, res, 404, 'Not found\n');
        return;
      }

      const [canonicalRoot, canonicalFile] = await Promise.all([
        realpath(requestRoot),
        realpath(filePath),
      ]);
      if (!isWithin(canonicalRoot, canonicalFile)) {
        sendText(req, res, 403, 'Forbidden\n');
        return;
      }

      res.writeHead(200, {
        'Content-Type': mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': fileStat.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = createReadStream(canonicalFile);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      const statusCode = ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
      sendText(req, res, statusCode, statusCode === 404 ? 'Not found\n' : 'Server error\n');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('PORT must be an integer between 0 and 65535.');
    process.exitCode = 1;
  } else {
    const useDist = process.argv.includes('--dist');
    const directory = useDist ? 'dist' : 'public';
    const server = createStaticServer({
      rootDir: resolve(projectDir, directory),
      docsDir: resolve(projectDir, useDist ? 'dist/docs' : 'docs'),
    });
    server.on('error', (error) => {
      console.error(`Could not start server: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, host, () => {
      console.log(`Serving ${directory}/ at http://${host}:${server.address().port}`);
    });
  }
}
