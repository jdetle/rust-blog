"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PostNote } from "@/lib/posts";

interface FootnotedArticleProps {
	bodyHtml: string;
	notes: PostNote[];
}

export function FootnotedArticle({ bodyHtml, notes }: FootnotedArticleProps) {
	const articleRef = useRef<HTMLDivElement>(null);
	const [expandedNote, setExpandedNote] = useState<number | null>(null);

	const toggleNote = useCallback(
		(id: number) => {
			setExpandedNote((prev) => (prev === id ? null : id));
		},
		[],
	);

	const notesMap = new Map(notes.map((n) => [n.id, n.note]));

	useEffect(() => {
		const el = articleRef.current;
		if (!el) return;

		const annotated = el.querySelectorAll<HTMLElement>("[data-note]");
		for (const span of annotated) {
			const noteId = Number(span.dataset.note);
			if (!notesMap.has(noteId)) continue;

			span.classList.add("annotated");

			const existing = span.querySelector(".note-ref");
			if (existing) continue;

			const sup = document.createElement("sup");
			sup.className = "note-ref";
			sup.textContent = String(noteId);
			sup.setAttribute("role", "button");
			sup.setAttribute("tabindex", "0");
			sup.setAttribute("aria-label", `Note ${noteId}`);
			span.appendChild(sup);
		}
	}, [bodyHtml, notesMap]);

	useEffect(() => {
		const el = articleRef.current;
		if (!el) return;

		function handleClick(e: Event) {
			const target = e.target as HTMLElement;
			const sup = target.closest(".note-ref");
			if (!sup) return;
			const span = sup.closest("[data-note]") as HTMLElement | null;
			if (!span) return;
			const noteId = Number(span.dataset.note);
			toggleNote(noteId);
		}

		function handleKeyDown(e: Event) {
			const ke = e as KeyboardEvent;
			if (ke.key !== "Enter" && ke.key !== " ") return;
			const target = ke.target as HTMLElement;
			if (!target.classList.contains("note-ref")) return;
			ke.preventDefault();
			const span = target.closest("[data-note]") as HTMLElement | null;
			if (!span) return;
			const noteId = Number(span.dataset.note);
			toggleNote(noteId);
		}

		el.addEventListener("click", handleClick);
		el.addEventListener("keydown", handleKeyDown);
		return () => {
			el.removeEventListener("click", handleClick);
			el.removeEventListener("keydown", handleKeyDown);
		};
	}, [toggleNote]);

	if (notes.length === 0) {
		return (
			<article
				className="article-content"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted post content
				dangerouslySetInnerHTML={{ __html: bodyHtml }}
			/>
		);
	}

	return (
		<div className="article-versioned">
			<article
				ref={articleRef}
				className="article-content"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted post content
				dangerouslySetInnerHTML={{ __html: bodyHtml }}
			/>

			<aside className="sidenote-column" aria-label="Author notes">
				{notes.map((note) => (
					<div
						key={note.id}
						className={`sidenote${expandedNote === note.id ? " sidenote-active" : ""}`}
						data-for-note={note.id}
					>
						<span className="sidenote-number">{note.id}</span>
						<p className="sidenote-text">{note.note}</p>
					</div>
				))}
			</aside>

			<div className="footnote-mobile" aria-live="polite">
				{expandedNote !== null && notesMap.has(expandedNote) && (
					<div className="footnote-inline">
						<span className="sidenote-number">{expandedNote}</span>
						<p className="sidenote-text">{notesMap.get(expandedNote)}</p>
						<button
							type="button"
							className="footnote-close"
							onClick={() => setExpandedNote(null)}
							aria-label="Close note"
						>
							&times;
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
