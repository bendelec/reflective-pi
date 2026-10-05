import assert from "node:assert";
import { describe, it } from "node:test";
import { CURSOR_MARKER } from "../src/tui.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { normalizeTerminalOutput } from "../src/utils.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

const RESET = "\x1b[0m\x1b]8;;\x07";

class CountingTui extends TuiMainScreen {
	preprocessCount = 0;

	exposeApplyLineResets(lines: string[]): string[] {
		return this.applyLineResets(lines);
	}

	exposeResetRenderState(): void {
		this.resetRenderState();
	}

	override preprocessLine(line: string): string {
		this.preprocessCount++;
		return super.preprocessLine(line);
	}
}

describe("main-screen transcript line preprocessing cache", () => {
	it("reuses pure normalized results across unchanged, changed, and reordered lines", () => {
		const tui = new CountingTui(new VirtualTerminal());
		const first = ["plain", "\x1b[31mred\x1b[0m", "first\r\nsecond", `${CURSOR_MARKER}cursor`];
		const expected = first.map((line) => `${normalizeTerminalOutput(line)}${RESET}`);

		assert.deepStrictEqual(tui.exposeApplyLineResets([...first]), expected);
		assert.strictEqual(tui.preprocessCount, first.length);
		assert.deepStrictEqual(tui.exposeApplyLineResets([...first]), expected);
		assert.strictEqual(tui.preprocessCount, first.length, "an unchanged frame should hit the cache");

		const changed = [first[2]!, "updated", first[0]!];
		assert.deepStrictEqual(
			tui.exposeApplyLineResets([...changed]),
			changed.map((line) => `${normalizeTerminalOutput(line)}${RESET}`),
		);
		assert.strictEqual(tui.preprocessCount, first.length + 1, "only a new string value should be transformed");
	});

	it("keeps image sequences byte-for-byte unchanged and reuses duplicate values", () => {
		const tui = new CountingTui(new VirtualTerminal());
		const imageLine = "\x1b_Ga=i,i=42,r=2;AAAA\x1b\\";
		const lines = [imageLine, "reserved row", "\x1b]8;;https://example.test\x07linked\x1b]8;;\x07"];
		const rendered = tui.exposeApplyLineResets([...lines]);
		assert.strictEqual(rendered[0], imageLine);
		assert.strictEqual(rendered[1], `${normalizeTerminalOutput(lines[1]!)}${RESET}`);
		assert.strictEqual(rendered[2], `${normalizeTerminalOutput(lines[2]!)}${RESET}`);
		assert.strictEqual(tui.preprocessCount, 2);

		const duplicates = ["same", "same", "same"];
		tui.exposeApplyLineResets(duplicates);
		assert.strictEqual(tui.preprocessCount, 3, "duplicate values should reuse one preprocessing result");
		assert.deepStrictEqual(duplicates, Array(3).fill(`${normalizeTerminalOutput("same")}${RESET}`));
	});

	it("reuses processing across viewport resize, then clears the cache on invalidation, reset, and stop", () => {
		const terminal = new VirtualTerminal(20, 5);
		const tui = new CountingTui(terminal);
		const original = ["one", "two"];
		tui.addChild({ render: () => original, invalidate: () => {} });

		tui.renderNow();
		assert.strictEqual(tui.preprocessCount, 2);
		terminal.resize(30, 5);
		tui.renderNow();
		assert.strictEqual(tui.preprocessCount, 2, "width changes do not change line-derived normalization");

		tui.invalidate();
		tui.exposeApplyLineResets([...original]);
		assert.strictEqual(tui.preprocessCount, 4);
		tui.exposeResetRenderState();
		tui.exposeApplyLineResets([...original]);
		assert.strictEqual(tui.preprocessCount, 6);
		tui.stop({ preserveScreen: true });
		tui.exposeApplyLineResets([...original]);
		assert.strictEqual(tui.preprocessCount, 8);
	});

	it("reuses every distinct line across 300-message frames and drops lines after removal", () => {
		const tui = new CountingTui(new VirtualTerminal());
		const transcript = Array.from({ length: 300 }, (_, message) =>
			Array.from({ length: 4 }, (_, line) => `message ${message} line ${line}`),
		).flat();
		assert.ok(transcript.length > 512, "transcript should exceed the former cache-entry limit");

		tui.exposeApplyLineResets([...transcript]);
		assert.strictEqual(tui.preprocessCount, transcript.length);
		tui.exposeApplyLineResets([...transcript]);
		assert.strictEqual(tui.preprocessCount, transcript.length, "the next frame should reuse all prior results");

		tui.exposeApplyLineResets(["replacement"]);
		const beforeReintroducedLine = tui.preprocessCount;
		tui.exposeApplyLineResets([transcript[0]!]);
		assert.strictEqual(
			tui.preprocessCount,
			beforeReintroducedLine + 1,
			"lines absent from the current and previous frames should not be retained",
		);
	});
});
