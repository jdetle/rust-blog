type SharePlatform =
	| "twitter"
	| "linkedin"
	| "reddit"
	| "hackernews"
	| "facebook"
	| "email"
	| "copy_link";

interface ShareUrlOptions {
	path: string;
	platform: SharePlatform;
	campaign: string;
	content: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jdetle.com";

export function buildShareUrl({
	path,
	platform,
	campaign,
	content,
}: ShareUrlOptions): string {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const base = new URL(normalizedPath, SITE_URL);
	base.searchParams.set("utm_source", platform);
	base.searchParams.set("utm_medium", "social");
	base.searchParams.set("utm_campaign", campaign);
	base.searchParams.set("utm_content", content);
	return base.href;
}

export function getPlatformShareUrl(
	platform: SharePlatform,
	utmUrl: string,
	title: string,
): string | null {
	const encodedUrl = encodeURIComponent(utmUrl);
	const encodedTitle = encodeURIComponent(title);

	switch (platform) {
		case "twitter":
			return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
		case "linkedin":
			return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
		case "reddit":
			return `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`;
		case "hackernews":
			return `https://news.ycombinator.com/submitlink?u=${encodedUrl}&t=${encodedTitle}`;
		case "facebook":
			return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
		case "email":
			return `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;
		case "copy_link":
			return null;
	}
}

export type { SharePlatform };
