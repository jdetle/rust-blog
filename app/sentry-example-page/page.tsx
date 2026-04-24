"use client";

class SentryExampleFrontendError extends Error {
	constructor() {
		super("Sentry Example Frontend error");
		this.name = "SentryExampleFrontendError";
	}
}

export default function SentryExamplePage() {
	const dsnSet = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

	return (
		<main className="mx-auto max-w-2xl space-y-6 p-8 font-sans" lang="en">
			<h1 className="text-2xl font-semibold">Sentry + Next.js</h1>
			<p>
				{dsnSet
					? "NEXT_PUBLIC_SENTRY_DSN is set."
					: "Add NEXT_PUBLIC_SENTRY_DSN in .env.local to send events."}
			</p>
			<div className="flex flex-col gap-3">
				<button
					type="button"
					className="rounded border border-zinc-300 bg-white px-3 py-2 text-left"
					onClick={() => {
						throw new SentryExampleFrontendError();
					}}
				>
					Trigger client error
				</button>
				<button
					type="button"
					className="rounded border border-zinc-300 bg-white px-3 py-2 text-left"
					onClick={() => {
						void fetch("/api/sentry-example-api");
					}}
				>
					Trigger server route error
				</button>
			</div>
		</main>
	);
}
