import { describe, expect, test } from "bun:test";
import {
	rustApiUrlForProxyPath,
	rustProxyPathFromSegments,
} from "./rust-api-url";

describe("rustProxyPathFromSegments", () => {
	test("allows safe segments", () => {
		expect(rustProxyPathFromSegments([])).toBe("/");
		expect(rustProxyPathFromSegments(["health"])).toBe("/health");
		expect(rustProxyPathFromSegments(["v1", "info"])).toBe("/v1/info");
	});

	test("rejects unsafe segments", () => {
		expect(rustProxyPathFromSegments([".."])).toBeNull();
		expect(rustProxyPathFromSegments(["foo", "bar/baz"])).toBeNull();
		expect(rustProxyPathFromSegments(["x;y"])).toBeNull();
	});
});

describe("rustApiUrlForProxyPath", () => {
	test("pins origin", () => {
		const prev = process.env.RUST_API_URL;
		process.env.RUST_API_URL = "https://example.azurecontainerapps.io";
		try {
			const u = rustApiUrlForProxyPath("/health");
			expect(u?.href).toBe("https://example.azurecontainerapps.io/health");
		} finally {
			process.env.RUST_API_URL = prev;
		}
	});

	test("returns null when unset", () => {
		const prev = process.env.RUST_API_URL;
		delete process.env.RUST_API_URL;
		try {
			expect(rustApiUrlForProxyPath("/health")).toBeNull();
		} finally {
			process.env.RUST_API_URL = prev;
		}
	});
});
