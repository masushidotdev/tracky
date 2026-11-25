import http from 'node:http';
import { isBlockedEdgePath } from './edge-path.mjs';

const EDGE_HOST = process.env.EDGE_HOST || '0.0.0.0';
const EDGE_PORT = Number(process.env.EDGE_PORT || '3000');
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || '127.0.0.1';
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT || '8787');

const agent = new http.Agent({ keepAlive: true });

function normalizeRemoteAddress(addr) {
  if (!addr) return undefined;
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr;
}

const server = http.createServer((req, res) => {
  const requestUrl = req.url || '/';

  if (isBlockedEdgePath(requestUrl)) {
    req.resume();
    res.writeHead(404, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : 'Not Found\n');
    return;
  }

  const headers = { ...req.headers };
  delete headers.connection;
  delete headers['keep-alive'];
  delete headers['proxy-connection'];
  delete headers.upgrade;

  if (!headers['x-forwarded-for']) {
    const remote = normalizeRemoteAddress(req.socket.remoteAddress);
    if (remote) {
      headers['x-forwarded-for'] = remote;
    }
  }
  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = 'http';
  }
  if (!headers['x-forwarded-host'] && headers.host) {
    headers['x-forwarded-host'] = headers.host;
  }

  const upstreamReq = http.request({
    agent,
    hostname: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: requestUrl,
    headers,
  });

  let upstreamResRef = null;

  upstreamReq.on('response', (upstreamRes) => {
    upstreamResRef = upstreamRes;

    const responseHeaders = { ...upstreamRes.headers };
    delete responseHeaders.connection;
    delete responseHeaders['keep-alive'];

    res.writeHead(
      upstreamRes.statusCode ?? 502,
      upstreamRes.statusMessage,
      responseHeaders,
    );

    upstreamRes.on('error', () => {
      if (!res.destroyed) {
        res.destroy();
      }
    });

    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', () => {
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(502, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : 'Bad Gateway\n');
    } else if (!res.destroyed) {
      res.destroy();
    }
  });

  const abortUpstream = () => {
    if (!upstreamReq.destroyed) {
      upstreamReq.destroy();
    }
    if (upstreamResRef && !upstreamResRef.destroyed) {
      upstreamResRef.destroy();
    }
  };

  req.on('aborted', abortUpstream);
  req.on('error', abortUpstream);
  res.on('close', () => {
    if (!res.writableEnded) {
      abortUpstream();
    }
  });

  req.pipe(upstreamReq);
});

server.on('error', (err) => {
  console.error('[tracky] Edge proxy error:', err);
  process.exit(1);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    agent.destroy();
    process.exit(0);
  });
  server.closeIdleConnections?.();
  setTimeout(() => {
    agent.destroy();
    process.exit(0);
  }, 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(EDGE_PORT, EDGE_HOST, () => {
  console.log(
    `[tracky] Edge proxy listening on http://${EDGE_HOST}:${EDGE_PORT} -> http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
});
