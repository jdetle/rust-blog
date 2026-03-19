import type { Metadata } from "next";
import { headers } from "next/headers";
import { AnimatedFrame } from "@/components/animated-frame";
import { NavRow } from "@/components/nav-row";
import { ClientProfile } from "@/components/who-are-you/client-profile";

export const metadata: Metadata = {
	title: "Who Are You?",
	description:
		"A live demonstration of what a website can learn about you from your browser, including edge detection and VPN analysis.",
};

export default async function WhoAreYouPage() {
	const hdrs = await headers();

	const serverGeo = {
		ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
		city: hdrs.get("x-vercel-ip-city") ?? null,
		region: hdrs.get("x-vercel-ip-country-region") ?? null,
		country: hdrs.get("x-vercel-ip-country") ?? null,
		latitude: hdrs.get("x-vercel-ip-latitude") ?? null,
		longitude: hdrs.get("x-vercel-ip-longitude") ?? null,
		timezone: hdrs.get("x-vercel-ip-timezone") ?? null,
	};

	const edgeInfo = {
		pop:
			hdrs.get("x-edge-pop") ?? hdrs.get("x-vercel-id")?.split("::")[0] ?? null,
		timestamp: hdrs.get("x-edge-timestamp") ?? null,
	};

	return (
		<main className="site-shell">
			<AnimatedFrame className="article">
				<header className="list-header">
					<p className="eyebrow">Transparency</p>
					<h1 className="page-title">Here&apos;s what I know about you</h1>
					<p className="byline">
						Everything below was gathered by your browser and my edge servers in
						the last few seconds.
					</p>
				</header>

				<article className="article-content">
					<p>
						This page is a live demonstration of what a website can learn about
						you just from your browser. No accounts, no cookies from previous
						visits &mdash; just the information your device volunteers on every
						page load. The analytics tools running on this blog collect subsets
						of this data automatically.
					</p>
					<p>
						The <strong>Origin Intelligence</strong> section below uses edge
						compute to analyze your IP at the server closest to you, then
						cross-references it with your browser&apos;s timezone, language, and
						WebRTC signals to determine whether your connection is a genuine
						household IP or being routed through a VPN, proxy, or datacenter.
					</p>

					<ClientProfile serverGeo={serverGeo} edgeInfo={edgeInfo} />
				</article>

				<NavRow
					links={[
						{ href: "/posts", label: "All posts" },
						{ href: "/", label: "Home" },
					]}
				/>
			</AnimatedFrame>
		</main>
	);
}
