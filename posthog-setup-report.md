<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the rust-blog Next.js 15.3 App Router project. PostHog is now initialized via `instrumentation-client.ts` (the recommended approach for Next.js 15.3+) using the `posthog-js` npm package with a reverse proxy through `/ingest`. The previous snippet-based initialization in `components/analytics-provider.tsx` has been removed to avoid double initialization.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `cta_clicked` | Home page CTA button click, with `label` property (`read_blog`, `who_are_you`, `get_in_touch`) | `components/home-ctas.tsx` (client component, used in `app/page.tsx`) |
| `post_read` | Blog post page loaded — top of content engagement funnel, with `slug` and `title` properties | `components/post-read-tracker.tsx` (client component, used in `app/posts/[slug]/page.tsx`) |
| `profile_detection_complete` | Browser fingerprinting finishes on the who-are-you page, with `signal_count`, `referrer_type`, and `verdict` | `components/who-are-you/client-profile.tsx` |
| `vpn_verdict_shown` | VPN/proxy assessment verdict displayed, with `verdict` and `confidence` properties | `components/who-are-you/client-profile.tsx` |

## Files created or modified

- **Created** `instrumentation-client.ts` — initializes `posthog-js` for all client-side tracking
- **Modified** `next.config.ts` — added `/ingest` reverse proxy rewrites for PostHog and `skipTrailingSlashRedirect: true`
- **Created** `lib/posthog-server.ts` — server-side PostHog client (available for future server-side events)
- **Created** `components/home-ctas.tsx` — client component wrapping home page CTAs with click tracking
- **Created** `components/post-read-tracker.tsx` — lightweight client component that fires `post_read` on mount
- **Modified** `components/analytics-provider.tsx` — removed PostHog snippet init (superseded by `instrumentation-client.ts`)
- **Modified** `components/who-are-you/client-profile.tsx` — added `vpn_verdict_shown` and `profile_detection_complete` events
- **Modified** `app/page.tsx` — uses `HomeCtas` component
- **Modified** `app/posts/[slug]/page.tsx` — uses `PostReadTracker` component

## Install step required

Run the following to install the PostHog packages (blocked by sandbox during setup):

```bash
bun add posthog-js posthog-node
```

## Next steps

We've built a dashboard and five insights for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/346322/dashboard/1370309
- **CTA Clicks by Label**: https://us.posthog.com/project/346322/insights/1J2owrGm
- **Post Reads Over Time**: https://us.posthog.com/project/346322/insights/LvNHuvy6
- **VPN Verdict Distribution**: https://us.posthog.com/project/346322/insights/HIuJB7Ne
- **Home → Blog Conversion Funnel**: https://us.posthog.com/project/346322/insights/efaSQBIg
- **Who Are You? Profile Detection Completion**: https://us.posthog.com/project/346322/insights/FFKXa8BJ

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
