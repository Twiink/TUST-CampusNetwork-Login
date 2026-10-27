import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const radio = { ssid: 'TUST-WIFI', enabled: true, failConnections: false };
let online = false,
  slow = false,
  invalid = false,
  updatesAvailable = false;
const attempts = [];
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:38081');
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/radio') {
    response.end(JSON.stringify(radio));
    return;
  }
  if (url.pathname === '/control') {
    for (const key of ['ssid', 'enabled', 'failConnections'])
      if (url.searchParams.has(key))
        radio[key] =
          key === 'ssid' ? url.searchParams.get(key) : url.searchParams.get(key) === 'true';
    if (url.searchParams.has('online')) online = url.searchParams.get('online') === 'true';
    if (url.searchParams.has('slow')) slow = url.searchParams.get('slow') === 'true';
    if (url.searchParams.has('invalid')) invalid = url.searchParams.get('invalid') === 'true';
    if (url.searchParams.has('slow') || url.searchParams.has('invalid')) updatesAvailable = true;
    response.end('{}');
    return;
  }
  if (url.pathname === '/evidence') {
    response.end(JSON.stringify({ attempts, online }));
    return;
  }
  if (url.pathname === '/generate_204') {
    response.writeHead(online ? 204 : 200).end();
    return;
  }
  if (url.pathname.endsWith('/login')) {
    const user = url.searchParams.get('user_account') ?? '';
    attempts.push(user);
    online = !user.includes('reject');
    response.end(
      `dr1005(${JSON.stringify({ status: online ? 1 : 0, msg: online ? '登录成功' : '账号拒绝' })})`
    );
    return;
  }
  if (url.pathname.endsWith('/logout')) {
    online = false;
    response.end('jsonpReturn({"result":1,"msg":"注销成功"})');
    return;
  }
  if (url.pathname === '/releases/latest') {
    response.end(
      JSON.stringify({
        tag_name: updatesAvailable ? 'v1.0.2' : 'v1.0.1',
        name: 'E2E update',
        body: '受控更新验证',
        html_url: 'https://example.test/release',
        published_at: '2026-10-27T00:00:00Z',
        assets: [
          {
            name: 'app-universal-release.apk',
            browser_download_url: `http://10.0.2.2:38081/${invalid ? 'untrusted' : 'update'}.apk`,
            size: 1,
            content_type: 'application/vnd.android.package-archive',
          },
        ],
      })
    );
    return;
  }
  if (url.pathname === '/update.apk' || url.pathname === '/untrusted.apk') {
    const file = path.join(root, url.pathname.slice(1));
    try {
      response.setHeader('Content-Type', 'application/vnd.android.package-archive');
      response.setHeader('Content-Length', statSync(file).size);
      const stream = createReadStream(file, { highWaterMark: slow ? 65536 : 1024 * 1024 });
      response.on('close', () => stream.destroy());
      let sent = 0;
      for await (const bytes of stream) {
        if (response.destroyed) break;
        for (let offset = 0; offset < bytes.length && !response.destroyed; ) {
          // Keep bytes flowing during restarts: an idle socket hits DownloadManager's
          // read timeout and tests a failed download instead of a resumable one.
          const throttled = slow && sent >= 1024 * 1024;
          const end = throttled ? Math.min(offset + 1024, bytes.length) : bytes.length;
          response.write(bytes.subarray(offset, end));
          sent += end - offset;
          offset = end;
          if (throttled) await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      response.end();
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
    return;
  }
  response.writeHead(404).end();
}).listen(38081, '0.0.0.0');
