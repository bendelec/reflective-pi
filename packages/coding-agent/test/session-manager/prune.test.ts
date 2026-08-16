import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildContextEntries,
	buildSessionContext,
	type PruneEntry,
	type PruneState,
	type SessionEntry,
	SessionManager,
	type SessionMessageEntry,
} from "../../src/core/session-manager.ts";

function msg(id: string, parentId: string | null, role: "user" | "assistant", text: string): SessionMessageEntry {
	const base = { type: "message" as const, id, parentId, timestamp: "2025-01-01T00:00:00Z" };
	if (role === "user") {
		return { ...base, message: { role, content: text, timestamp: 1 } };
	}
	return {
		...base,
		message: {
			role,
			content: [{ type: "text", text }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-test",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 1,
		},
	};
}

function pruneMap(...pairs: [string, PruneState][]): Map<string, PruneState> {
	return new Map(pairs);
}

function assistantMessage(text: string, timestamp: number) {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop" as const,
		timestamp,
	};
}

describe("buildContextEntries prune filtering", () => {
	it("filters pruned message entries", () => {
		const entries: SessionEntry[] = [
			msg("1", null, "user", "hello"),
			msg("2", "1", "assistant", "hi"),
			msg("3", "2", "user", "secret"),
			msg("4", "3", "assistant", "secret reply"),
		];

		const result = buildContextEntries(entries, undefined, undefined, pruneMap(["3", "excluded"]));
		expect(result.map((entry) => entry.id)).toEqual(["1", "2", "4"]);
	});

	it("does not filter when no prune map is provided", () => {
		const entries: SessionEntry[] = [msg("1", null, "user", "hello"), msg("2", "1", "assistant", "hi")];

		expect(buildContextEntries(entries).map((entry) => entry.id)).toEqual(["1", "2"]);
	});

	it("does not filter when the prune map is empty", () => {
		const entries: SessionEntry[] = [msg("1", null, "user", "hello"), msg("2", "1", "assistant", "hi")];

		expect(buildContextEntries(entries, undefined, undefined, new Map()).map((entry) => entry.id)).toEqual([
			"1",
			"2",
		]);
	});

	it("still truncates history when the compaction entry is pruned, omitting only the summary", () => {
		const entries: SessionEntry[] = [
			msg("1", null, "user", "first"),
			msg("2", "1", "assistant", "response1"),
			msg("3", "2", "user", "second"),
			msg("4", "3", "assistant", "response2"),
			// compaction entry keeps from "3", so 1 and 2 are summarized away
			{
				type: "compaction",
				id: "5",
				parentId: "4",
				timestamp: "2025-01-01T00:00:00Z",
				summary: "Summary",
				firstKeptEntryId: "3",
				tokensBefore: 1000,
			},
			msg("6", "5", "user", "third"),
		];

		// Prune the compaction summary itself.
		const result = buildContextEntries(entries, undefined, undefined, pruneMap(["5", "excluded"]));
		// The compaction entry is omitted, but the truncation boundary it set is
		// still honored: "1" and "2" are gone, "3"/"4"/"6" remain.
		expect(result.map((entry) => entry.id)).toEqual(["3", "4", "6"]);
	});

	it("excludes pruned messages from buildSessionContext", () => {
		const entries: SessionEntry[] = [
			msg("1", null, "user", "hello"),
			msg("2", "1", "assistant", "hi"),
			msg("3", "2", "user", "secret"),
			msg("4", "3", "assistant", "secret reply"),
		];

		const ctx = buildSessionContext(entries, undefined, undefined, pruneMap(["3", "excluded"]));
		expect(ctx.messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
	});
});

describe("SessionManager prune markers", () => {
	it("sets and gets prune state", () => {
		const session = SessionManager.inMemory();

		const msgId = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });

		expect(session.getPruneState(msgId)).toBeUndefined();

		session.appendPruneChange(msgId, "excluded");
		expect(session.getPruneState(msgId)).toBe("excluded");

		const pruneEntry = session.getEntries().find((entry) => entry.type === "prune") as PruneEntry;
		expect(pruneEntry.targetId).toBe(msgId);
		expect(pruneEntry.state).toBe("excluded");
	});

	it("restores with included", () => {
		const session = SessionManager.inMemory();

		const msgId = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });

		session.appendPruneChange(msgId, "excluded");
		expect(session.getPruneState(msgId)).toBe("excluded");

		session.appendPruneChange(msgId, "included");
		expect(session.getPruneState(msgId)).toBeUndefined();
	});

	it("last prune marker wins", () => {
		const session = SessionManager.inMemory();

		const msgId = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });

		session.appendPruneChange(msgId, "excluded");
		session.appendPruneChange(msgId, "included");
		session.appendPruneChange(msgId, "excluded");
		expect(session.getPruneState(msgId)).toBe("excluded");

		session.appendPruneChange(msgId, "included");
		expect(session.getPruneState(msgId)).toBeUndefined();
	});

	it("excludes pruned messages from session context", () => {
		const session = SessionManager.inMemory();

		const msg1 = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendMessage(assistantMessage("hi", 2));
		session.appendMessage({ role: "user", content: "followup", timestamp: 3 });

		session.appendPruneChange(msg1, "excluded");

		const ctx = session.buildSessionContext();
		expect(ctx.messages.map((m) => m.role)).toEqual(["assistant", "user"]);
	});

	it("restores pruned messages to context on unprune", () => {
		const session = SessionManager.inMemory();

		const msg1 = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendMessage(assistantMessage("hi", 2));

		session.appendPruneChange(msg1, "excluded");
		expect(session.buildSessionContext().messages.map((m) => m.role)).toEqual(["assistant"]);

		session.appendPruneChange(msg1, "included");
		expect(session.buildSessionContext().messages.map((m) => m.role)).toEqual(["user", "assistant"]);
	});

	it("preserves global prune state when extracting a sibling branch", () => {
		const session = SessionManager.inMemory();
		const rootId = session.appendMessage({ role: "user", content: "SECRET", timestamp: 1 });
		session.appendMessage({ role: "user", content: "first branch", timestamp: 2 });
		session.appendPruneChange(rootId, "excluded");

		session.branch(rootId);
		const siblingLeafId = session.appendMessage({ role: "user", content: "sibling branch", timestamp: 3 });
		expect(session.buildSessionContext().messages.map((message) => message.role)).toEqual(["user"]);

		session.createBranchedSession(siblingLeafId);
		expect(session.getPruneState(rootId)).toBe("excluded");
		expect(session.buildSessionContext().messages.map((message) => message.role)).toEqual(["user"]);
	});

	it("prune entries themselves are not projected into context", () => {
		const session = SessionManager.inMemory();

		const msg1 = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendPruneChange(msg1, "excluded");

		const ctx = session.buildSessionContext();
		expect(ctx.messages).toEqual([]);
	});

	it("throws when pruning a non-existent entry", () => {
		const session = SessionManager.inMemory();

		expect(() => session.appendPruneChange("non-existent", "excluded")).toThrow("Entry non-existent not found");
	});
});

describe("SessionManager prune persistence", () => {
	let tempDir: string;

	afterEach(() => {
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it("persists prune markers across reload", () => {
		tempDir = join(tmpdir(), `prune-test-${Date.now()}-${Math.random()}`);
		mkdirSync(tempDir, { recursive: true });

		const session = SessionManager.create("/tmp/prune-proj", tempDir);
		const msg1 = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendMessage(assistantMessage("hi", 2));
		const msg3 = session.appendMessage({ role: "user", content: "followup", timestamp: 3 });
		session.appendPruneChange(msg1, "excluded");

		const file = session.getSessionFile();
		expect(file).toBeDefined();

		const reopened = SessionManager.open(file!);
		expect(reopened.getPruneState(msg1)).toBe("excluded");
		expect(reopened.getPruneState(msg3)).toBeUndefined();

		const ctx = reopened.buildSessionContext();
		expect(ctx.messages.map((m) => m.role)).toEqual(["assistant", "user"]);
	});
});
