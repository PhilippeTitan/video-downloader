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

## Notes

- Free Apple ID: sideloaded apps expire after 7 days and must be re-signed.
- iOS 16+: enable Settings → Privacy & Security → Developer Mode.
- First launch: Settings → General → VPN & Device Management → Trust your Apple ID.
