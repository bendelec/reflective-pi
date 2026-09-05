import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import type { PruneBlock } from "../../src/core/prune.ts";
import {
	formatPruneAccountingVerdict,
	PRUNE_ACCOUNTING_WINDOW_TURNS,
	PruneAccounting,
} from "../../src/core/prune-accounting.ts";
import type { SessionEntry } from "../../src/core/session-manager.ts";

const CWD = "/workspace";

let entrySeq = 0;
function toolEntry(path: string, name: "read" | "edit" = "read"): SessionEntry {
	entrySeq++;
	return {
		type: "message",
		id: `entry-${entrySeq}`,
		parentId: null,
		timestamp: "2026-09-05T18:00:00.000Z",
		message: fauxAssistantMessage([fauxToolCall(name, { path })]),
	};
}

function pruneBlock(paths: string[], name: "read" | "edit" = "read"): PruneBlock {
	const entries = paths.map((p) => toolEntry(p, name));
	return { entryIds: entries.map((e) => e.id), entries };
}

/** Advance the window by one counting turn (the prune turn itself is skipped). */
function advance(a: PruneAccounting) {
	const v = a.onTurnEnd();
	expect(v).toBeUndefined();
}

describe("PruneAccounting", () => {
	it("matches re-reads across relative and absolute paths", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["docs/readme.md"])]);
		advance(a); // prune turn
		a.onToolUse("read", `${CWD}/docs/readme.md`, 4000);
		for (let i = 1; i < PRUNE_ACCOUNTING_WINDOW_TURNS; i++) advance(a);
		const verdict = a.onTurnEnd();
		expect(verdict?.kind).toBe("negative");
		expect(verdict?.files).toEqual([`${CWD}/docs/readme.md`]);
		expect(verdict?.chars).toBe(4000);
	});

	it("emits the negative verdict early when several files are re-acquired", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["a.md"]), pruneBlock(["b.md"]), pruneBlock(["c.md"])]);
		advance(a);
		a.onToolUse("read", "a.md", 100);
		a.onToolUse("read", "b.md", 100);
		a.onToolUse("read", "c.md", 100);
		const verdict = a.onTurnEnd();
		expect(verdict?.kind).toBe("negative");
		expect(verdict?.turns).toBe(1);
		expect(verdict?.prunedBlocks).toBe(3);
		expect(verdict?.files).toHaveLength(3);
	});

	it("emits the negative verdict early on heavy re-ingestion of a single file", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["big.cpp"])]);
		advance(a);
		a.onToolUse("read", "big.cpp", 6000);
		const verdict = a.onTurnEnd();
		expect(verdict?.kind).toBe("negative");
		expect(verdict?.chars).toBe(6000);
	});

	it("emits a positive verdict after a full clean window", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["stale.md", "older.md"])]);
		// Turn 0 (the prune turn) is skipped, then 15 counting turns.
		for (let i = 0; i < PRUNE_ACCOUNTING_WINDOW_TURNS; i++) advance(a);
		const verdict = a.onTurnEnd();
		expect(verdict?.kind).toBe("positive");
		expect(verdict?.turns).toBe(PRUNE_ACCOUNTING_WINDOW_TURNS);
		expect(verdict?.prunedBlocks).toBe(1);
		expect(verdict?.files).toEqual([]);
	});

	it("does not count reads of files that were not excluded", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["excluded.md"])]);
		advance(a);
		a.onToolUse("read", "other.md", 100000);
		for (let i = 1; i < PRUNE_ACCOUNTING_WINDOW_TURNS; i++) advance(a);
		expect(a.onTurnEnd()?.kind).toBe("positive");
	});

	it("does not count edits of excluded files as re-acquisition", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["nav.cpp"], "edit")]);
		advance(a);
		a.onToolUse("edit", "nav.cpp", 120);
		for (let i = 1; i < PRUNE_ACCOUNTING_WINDOW_TURNS; i++) advance(a);
		expect(a.onTurnEnd()?.kind).toBe("positive");
	});

	it("counts a later read of a file that was only edited before the prune", () => {
		const a = new PruneAccounting(CWD);
		// The ledger records touched files, edits included; only reads signal.
		a.onPrune([pruneBlock(["nav.cpp"], "edit")]);
		advance(a);
		a.onToolUse("read", "nav.cpp", 800);
		for (let i = 1; i < PRUNE_ACCOUNTING_WINDOW_TURNS; i++) advance(a);
		const verdict = a.onTurnEnd();
		expect(verdict?.kind).toBe("negative");
		expect(verdict?.files).toEqual(["nav.cpp"]);
	});

	it("closes an evidence-carrying window when a newer prune arrives", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["a.md"])]);
		advance(a);
		a.onToolUse("read", "a.md", 50);
		advance(a); // turns = 2, below thresholds, window still open
		const carried = a.onPrune([pruneBlock(["b.md"])]);
		expect(carried?.kind).toBe("negative");
		expect(carried?.files).toEqual(["a.md"]);
		// The new window starts fresh.
		advance(a);
		a.onToolUse("read", "b.md", 10);
		for (let i = 1; i < PRUNE_ACCOUNTING_WINDOW_TURNS; i++) advance(a);
		expect(a.onTurnEnd()?.kind).toBe("negative");
	});

	it("discards a clean-but-short window when a newer prune arrives", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["a.md"])]);
		advance(a);
		expect(a.onPrune([pruneBlock(["b.md"])])).toBeUndefined();
	});

	it("stops attributing reads after the window closed", () => {
		const a = new PruneAccounting(CWD);
		a.onPrune([pruneBlock(["a.md"])]);
		for (let i = 0; i < PRUNE_ACCOUNTING_WINDOW_TURNS; i++) advance(a);
		expect(a.onTurnEnd()?.kind).toBe("positive");
		// Late reads are no longer attributable to the prune.
		a.onToolUse("read", "a.md", 999999);
		expect(a.onTurnEnd()).toBeUndefined();
	});

	it("formats both verdict kinds as [prune-accounting] text", () => {
		const negative = formatPruneAccountingVerdict({
			kind: "negative",
			prunedBlocks: 139,
			files: ["eval.md", "meta.md"],
			chars: 42000,
			turns: 3,
		});
		expect(negative).toContain("[prune-accounting]");
		expect(negative).toContain("139 block(s)");
		expect(negative).toContain("42,000");
		expect(negative).toContain("eval.md");
		expect(negative).toContain("remained in active use");

		const positive = formatPruneAccountingVerdict({
			kind: "positive",
			prunedBlocks: 72,
			files: [],
			chars: 0,
			turns: 15,
		});
		expect(positive).toContain("[prune-accounting]");
		expect(positive).toContain("no excluded file was re-read or edited");
		expect(positive).toContain("working-set selection held");
	});
});
