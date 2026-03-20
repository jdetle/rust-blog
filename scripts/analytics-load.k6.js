/**
 * k6 load script for analytics-ingestion: POST /api/events + GET /user-events.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:8080 k6 run scripts/analytics-load.k6.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:8080";
const SESSION = __ENV.K6_SESSION_ID || "load-test-user";

export const options = {
	stages: [
		{ duration: "30s", target: 20 },
		{ duration: "1m", target: 50 },
		{ duration: "30s", target: 0 },
	],
	thresholds: {
		http_req_failed: ["rate<0.05"],
		http_req_duration: ["p(95)<2000"],
	},
};

export default function () {
	const payload = JSON.stringify({
		event_type: "k6_load",
		page_url: "https://example.com/k6",
		session_id: SESSION,
		referrer: "",
		user_agent: "k6",
		properties: { run: "analytics-load" },
	});

	const ingest = http.post(`${BASE}/api/events`, payload, {
		headers: { "Content-Type": "application/json" },
	});
	check(ingest, {
		"ingest 2xx": (r) => r.status >= 200 && r.status < 300,
	});

	sleep(0.3);

	const read = http.get(
		`${BASE}/user-events?fingerprint=${encodeURIComponent(SESSION)}&limit=20`,
	);
	check(read, {
		"read 2xx": (r) => r.status >= 200 && r.status < 300,
	});

	sleep(0.5);
}
