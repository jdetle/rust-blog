import AppKit
import SwiftUI

private enum WizardRoute: Hashable {
    case step(Int)
    case summary
}

struct WizardRootView: View {
    private let items = Recommendations.all

    @State private var path = NavigationPath()
    @State private var optedIn: [String: Bool] = [:]

    var body: some View {
        NavigationStack(path: $path) {
            introView
                .navigationTitle("Privacy onboarding")
                .navigationDestination(for: WizardRoute.self) { route in
                    switch route {
                    case .step(let index):
                        if index >= 0, index < items.count {
                            stepView(items[index], stepIndex: index)
                                .navigationTitle("Step \(index + 1) of \(items.count)")
                        } else {
                            EmptyView()
                        }
                    case .summary:
                        summaryView
                            .navigationTitle("Summary")
                    }
                }
        }
        .frame(minWidth: 480, minHeight: 560)
        .onAppear {
            for r in items {
                if optedIn[r.id] == nil {
                    optedIn[r.id] = false
                }
            }
        }
    }

    private var introView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Optional steps to reduce everyday web and OS-level tracking.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Text("What this wizard does")
                .font(.headline)
            Text(
                "This app walks you through privacy choices you can make on your Mac. "
                    + "Each step is optional and off by default. "
                    + "We do not install third-party software for you or silently change settings—"
                    + "we open official documentation or System Settings when you ask."
            )
            .fixedSize(horizontal: false, vertical: true)

            Text("What it does not do")
                .font(.headline)
                .padding(.top, 6)
            Text(
                "It is not a VPN, does not guarantee anonymity, and cannot block every tracker. "
                    + "Links leave this app and open in your default browser or System Settings."
            )
            .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            HStack {
                Spacer()
                if items.isEmpty {
                    Text("No steps are configured.")
                        .foregroundStyle(.secondary)
                } else {
                    NavigationLink(value: WizardRoute.step(0)) {
                        Text("Continue")
                    }
                    .keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func stepView(_ rec: Recommendation, stepIndex: Int) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(rec.category.displayName)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.quaternary.opacity(0.6))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    Spacer()
                }

                Text(rec.title)
                    .font(.title3.weight(.semibold))

                Group {
                    Text("Value")
                        .font(.subheadline.weight(.semibold))
                    Text(rec.valueProposition)
                        .font(.body)
                }

                DisclosureGroup("When this matters") {
                    Text(rec.whyNecessary)
                        .font(.body)
                        .padding(.top, 4)
                }

                DisclosureGroup("Limitations and tradeoffs") {
                    Text(rec.limitations)
                        .font(.body)
                        .padding(.top, 4)
                }

                Toggle(
                    "I want to explore this setup (optional)",
                    isOn: binding(for: rec.id)
                )
                .toggleStyle(.switch)
                .accessibilityLabel("Opt in to explore \(rec.title)")

                HStack(spacing: 12) {
                    Button("Open official page in browser") {
                        URLOpener.openInBrowser(rec.officialURL)
                    }
                    .keyboardShortcut(.defaultAction)

                    if let settings = rec.systemSettingsDeepLink {
                        Button("Open related System Settings") {
                            URLOpener.openSystemSettings(settings)
                        }
                    }
                }
                .padding(.top, 4)

                Spacer(minLength: 16)

                HStack {
                    Spacer()
                    if stepIndex + 1 < items.count {
                        NavigationLink(value: WizardRoute.step(stepIndex + 1)) {
                            Text("Next")
                        }
                        .keyboardShortcut(.defaultAction)
                    } else {
                        NavigationLink(value: WizardRoute.summary) {
                            Text("Next")
                        }
                        .keyboardShortcut(.defaultAction)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(20)
    }

    private var summaryView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Your choices")
                    .font(.headline)

                Text(
                    "You opted in to explore the steps below. "
                        + "Use each link again if you need to finish setup on the vendor’s site or in System Settings."
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

                ForEach(items.filter { optedIn[$0.id] == true }) { rec in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(rec.title)
                            .font(.body.weight(.semibold))
                        HStack(spacing: 10) {
                            Button("Open official page") {
                                URLOpener.openInBrowser(rec.officialURL)
                            }
                            if let settings = rec.systemSettingsDeepLink {
                                Button("System Settings") {
                                    URLOpener.openSystemSettings(settings)
                                }
                            }
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.quaternary.opacity(0.35))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                if items.allSatisfy({ optedIn[$0.id] != true }) {
                    Text("You did not opt in to any steps. That is fine—you can run this wizard again anytime.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(20)
        .safeAreaInset(edge: .bottom) {
            HStack {
                Spacer()
                Button("Done") {
                    NSApp.terminate(nil)
                }
                .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
    }

    private func binding(for id: String) -> Binding<Bool> {
        Binding(
            get: { optedIn[id, default: false] },
            set: { optedIn[id] = $0 }
        )
    }
}

/// Opens only browser-safe URLs (`http`/`https`). See repo outbound URL rules for dynamic URLs.
enum URLOpener {
    static func openInBrowser(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else { return }
        NSWorkspace.shared.open(url)
    }

    static func openSystemSettings(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "x-apple.systempreferences" else { return }
        NSWorkspace.shared.open(url)
    }
}

#Preview {
    WizardRootView()
}
