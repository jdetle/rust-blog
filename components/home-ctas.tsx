"use client";

import Link from "next/link";
import posthog from "posthog-js";

export function HomeCtas() {
  return (
    <div className="cta-row">
      <Link
        className="btn btn-primary"
        href="/posts"
        onClick={() => posthog.capture("cta_clicked", { label: "read_blog" })}
      >
        Read the blog
      </Link>
      <Link
        className="btn btn-secondary"
        href="/who-are-you"
        onClick={() => posthog.capture("cta_clicked", { label: "who_are_you" })}
      >
        Who are you?
      </Link>
      <a
        className="btn btn-secondary"
        href="mailto:"
        onClick={() => posthog.capture("cta_clicked", { label: "get_in_touch" })}
      >
        Get in touch
      </a>
    </div>
  );
}
