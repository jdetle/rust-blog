import Foundation

/// Curated v1 list. Edit copy here; rebuild to update user-visible strings.
enum Recommendations {
    static let all: [Recommendation] = [
        Recommendation(
            id: "encrypted-dns",
            title: "Use encrypted DNS on this Mac",
            category: .network,
            valueProposition:
                "Encrypts DNS lookups so your ISP and local network observers see far less of which hostnames you resolve. "
                + "That closes a common plaintext metadata leak next to regular HTTPS browsing.",
            whyNecessary:
                "Without encrypted DNS, queries often go to your ISP’s resolver in cleartext (or are easy to observe on untrusted networks). "
                + "Trackers and intermediaries can use that metadata to profile activity even when page content is HTTPS.",
            limitations:
                "DNS privacy is not a VPN: it does not hide your IP or all traffic. "
                + "Some networks block non-default DNS; captive portals may need temporary exceptions. "
                + "Pick a resolver you trust—policy matters as much as encryption.",
            officialURL: URL(string: "https://support.apple.com/guide/mac-help/mh40766/mac")!,
            systemSettingsDeepLink: URL(string: "x-apple.systempreferences:com.apple.preference.network")
        ),
        Recommendation(
            id: "content-blocker",
            title: "Use a reputable content / tracker blocker in your browser",
            category: .browser,
            valueProposition:
                "Blocks or defangs many third-party scripts and trackers before they run, shrinking the data sent to ad networks "
                + "and reducing cross-site profiling in the browser.",
            whyNecessary:
                "Typical news and app sites load dozens of third parties. Blockers cut that noise and often improve load time; "
                + "they are one of the highest-impact steps for everyday web tracking.",
            limitations:
                "Sites that depend on third-party scripts may break until you allowlist them. "
                + "Blockers do not stop server-side tracking or fingerprinting by first parties. "
                + "Install only from your browser’s official add-on store.",
            officialURL: URL(string: "https://addons.mozilla.org/firefox/addon/ublock-origin/")!
        ),
        Recommendation(
            id: "safari-itp",
            title: "Harden Safari against cross-site tracking",
            category: .browser,
            valueProposition:
                "Safari’s Intelligent Tracking Prevention limits cross-site cookies and storage used for tracking, "
                + "raising the cost of following you across unrelated sites in Apple’s browser.",
            whyNecessary:
                "Default browser settings are tuned for compatibility. Reviewing Safari privacy options aligns the browser "
                + "with stricter anti-tracking behavior when you are comfortable with occasional site quirks.",
            limitations:
                "ITP does not block ads by itself and is not a substitute for a content blocker if you want script-level control. "
                + "Some login or payment flows rely on cross-site cookies and may need temporary exceptions.",
            officialURL: URL(string: "https://support.apple.com/guide/safari/ip-prevention-sfri40732/mac")!
        ),
        Recommendation(
            id: "macos-privacy-review",
            title: "Review macOS Privacy & Security permissions",
            category: .os,
            valueProposition:
                "Turning off unnecessary location, camera, microphone, and analytics sharing reduces involuntary telemetry "
                + "and accidental data exposure from apps you have installed.",
            whyNecessary:
                "Apps request sensitive capabilities over time. A periodic review catches stale grants that are no longer justified.",
            limitations:
                "Disabling diagnostics may make bug reports less useful to Apple or developers. "
                + "Some features legitimately need location or Bluetooth; turning them off can break workflows.",
            officialURL: URL(string: "https://support.apple.com/guide/mac-help/mh32356/mac")!,
            systemSettingsDeepLink: URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy")!
        ),
    ]
}
