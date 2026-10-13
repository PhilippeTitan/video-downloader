// Re-applies the @expo/ngrok compatibility patches after npm installs wipe
// node_modules. Idempotent. Wired via the root package.json "postinstall".
//
// Patches (see tools/ngrok-patches/*.js, marked with "PATCH"):
//  - use this machine owner's ngrok authtoken instead of Expo's saturated
//    shared token (ERR_NGROK_108)
//  - discover the repo-shipped modern agent (tools/ngrok/ngrok.exe) because
//    accounts can enforce a minimum agent version (ERR_NGROK_121)
//  - speak the v3 local API (strict field validation, phantom-tunnel retries)
//  - surface real ngrok errors instead of "reading 'body'" TypeErrors
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ngrokDir = path.join(root, 'node_modules', '@expo', 'ngrok');
const patchDir = path.join(__dirname, 'ngrok-patches');
const SUPPORTED_VERSION = '4.1.3';
const FILES = [
  ['index.js', 'index.js'],
  ['process.js', path.join('src', 'process.js')],
  ['client.js', path.join('src', 'client.js')],
];

function main() {
  const pkgPath = path.join(ngrokDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return; // not installed (e.g. partial install)
  const { version } = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (version !== SUPPORTED_VERSION) {
    console.warn(
      `[apply-ngrok-patches] @expo/ngrok@${version} is not the patched version ` +
        `(${SUPPORTED_VERSION}); review tools/ngrok-patches before patching.`
    );
    return;
  }
  for (const [srcName, targetRel] of FILES) {
    const target = path.join(ngrokDir, targetRel);
    const current = fs.readFileSync(target, 'utf8');
    if (current.includes('PATCH:')) continue; // already patched
    const patched = fs.readFileSync(path.join(patchDir, srcName), 'utf8');
    fs.copyFileSync(path.join(patchDir, srcName), target);
    console.log(`[apply-ngrok-patches] patched @expo/ngrok/${targetRel}`);
  }
}

main();
