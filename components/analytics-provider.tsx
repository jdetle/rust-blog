"use client";

import { GoogleAnalytics, GoogleTagManager } from "@next/third-parties/google";
import Script from "next/script";
import { useEffect } from "react";

declare global {
	interface Window {
		dataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
		clarity: (...args: unknown[]) => void;
		fbq: (...args: unknown[]) => void;
	}
}

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "";
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "";
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? "";
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
const PLAUSIBLE_SCRIPT_ID = process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID ?? "";

function isPlaceholder(id: string): boolean {
	return !id || id.includes("XXXXX");
}

export function AnalyticsProvider() {
	useEffect(() => {
		captureUtmAndReferrer();
	}, []);

	return (
		<>
			{/* Google Tag Manager — loads GTM container; configure GA4 and other tags inside GTM */}
			{!isPlaceholder(GTM_ID) && <GoogleTagManager gtmId={GTM_ID} />}

			{/* Google Analytics 4 — use when not using GTM (GA4 can be configured inside GTM instead) */}
			{!isPlaceholder(GA4_ID) && isPlaceholder(GTM_ID) && (
				<GoogleAnalytics gaId={GA4_ID} />
			)}

			{/* Microsoft Clarity */}
			{!isPlaceholder(CLARITY_ID) && (
				<Script id="clarity-init" strategy="afterInteractive">
					{`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window,document,"clarity","script","${CLARITY_ID}");
          `}
				</Script>
			)}

			{/* Meta Pixel */}
			{!isPlaceholder(META_PIXEL_ID) && (
				<>
					<Script id="meta-pixel" strategy="afterInteractive">
						{`
                !function(f,b,e,v,n,t,s){
                  if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                  n.queue=[];t=b.createElement(e);t.async=!0;
                  t.src=v;s=b.getElementsByTagName(e)[0];
                  s.parentNode.insertBefore(t,s);
                }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
                fbq('init', '${META_PIXEL_ID}');
                fbq('track', 'PageView');
              `}
					</Script>
					<noscript>
						{/* biome-ignore lint/performance/noImgElement: Meta Pixel noscript tracking pixel - third-party URL, not optimizable */}
						<img
							height="1"
							width="1"
							style={{ display: "none" }}
							src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
							alt=""
						/>
					</noscript>
				</>
			)}

			{/* Plausible — custom script (pa-XXXXXXXX) */}
			{!isPlaceholder(PLAUSIBLE_SCRIPT_ID) && (
				<>
					<Script
						async
						src={`https://plausible.io/js/${PLAUSIBLE_SCRIPT_ID}.js`}
						strategy="afterInteractive"
					/>
					<Script id="plausible-init" strategy="afterInteractive">
						{`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init();`}
					</Script>
				</>
			)}
		</>
	);
}

function captureUtmAndReferrer() {
	if (typeof window === "undefined") return;

	const params = new URLSearchParams(window.location.search);
	const utmKeys = [
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
	];
	const utm: Record<string, string> = {};
	for (const k of utmKeys) {
		const v = params.get(k);
		if (v) utm[k] = v;
	}
	if (Object.keys(utm).length > 0) {
		sessionStorage.setItem("_utm", JSON.stringify(utm));
	}

	if (document.referrer && !sessionStorage.getItem("_referrer")) {
		sessionStorage.setItem("_referrer", document.referrer);
	}
}
