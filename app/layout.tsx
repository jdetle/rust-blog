import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { VercelAnalyticsWithFingerprint } from "@/components/vercel-analytics-with-fingerprint";

import "@/public/blog.css";

export const metadata: Metadata = {
	title: {
		default: "John Detlefs - Journal",
		template: "%s - John Detlefs",
	},
	description:
		"Essays on reliability and product craft by John Detlefs, Senior Cloud Developer.",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossOrigin="anonymous"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body>
				<NuqsAdapter>{children}</NuqsAdapter>
				<AnalyticsProvider />
				<VercelAnalyticsWithFingerprint />
				<SpeedInsights />
			</body>
		</html>
	);
}
