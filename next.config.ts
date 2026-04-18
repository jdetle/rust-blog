import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	outputFileTracingIncludes: {
		"/*": ["./posts/**/*"],
	},
	async redirects() {
		return [
			{
				source: "/posts/guardian-terraform-and-big-corp-discipline",
				destination: "/posts/jdetle-guardian",
				permanent: true,
			},
		];
	},
	async rewrites() {
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
		];
	},
	skipTrailingSlashRedirect: true,
};

export default nextConfig;
