/** Canvas hash used across the site for stable browser fingerprinting (who-are-you + home snapshot). */

const PLAYWRIGHT_FP = "__PLAYWRIGHT_FP__";

function readPlaywrightFingerprintOverride(): string | null {
	if (process.env.NODE_ENV === "production") return null;
	if (typeof window === "undefined") return null;
	const v = (window as unknown as Record<string, string | undefined>)[
		PLAYWRIGHT_FP
	];
	if (typeof v === "string" && /^[0-9a-f]{8}$/i.test(v)) {
		return v.toLowerCase();
	}
	return null;
}

export function canvasFingerprint(): string {
	const override = readPlaywrightFingerprintOverride();
	if (override) return override;
	try {
		const canvas = document.createElement("canvas");
		canvas.width = 280;
		canvas.height = 40;
		const ctx = canvas.getContext("2d");
		if (!ctx) return "Canvas blocked";
		ctx.textBaseline = "top";
		ctx.font = "14px 'Arial'";
		ctx.fillStyle = "#f60";
		ctx.fillRect(125, 1, 62, 20);
		ctx.fillStyle = "#069";
		ctx.fillText("jdetle.com \u{1F31F} fingerprint", 2, 15);
		ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
		ctx.fillText("jdetle.com \u{1F31F} fingerprint", 4, 17);
		const data = canvas.toDataURL();
		let hash = 0;
		for (let i = 0; i < data.length; i++) {
			hash = (hash << 5) - hash + data.charCodeAt(i);
			hash = hash & hash;
		}
		let hex = (hash >>> 0).toString(16);
		while (hex.length < 8) hex = `0${hex}`;
		return hex;
	} catch {
		return "Canvas blocked";
	}
}
