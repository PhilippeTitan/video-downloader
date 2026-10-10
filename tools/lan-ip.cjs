// Resolve the PC's current LAN IPv4 so Expo/Metro advertise an address the iPad
// can actually reach. Nothing is hardcoded here: the address is read from the
// live network interfaces, so it follows DHCP/Tethered changes automatically.
//
// Why this exists: Expo picks a LAN host by itself, but on a Windows machine
// with a Hyper-V / VirtualBox / WSL virtual switch it can advertise that
// adapter's address (e.g. 172.31.x.x) instead of the real Wi-Fi link, and the
// iPad then times out. We filter the virtual adapters out and prefer the link
// the iPad is actually on.
//
// Usage:
//   node tools/lan-ip.cjs            -> 192.168.1.15   (single address, for scripts)
//   node tools/lan-ip.cjs --list     -> all candidates with scores (diagnostics)
//   VD_LAN_IP=… node tools/lan-ip.cjs -> honor an explicit override
const os = require('os');

// Adapters that look like a LAN but are not reachable from the iPad.
const VIRTUAL =
  /(vEthernet|hyper-?v|default switch|virtualbox|vmware|loopback|wsl|docker|bluetooth|tap\d|tun\d|teredo|npcap|zerotier|tailscale|radmin|hamachi|nordlynx|proton)/i;
// Interfaces that are almost certainly the real Wi-Fi / Ethernet link.
const PHYSICAL = /(wi-?fi|wlan|wireless|ethernet|eth\d+|en\d+)/i;

function score(name, address) {
  // Virtual bridges often carry "ethernet" in the name ("vEthernet (Default
  // Switch)"), so rank them below every real link instead of letting the name
  // heuristic promote them.
  if (VIRTUAL.test(name)) return -1;
  let s = 0;
  if (PHYSICAL.test(name)) s += 100;
  // Private ranges, most home/office LANs are 192.168.x.x.
  if (/^192\.168\./.test(address)) s += 30;
  else if (/^10\./.test(address)) s += 20;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) s += 10;
  return s;
}

function collect({ includeVirtual = false } = {}) {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' && addr.family !== 4) continue;
      if (addr.internal) continue;
      if (/^169\.254\./.test(addr.address)) continue; // APIPA = no DHCP lease
      if (!includeVirtual && VIRTUAL.test(name)) continue;
      out.push({ name, address: addr.address, score: score(name, addr.address) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Best LAN IPv4 for the iPad, or null when this PC is not on a network. */
function resolveLanIp(override) {
  const explicit = override || process.env.VD_LAN_IP;
  if (explicit) return explicit;
  const real = collect();
  if (real.length) return real[0].address;
  // Only virtual adapters are up (VPN-only machine) — better an address than none.
  const fallback = collect({ includeVirtual: true });
  return fallback.length ? fallback[0].address : null;
}

module.exports = { resolveLanIp, collect };

if (require.main === module) {
  if (process.argv.includes('--list')) {
    for (const c of collect({ includeVirtual: true })) {
      console.log(`${c.address}\t${c.score}\t${c.name}`);
    }
    const chosen = resolveLanIp();
    console.log(`\nchosen: ${chosen ?? '(none)'}`);
    process.exit(chosen ? 0 : 1);
  }
  const ip = resolveLanIp();
  if (!ip) {
    console.error('lan-ip: no LAN IPv4 found — connect the PC to the same Wi-Fi as the iPad');
    process.exit(1);
  }
  console.log(ip);
}
