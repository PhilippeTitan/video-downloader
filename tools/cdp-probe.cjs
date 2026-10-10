// Evaluate an expression on the Expo Go runtime connected to Metro, over the
// dev server's CDP inspector proxy.
//
// Metro enforces an Origin allow-list on /inspector/debug:
//   expected origin 'http://127.0.0.1:8081'
//   allowed hostnames: localhost, 127.0.0.1, 0.0.0.0, [::]
// so the handshake must carry that Origin header or it is rejected with
// "Connection from DevTools failed to be established for origin 'null'".
//
// Usage:  node tools/cdp-probe.cjs                 (default native-module probe)
//         node tools/cdp-probe.cjs "<expression>"  (custom expression)
//         VD_CDP_VERBOSE=1 …                       (log the CDP exchange)
//         VD_CDP_WAIT=180 …                        (seconds to wait for a device)
const http = require('http');
const path = require('path');

const DEV_SERVER = 'http://127.0.0.1:8081';
const ORIGIN = 'http://127.0.0.1:8081';

const getJson = (url) =>
  new Promise((res, rej) => {
    http
      .get(url, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            res(JSON.parse(d));
          } catch {
            rej(new Error('bad JSON: ' + d.slice(0, 200)));
          }
        });
      })
      .on('error', rej);
  });

// Ask the device itself what native modules it has. If ExpoAsset /
// ExponentConstants are missing here, the client is the mismatch.
const PROBE = `(() => {
  const out = {};
  try {
    const m = globalThis.expo && globalThis.expo.modules;
    out.expoType = typeof globalThis.expo;
    out.moduleCount = m ? Object.keys(m).length : null;
    out.hasExpoAsset = !!(m && m.ExpoAsset);
    out.hasExponentConstants = !!(m && m.ExponentConstants);
    out.constantsExpoVersion = m && m.ExponentConstants
      ? (m.ExponentConstants.expoVersion || m.ExponentConstants.nativeAppVersion || null) : null;
    out.moduleNames = m ? Object.keys(m).sort() : null;
  } catch (e) { out.expoError = String(e && e.message); }
  try { out.hermes = typeof globalThis.HermesInternal; } catch (e) {}
  return JSON.stringify(out);
})()`;

function wsFactory() {
  const wsPath = require.resolve('ws', {
    paths: [path.join(__dirname, '..', 'expo-app', 'node_modules'), path.join(__dirname, '..', 'expo-app')],
  });
  return require(wsPath);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget({ waitSeconds = 0 } = {}) {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    let list = [];
    try {
      list = await getJson(DEV_SERVER + '/json/list');
    } catch {
      /* dev server not up yet */
    }
    const t = list.find((x) => x.appId === 'host.exp.Exponent') || list[0];
    if (t) return t;
    if (Date.now() >= deadline) return null;
    await sleep(2000);
  }
}

function attach(url) {
  const WS = wsFactory();
  const ws = new WS(url, [], { origin: ORIGIN, headers: { Origin: ORIGIN } });
  const pending = new Map();
  let id = 0;
  const events = { opened: false, closed: null, rejected: null };

  ws.on('unexpected-response', (_req, res) => {
    events.rejected = res.statusCode;
    let b = '';
    res.on('data', (c) => (b += c));
    res.on('end', () => console.error('handshake rejected:', res.statusCode, b.slice(0, 200)));
  });
  ws.on('error', (e) => {
    events.error = e.message;
    if (process.env.VD_CDP_VERBOSE) console.error('[ws] error', e.message);
  });
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (process.env.VD_CDP_VERBOSE)
      console.error('[ws] <-', msg.id ?? '', msg.method ?? '', msg.error ? JSON.stringify(msg.error) : '');
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  ws.on('close', (code, reason) => {
    events.closed = code;
    if (process.env.VD_CDP_VERBOSE) console.error('[ws] closed', code, String(reason).slice(0, 120));
  });

  const send = (method, params = {}, timeoutMs = 20000) =>
    new Promise((res, rej) => {
      const i = ++id;
      const timer = setTimeout(() => rej(new Error(`${method} timed out`)), timeoutMs);
      pending.set(i, (m) => {
        clearTimeout(timer);
        res(m);
      });
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  return {
    events,
    send,
    ready: new Promise((res, rej) => {
      ws.on('open', res);
      setTimeout(() => rej(new Error('open timeout')), 15000);
    }),
    close: () => ws.close(),
  };
}

async function main() {
  // Allow the expression to come from a file (easier for long probes).
  const arg = process.argv[2];
  const expr = arg && require('fs').existsSync(arg) ? require('fs').readFileSync(arg, 'utf8') : arg || PROBE;
  const waitSeconds = Number(process.env.VD_CDP_WAIT || 0);
  const target = await findTarget({ waitSeconds });

  if (!target) {
    console.error('no debug target connected (is Expo Go open on the iPad, screen awake?)');
    // Still verify the handshake against a synthetic device so failures are diagnosable.
    console.error('verifying handshake against a synthetic device id…');
    const c = attach(`${DEV_SERVER}/inspector/debug?device=handshake-probe&page=1`);
    try {
      await c.ready;
      console.error('handshake ACCEPTED (101) — Origin header is correct');
    } catch (e) {
      console.error('handshake result:', e.message, c.events.rejected ? `rejected ${c.events.rejected}` : '');
    }
    c.close();
    process.exit(2);
  }

  console.log('target:', target.title, '|', target.description);
  const c = attach(target.webSocketDebuggerUrl);
  await c.ready;
  // Optional: some runtimes stall on Runtime.enable; evaluate works without it.
  try {
    await c.send('Runtime.enable', {}, 8000);
  } catch {
    if (process.env.VD_CDP_VERBOSE) console.error('[cdp] Runtime.enable did not reply, continuing');
  }
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, 30000);
  const val = r?.result?.result?.value;
  if (r?.result?.exceptionDetails) {
    console.error('device threw:', JSON.stringify(r.result.exceptionDetails, null, 2).slice(0, 1200));
  } else if (typeof val === 'string') {
    try {
      console.log(JSON.stringify(JSON.parse(val), null, 2));
    } catch {
      console.log(val);
    }
  } else {
    console.log(JSON.stringify(r, null, 2).slice(0, 2000));
  }
  c.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('probe failed:', e && e.message);
  process.exit(1);
});
