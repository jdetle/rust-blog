### jdetle.com

Personal blog and journal by John Detlefs. Next.js App Router frontend deployed on Vercel, with the original Rust Axum server preserved for local development and future performance-critical features.

### Architecture

```
app/                   Next.js App Router pages (SSG + dynamic)
components/            React components (analytics, nav, profiling)
content/posts/         Raw HTML blog posts (source of truth)
lib/                   Server-side utilities (post parser, referral logic)
middleware.ts          Edge Middleware for UTM/referrer tracking
public/blog.css        Shared wabi-sabi stylesheet
src/                   Rust Axum server (local dev, optional)
```

### Running (Next.js)

```bash
bun install
bun run dev
```

Open http://localhost:3000.

### Running (Rust — local dev)

```bash
cargo run
```

Serves from `posts/` on http://127.0.0.1:3000.

### Analytics

Five analytics platforms are wired in `components/analytics-provider.tsx`:

| Platform | Env var | Signup |
|---|---|---|
| Google Analytics 4 | `NEXT_PUBLIC_GA4_ID` | [analytics.google.com](https://analytics.google.com) |
| Microsoft Clarity | `NEXT_PUBLIC_CLARITY_ID` | [clarity.microsoft.com](https://clarity.microsoft.com) |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY` | [posthog.com](https://posthog.com) |
| Plausible | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | [plausible.io](https://plausible.io) ($9/mo) |
| Vercel Analytics | Built-in | Enabled in Vercel dashboard |

Copy `.env.example` to `.env.local` and fill in your IDs. Placeholder values (containing `XXXXX`) are automatically skipped — no scripts fire until you add real IDs.

For production, add these as Vercel Environment Variables in the project settings. They'll be injected at build time.

### Pages

| Route | Description |
|---|---|
| `/` | Homepage — bio, selected work, editorial note |
| `/posts` | Post archive — reverse chronological listing |
| `/posts/:slug` | Individual post (SSG at build time) |
| `/who-are-you` | Live visitor profiling — shows what the site knows about you |

### Deploying

Push to `main`. Vercel auto-deploys. No `vercel.json` needed — Next.js handles all routing.
