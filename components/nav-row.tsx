import Link from "next/link";

interface NavRowProps {
	links?: { href: string; label: string }[];
}

const DEFAULT_LINKS = [
	{ href: "/posts", label: "All posts" },
	{ href: "/who-are-you", label: "Who are you?" },
	{ href: "/work-with-me", label: "Work with me" },
	{ href: "/", label: "Home" },
];

export function NavRow({ links = DEFAULT_LINKS }: NavRowProps) {
	return (
		<nav className="nav-row">
			{links.map((l) => (
				<Link key={l.href} href={l.href}>
					{l.label}
				</Link>
			))}
		</nav>
	);
}
