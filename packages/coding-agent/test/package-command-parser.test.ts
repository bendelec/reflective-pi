import { describe, expect, it } from "vitest";
import { BINARY_NAME } from "../src/config.ts";
import { parsePackageCommand } from "../src/package-manager-cli.ts";

describe("parsePackageCommand update target resolution", () => {
	it("resolves `update rxpi` to self-update", () => {
		const options = parsePackageCommand(["update", "rxpi"]);
		expect(options?.updateTarget).toEqual({ type: "self" });
	});

	it("resolves `update self` to self-update", () => {
		const options = parsePackageCommand(["update", "self"]);
		expect(options?.updateTarget).toEqual({ type: "self" });
	});

	it("resolves the BINARY_NAME positional to self-update", () => {
		const options = parsePackageCommand(["update", BINARY_NAME]);
		expect(options?.updateTarget).toEqual({ type: "self" });
	});

	it("treats `pi` and other sources as extension sources", () => {
		expect(parsePackageCommand(["update", "pi"])?.updateTarget).toEqual({
			type: "extensions",
			source: "pi",
		});
		expect(parsePackageCommand(["update", "npm:@foo/bar"])?.updateTarget).toEqual({
			type: "extensions",
			source: "npm:@foo/bar",
		});
	});

	it("resolves `update rxpi --extensions` to update all", () => {
		const options = parsePackageCommand(["update", "rxpi", "--extensions"]);
		expect(options?.updateTarget).toEqual({ type: "all" });
	});
});
