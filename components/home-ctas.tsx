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
			<a
				className="btn btn-secondary"
				href="https://www.linkedin.com/in/jdetlefs/"
				target="_blank"
				rel="noopener noreferrer"
				onClick={() =>
					posthog.capture("cta_clicked", { label: "linkedin" })
				}
			>
				LinkedIn
			</a>
			<a
				className="btn btn-secondary"
				href="https://github.com/jdetle"
				target="_blank"
				rel="noopener noreferrer"
				onClick={() =>
					posthog.capture("cta_clicked", { label: "github" })
				}
			>
				GitHub
			</a>
		</div>
	);
}
