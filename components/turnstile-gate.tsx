"use client";

import { useEffect, useRef } from "react";

declare global {
	interface Window {
		turnstile?: {
			render: (
				container: HTMLElement | string,
				options: TurnstileOptions,
			) => string;
			reset: (widgetId: string) => void;
			remove: (widgetId: string) => void;
		};
	}
}

interface TurnstileOptions {
	sitekey: string;
	callback: (token: string) => void;
	"error-callback"?: () => void;
	"expired-callback"?: () => void;
	appearance?: "always" | "execute" | "interaction-only";
	theme?: "light" | "dark" | "auto";
	size?: "normal" | "compact";
}

interface TurnstileGateProps {
	onToken: (token: string) => void;
	onError?: () => void;
}

const SCRIPT_ID = "cf-turnstile-script";
// Trim defensively — env values pulled from some providers (or pasted into
// .env files) can carry trailing whitespace/newlines, which Turnstile rejects.
const SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();

/** Renders a Cloudflare Turnstile widget (interaction-only — invisible for clean traffic).
 *  Calls `onToken` when a token is issued and `onError` on challenge failure.
 *  The parent component should reset on token expiry (tokens live ~300 s). */
export function TurnstileGate({ onToken, onError }: TurnstileGateProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const widgetIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!SITE_KEY) {
			// No site key configured — pass a sentinel token so the rest of the
			// flow can proceed (the server-side verify will reject it if truly missing).
			onToken("__no-site-key__");
			return;
		}

		const renderWidget = () => {
			if (!containerRef.current || !window.turnstile) return;
			if (widgetIdRef.current) return; // already rendered

			widgetIdRef.current = window.turnstile.render(containerRef.current, {
				sitekey: SITE_KEY,
				callback: onToken,
				"error-callback": onError,
				"expired-callback": () => {
					// Token expired — reset so a fresh one is issued.
					if (widgetIdRef.current && window.turnstile) {
						window.turnstile.reset(widgetIdRef.current);
					}
				},
				appearance: "interaction-only",
				theme: "auto",
			});
		};

		if (window.turnstile) {
			renderWidget();
			return;
		}

		// Inject the Turnstile script once.
		if (!document.getElementById(SCRIPT_ID)) {
			const script = document.createElement("script");
			script.id = SCRIPT_ID;
			script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
			script.async = true;
			script.defer = true;
			script.onload = renderWidget;
			document.head.appendChild(script);
		} else {
			// Script already injected by another instance — poll until turnstile is ready.
			const poll = setInterval(() => {
				if (window.turnstile) {
					clearInterval(poll);
					renderWidget();
				}
			}, 100);
			return () => clearInterval(poll);
		}
	}, [onToken, onError]);

	useEffect(
		() => () => {
			if (widgetIdRef.current && window.turnstile) {
				window.turnstile.remove(widgetIdRef.current);
				widgetIdRef.current = null;
			}
		},
		[],
	);

	return (
		<div
			ref={containerRef}
			aria-hidden="true"
			style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
		/>
	);
}
