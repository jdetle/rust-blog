import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
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
			<body>
				{children}
				<AnalyticsProvider />
				<VercelAnalyticsWithFingerprint />
				<SpeedInsights />
			</body>
		</html>
	);
}
