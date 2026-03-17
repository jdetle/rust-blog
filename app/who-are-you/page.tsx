import type { Metadata } from "next";
import { headers } from "next/headers";
import { NavRow } from "@/components/nav-row";
import { ClientProfile } from "@/components/who-are-you/client-profile";

export const metadata: Metadata = {
  title: "Who Are You?",
  description:
    "A live demonstration of what a website can learn about you from your browser.",
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

  return (
    <main className="site-shell">
      <div className="frame article">
        <header className="list-header">
          <p className="eyebrow">Transparency</p>
          <h1 className="page-title">Here&apos;s what I know about you</h1>
          <p className="byline">
            Everything below was gathered by your browser in the last few
            seconds.
          </p>
        </header>

        <article className="article-content">
          <p>
            This page is a live demonstration of what a website can learn about
            you just from your browser. No accounts, no cookies from previous
            visits &mdash; just the information your device volunteers on every
            page load. The analytics tools running on this blog (Google
            Analytics, Microsoft Clarity, Plausible, PostHog, and Vercel
            Analytics) collect subsets of this data automatically.
          </p>

          <ClientProfile serverGeo={serverGeo} />
        </article>

        <NavRow
          links={[
            { href: "/posts", label: "All posts" },
            { href: "/", label: "Home" },
          ]}
        />
      </div>
    </main>
  );
}
