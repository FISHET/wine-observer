/**
 * Serves the built app from dist/. Small enough not to need a dependency.
 *
 * Anything that doesn't look like a file falls back to index.html, so a
 * client-side route survives a reload. Paths are resolved and checked against
 * the root, so ../ can't reach outside dist/.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolves a URL path to a file under root, or null if it would escape it. */
export function resolveWithin(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const base = resolve(root);
  const target = resolve(join(base, decoded));
  return target === base || target.startsWith(base + sep) ? target : null;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function serveStatic(root: string) {
  const index = join(root, 'index.html');

  return async function statics(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }

    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const target = resolveWithin(root, pathname);

    if (target === null) {
      res.writeHead(400).end();
      return;
    }

    let file = target;
    if (!(await isFile(file))) {
      // A missing asset is a real 404; a missing page is a client-side route.
      if (extname(pathname) !== '') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      file = index;
      if (!(await isFile(file))) {
        res
          .writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
          .end('The app has not been built. Run `npm run build`.');
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      // Vite fingerprints everything under assets/; index.html must stay fresh.
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };
}
