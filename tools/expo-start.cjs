// Start the Expo dev server. Default: Metro's packager hostname is pinned to
// this PC's *current* LAN IPv4 (tools/lan-ip.cjs), so the QR / exp:// URL
// always points at an address the iPad can reach — re-run `npm start` after
// any DHCP change. With --tunnel the URL goes through Expo's tunnel service
// instead (exp://<random>.us.expo.dev) — no LAN IP needed at all, and the
// iPad can connect from any network. Tunnel needs internet on both devices
// and is a bit slower; login with `npx expo login` for a stable subdomain.
//
// Extra args are forwarded: `npm start -- --clear`, `npm run start:tunnel`.
const path = require('path');
const { spawn } = require('child_process');
const { resolveLanIp } = require('./lan-ip.cjs');

const appRoot = path.resolve(__dirname, '..', 'expo-app');
const extra = process.argv.slice(2);
const tunnel = extra.includes('--tunnel');
const ip = tunnel ? resolveLanIp() : resolveLanIp();

if (!ip && !tunnel) {
  console.error('[expo-start] no LAN IPv4 found — put the PC on the same Wi-Fi as the iPad, or use --tunnel');
  process.exit(1);
}

const cli = path.join(appRoot, 'node_modules', 'expo', 'bin', 'cli');
const args = [cli, 'start', ...extra];

// Mirror the port the CLI will actually use so the hint below is never stale.
const portFlag = extra.includes('--port') ? extra[extra.indexOf('--port') + 1] : null;
const port = portFlag || process.env.RCT_METRO_PORT || '8081';

if (tunnel) {
  console.log('[expo-start] tunnel mode — exp URL is IP-independent (watch the output below for it)');
} else {
  console.log(`[expo-start] Metro host = ${ip}  (REACT_NATIVE_PACKAGER_HOSTNAME)`);
  console.log(`[expo-start] iPad should open  exp://${ip}:${port}`);
}

const child = spawn(process.execPath, args, {
  cwd: appRoot,
  stdio: 'inherit',
  env: ip ? { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: ip } : process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
