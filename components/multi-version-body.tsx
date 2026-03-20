"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { AuthorshipBadge } from "@/components/authorship-badge";
import { FootnotedArticle } from "@/components/footnoted-article";
import { VersionTabs } from "@/components/version-tabs";
import type { MultiVersionPost } from "@/lib/posts";

interface MultiVersionBodyProps {
	post: MultiVersionPost;
}

export function MultiVersionBody({ post }: MultiVersionBodyProps) {
	const versionKeys = post.versions.map((v) => v.key) as [
		string,
		...string[],
	];

	const [activeVersion] = useQueryState(
		"v",
		parseAsStringLiteral(versionKeys)
			.withDefault(post.defaultVersion)
			.withOptions({ history: "replace" }),
	);

	const current =
		post.versions.find((v) => v.key === activeVersion) ?? post.versions[0];
	const currentNotes = post.notes[current.key] ?? [];

	const showPrompt = activeVersion === "slop" && post.prompt;

	return (
		<>
			<VersionTabs
				versions={post.versions}
				defaultVersion={post.defaultVersion}
			/>

			<div style={{ margin: "0.6rem 0 0.8rem" }}>
				<AuthorshipBadge authorship={current.authorship} />
			</div>

			{showPrompt && <div className="prompt-block">{post.prompt}</div>}

			<FootnotedArticle bodyHtml={current.bodyHtml} notes={currentNotes} />
		</>
	);
}
