"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import type { PostVersion } from "@/lib/posts";

interface VersionTabsProps {
	versions: PostVersion[];
	defaultVersion: string;
}

export function VersionTabs({ versions, defaultVersion }: VersionTabsProps) {
	const versionKeys = versions.map((v) => v.key) as [string, ...string[]];

	const [activeVersion, setActiveVersion] = useQueryState(
		"v",
		parseAsStringLiteral(versionKeys)
			.withDefault(defaultVersion)
			.withOptions({ history: "replace" }),
	);

	return (
		<nav className="version-tabs" aria-label="Essay versions">
			{versions.map((v) => (
				<button
					key={v.key}
					type="button"
					className={`version-tab${activeVersion === v.key ? " version-tab-active" : ""}`}
					onClick={() => setActiveVersion(v.key)}
					aria-current={activeVersion === v.key ? "page" : undefined}
				>
					{v.label}
				</button>
			))}
		</nav>
	);
}
