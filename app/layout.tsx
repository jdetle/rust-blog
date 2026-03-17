import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { AnalyticsProvider } from "@/components/analytics-provider";

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
				<Analytics />
				<SpeedInsights />
			</body>
		</html>
	);
}
