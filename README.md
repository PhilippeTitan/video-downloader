# Video Downloader

A custom video downloader app for iPad, sideloaded from a Windows PC (no App Store).

## Status

- [x] Project scaffold
- [ ] App spec (TBD)
- [ ] Build to `.ipa`
- [ ] Sideload via Sideloadly

## Tooling

Sideloading requires the standalone (non-Microsoft Store) Apple installers plus Sideloadly.
Installers are downloaded into `tools/` (git-ignored):

1. `tools\iTunes64Setup.exe` — https://www.apple.com/itunes/download/win64
2. `tools\iCloudSetup.exe` — Apple CDN standalone installer
3. `tools\SideloadlySetup64.exe` — https://sideloadly.io/SideloadlySetup64.exe

Then: install iTunes → install iCloud → install Sideloadly → connect iPad via USB → trust computer.

## Dev server (Expo Go)

The Metro dev server is reachable from the iPad on whatever address this PC has
*right now* — nothing is pinned to an IP.

```bash
cd expo-app
npm start              # adaptive: resolves the current LAN IP first
npm run start:plain    # raw `expo start` (auto-detect)
npm run start:tunnel   # expo start -c --tunnel (IP-independent, needs internet)
```

Tunnel mode routes through `@expo/ngrok` — the printed `exp://…ngrok…` URL works
from any network as long as both the PC and the iPad have internet. It is slower
than LAN; the first tunnel on a machine may fail once while `~/.expo/ngrok.yml`
is created (just run it again). LAN mode is faster when the iPad is on the same
Wi-Fi as the PC.

`npm start` runs `tools/expo-start.cjs`, which reads the live network interfaces
(`tools/lan-ip.cjs`), skips virtual switches (Hyper-V `vEthernet`, VirtualBox,
VMware, WSL, Docker), and pins `REACT_NATIVE_PACKAGER_HOSTNAME` to the real
Wi-Fi/Ethernet address. That keeps the printed `exp://…` QR code pointed at the
link the iPad is actually on, even after DHCP changes it or when a VM adapter is
up. Override manually with `VD_LAN_IP=192.168.1.50 npm start`; diagnose with
`node tools/lan-ip.cjs --list`.

## Notes

- Free Apple ID: sideloaded apps expire after 7 days and must be re-signed.
- iOS 16+: enable Settings → Privacy & Security → Developer Mode.
- First launch: Settings → General → VPN & Device Management → Trust your Apple ID.
