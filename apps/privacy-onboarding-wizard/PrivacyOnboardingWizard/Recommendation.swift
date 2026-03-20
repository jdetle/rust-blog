import Foundation

/// Category for grouping recommendations in the wizard UI.
enum RecommendationCategory: String, CaseIterable, Sendable {
    case network
    case browser
    case os

    var displayName: String {
        switch self {
        case .network: "Network"
        case .browser: "Browser"
        case .os: "System"
        }
    }
}

/// One third-party or system-assisted privacy step. All outbound links use HTTPS (or optional system-settings scheme).
struct Recommendation: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let category: RecommendationCategory
    /// User-facing: why this step is worth considering (benefit).
    let valueProposition: String
    /// User-facing: threat model / when this matters.
    let whyNecessary: String
    /// User-facing: tradeoffs, breakage, what this does *not* solve.
    let limitations: String
    /// Official documentation or install page opened in the default browser.
    let officialURL: URL
    /// Optional deep link to System Settings (never opened without user action).
    let systemSettingsDeepLink: URL?

    init(
        id: String,
        title: String,
        category: RecommendationCategory,
        valueProposition: String,
        whyNecessary: String,
        limitations: String,
        officialURL: URL,
        systemSettingsDeepLink: URL? = nil
    ) {
        self.id = id
        self.title = title
        self.category = category
        self.valueProposition = valueProposition
        self.whyNecessary = whyNecessary
        self.limitations = limitations
        self.officialURL = officialURL
        self.systemSettingsDeepLink = systemSettingsDeepLink
    }
}
