import type { HeroImage as HeroImageType } from "@/lib/posts";

interface HeroImageProps {
	hero: HeroImageType;
}

export function HeroImage({ hero }: HeroImageProps) {
	return (
		<div className="hero-image">
			<img src={hero.url} alt={hero.alt} loading="eager" />
			{hero.credit && <span className="hero-credit">{hero.credit}</span>}
		</div>
	);
}
