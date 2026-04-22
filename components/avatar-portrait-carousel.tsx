"use client";

/**
 * Portrait history UI: always navigates over the **list** from the API (`avatar_urls`),
 * not the lone `avatar_url` field.
 */

export const AVATAR_PORTRAIT_ALT =
	"A personalised portrait generated from regional art traditions and your browser signals. Updates each calendar day.";

export function AvatarPortraitCarousel({
	urls,
	activeIndex,
	setIndex,
	bump,
}: {
	urls: string[];
	activeIndex: number;
	setIndex: (i: number) => void;
	bump: (delta: -1 | 1) => void;
}) {
	const n = urls.length;

	if (n === 0) return null;

	return (
		<section
			className="home-fingerprint-avatar-carousel"
			aria-label="Portrait history"
		>
			<div className="home-fingerprint-avatar-frame">
				{/* biome-ignore lint/performance/noImgElement: data: URIs are not supported by next/image */}
				<img
					src={urls[activeIndex]}
					width={256}
					height={256}
					alt={AVATAR_PORTRAIT_ALT}
					className="home-fingerprint-avatar-img"
					decoding="async"
				/>
				{n > 1 && (
					<div className="home-fingerprint-avatar-carousel-btns">
						<button
							type="button"
							className="home-fingerprint-avatar-carousel-btn"
							onClick={() => bump(-1)}
							aria-label="Previous portrait in history"
						>
							‹
						</button>
						<button
							type="button"
							className="home-fingerprint-avatar-carousel-btn home-fingerprint-avatar-carousel-btn--next"
							onClick={() => bump(1)}
							aria-label="Next portrait in history"
						>
							›
						</button>
					</div>
				)}
			</div>
			{n > 1 && (
				<div
					className="home-fingerprint-avatar-dots"
					role="tablist"
					aria-label="Portrait position"
				>
					{urls.map((u, i) => (
						<button
							key={u}
							type="button"
							role="tab"
							aria-selected={i === activeIndex}
							aria-label={`Portrait ${i + 1} of ${n}`}
							className={
								i === activeIndex
									? "home-fingerprint-avatar-dot home-fingerprint-avatar-dot--active"
									: "home-fingerprint-avatar-dot"
							}
							onClick={() => setIndex(i)}
						/>
					))}
				</div>
			)}
		</section>
	);
}
