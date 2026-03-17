export function classifyReferrer(url: string): string {
  if (!url) return "direct";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.includes("google.") ||
      host.includes("bing.com") ||
      host.includes("duckduckgo.com")
    )
      return "search";
    if (
      host.includes("twitter.com") ||
      host.includes("x.com") ||
      host.includes("t.co")
    )
      return "social:twitter";
    if (host.includes("linkedin.com")) return "social:linkedin";
    if (host.includes("reddit.com")) return "social:reddit";
    if (host.includes("news.ycombinator.com")) return "social:hackernews";
    if (host.includes("github.com")) return "social:github";
    if (host.includes("facebook.com")) return "social:facebook";
    return "other:" + host;
  } catch {
    return "other";
  }
}

export function humanizeClass(cls: string): string {
  const map: Record<string, string> = {
    direct: "Direct visit",
    search: "Search engine",
    "social:twitter": "Twitter / X",
    "social:linkedin": "LinkedIn",
    "social:reddit": "Reddit",
    "social:hackernews": "Hacker News",
    "social:github": "GitHub",
    "social:facebook": "Facebook",
  };
  if (map[cls]) return map[cls];
  if (cls.startsWith("other:")) return "External (" + cls.split(":")[1] + ")";
  return cls;
}
