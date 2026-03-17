"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

export function PostReadTracker({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  useEffect(() => {
    posthog.capture("post_read", { slug, title });
  }, [slug, title]);

  return null;
}
