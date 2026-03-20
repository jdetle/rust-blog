# Adversarial Review: Share Post Tracking System

**Date**: 2026-03-19
**Branch**: feat/share-post-tracking
**Chaos mode**: high
**Verdict**: Clean — proceed to push

## Offense (Red Team)

### Attack surface: UTM parameter injection
Could a crafted slug cause UTM URL manipulation? No — `buildShareUrl` uses `encodeURIComponent(slug)` and constructs URLs via `new URL()` constructor with a hardcoded origin. Path traversal and hostname injection are blocked.

### Attack surface: XSS via share URLs
External share URLs (twitter, linkedin, etc.) are constructed with `encodeURIComponent`-encoded inputs. No raw user input reaches `href` attributes. Share URLs open via `window.open()` to hardcoded external origins.

### Attack surface: Clipboard API failure
`navigator.clipboard.writeText()` can fail if the page lacks focus or on HTTP (non-HTTPS). The `.then()` handles success but `.catch()` is absent. Impact: "Copied" text never appears, no crash. Low severity.

### Attack surface: Analytics event spam
A malicious script could call `trackShareEvent()` repeatedly. Mitigated by: PostHog rate limits, GA4 session-based deduplication, Plausible server-side rate limiting. No server-side mutation — all events are analytics-only.

## Defense (Blue Team)

- All window globals guarded with optional chaining or existence checks
- `typeof window === "undefined"` server-side guard prevents SSR crashes
- URL construction follows outbound-url-safety rule (URL constructor, not template interpolation)
- No `dangerouslySetInnerHTML` in share components
- No new dependencies added (vendoring policy satisfied)
- `transition-colors` used instead of `transition-all` in CSS (per transition-property-specificity rule)
- All buttons have `type="button"` (per biome useButtonType)
- Build passes, biome clean, zero warnings on touched files

## Synthesis

No blocking issues. One minor gap (clipboard error handling) is cosmetic and non-blocking. The change is well-scoped: 4 files, purely additive, no regressions possible against existing functionality. OG meta tags improve link sharing even without the share buttons.

## Unresolved Risk

None.

## Follow-up Actions

- Consider adding `.catch()` to clipboard promise for better UX on HTTP/unfocused tabs
- Monitor PostHog for `post_shared` events after deploy to confirm end-to-end tracking
