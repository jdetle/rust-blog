/**
 * Minimal mock Anthropic Messages API server for Playwright e2e tests.
 *
 * Responds to POST /v1/messages with a canned SVG + persona payload that
 * passes sanitize_svg validation. Exposes GET /__calls to let tests assert
 * exactly how many times the upstream was called.
 *
 * Binds to 127.0.0.1 (never 0.0.0.0) so it is not reachable on the network
 * during CI — only the local test processes can connect.
 *
 * Usage:
 *   MOCK_ANTHROPIC_PORT=9090 bun run scripts/e2e/mock-anthropic.ts
 */

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? "9090");

const PERSONA =
	"Probably a curious builder who reads long posts — just a guess.";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">` +
	`<circle cx="64" cy="64" r="50" fill="#4a90d9"/>` +
	`<rect x="40" y="40" width="20" height="20" fill="#e8c547"/>` +
	`</svg>`;

let callCount = 0;

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);

		if (url.pathname === "/__calls" && req.method === "GET") {
			return Response.json({ calls: callCount });
		}

		if (url.pathname === "/__reset" && req.method === "POST") {
			callCount = 0;
			return Response.json({ reset: true });
		}

		if (url.pathname === "/v1/messages" && req.method === "POST") {
			callCount++;
			return Response.json({
				id: `msg_mock_${callCount}`,
				type: "message",
				role: "assistant",
				content: [
					{
						type: "text",
						text: `PERSONA: ${PERSONA}\nSVG: ${SVG}`,
					},
				],
				model: "claude-3-5-sonnet-20241022",
				stop_reason: "end_turn",
				usage: { input_tokens: 10, output_tokens: 80 },
			});
		}

		return new Response("Not Found", { status: 404 });
	},
});

console.log(`mock-anthropic listening on http://127.0.0.1:${server.port}`);
