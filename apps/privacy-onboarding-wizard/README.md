# Privacy Onboarding Wizard (macOS)

SwiftUI wizard that walks users through **optional**, **consent-based** steps to reduce everyday tracking. Each step is defined in [`PrivacyOnboardingWizard/Recommendations.swift`](PrivacyOnboardingWizard/Recommendations.swift) with:

- **valueProposition** — why the step helps
- **whyNecessary** — when it matters (threat model)
- **limitations** — tradeoffs and what it does *not* do

The app does **not** install third-party software or change settings silently. It opens **official documentation** in the default browser (`http`/`https` only) and optional **System Settings** deep links (`x-apple.systempreferences` only).

## Requirements

- macOS 13+
- Xcode 15+ (to open the project and build)

## Build and run

```bash
cd apps/privacy-onboarding-wizard
xcodebuild -project PrivacyOnboardingWizard.xcodeproj -scheme PrivacyOnboardingWizard -configuration Debug -destination 'platform=macOS' build
```

Or open `PrivacyOnboardingWizard.xcodeproj` in Xcode and press Run.

## Editing recommendations

Change copy in `Recommendations.swift` and rebuild. Replace URLs with other official pages as needed; keep HTTPS sources trustworthy.

## App icon

Add PNGs to `Assets.xcassets/AppIcon.appiconset/` (or use Xcode’s asset catalog editor). The catalog lists standard macOS icon sizes; missing images produce a warning until you supply assets. When assembling a bundle manually, ensure `CFBundleIconFile` / asset catalog matches files in `Contents/Resources/` (see repo rule `macos-app-bundle-dmg.mdc`).

## Signing, notarization, and DMG

For distribution outside the App Store:

1. **Developer ID Application** certificate — sign the `.app` in Xcode (Signing & Capabilities) or via `codesign`.
2. **Notarization** — submit the signed app (or ZIP of the app) to Apple notary service; **staple** the ticket to the app for offline Gatekeeper validation.
3. **DMG** — place the signed `.app` in a disk image for download. Follow workspace rules in [`.cursor/rules/macos-app-bundle-dmg.mdc`](../../.cursor/rules/macos-app-bundle-dmg.mdc):
   - Include every resource referenced by `Info.plist` (e.g. icon in `Contents/Resources/`).
   - Finder AppleScript for DMG layout must **not** end with `close` (or the DMG window can reopen closed).
   - Do **not** combine `hdiutil create -srcfolder` with `-size` (image may be too small).
   - Optionally strip quarantine on the output DMG: `xattr -d com.apple.quarantine "$DMG" 2>/dev/null || true`

This wizard intentionally does **not** automate installation of third-party PKG/DMG downloads — no deceptive “one-click” bundling.

## Privacy

The app does not collect analytics by default. Outbound navigation uses `NSWorkspace.shared.open` for user-initiated buttons only.
