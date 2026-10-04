import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildContextEntries,
	buildSessionContext,
	CURRENT_SESSION_VERSION,
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

function legacyPrune(id: string, parentId: string, targetId: string, state: PruneState, summary?: string): PruneEntry {
	return { type: "prune", id, parentId, targetId, state, summary, timestamp: "2025-01-01T00:00:00Z" };
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

		const ctx = buildSessionContext([...entries, legacyPrune("5", "4", "3", "excluded")]);
		expect(ctx.messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
	});
});

describe("SessionManager curation markers", () => {
	it("sets and gets prune state", () => {
		const session = SessionManager.inMemory();

		const msgId = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });

		expect(session.getPruneState(msgId)).toBeUndefined();

		session.appendContextChange(msgId, "excluded");
		expect(session.getPruneState(msgId)).toBe("excluded");

		expect(session.getEntries().find((entry) => entry.type === "context_edit")).toMatchObject({
			targetId: msgId,
			replacement: null,
		});
		expect(session.getEntries().some((entry) => entry.type === "prune")).toBe(false);
	});

	it("replaces a summarized message with its persisted context summary", () => {
		const session = SessionManager.inMemory();
		const msgId = session.appendMessage({ role: "user", content: "full original context", timestamp: 1 });
		session.appendMessage(assistantMessage("follow-up", 2));

		session.appendContextChange(msgId, "summarized", "The original request established the API boundary.");

		expect(session.getPruneState(msgId)).toBe("summarized");
		expect(session.getPruneSummary(msgId)).toBe("The original request established the API boundary.");
		expect(session.buildContextEntries().map((entry) => entry.id)).not.toContain(msgId);
		expect(session.buildSessionContext().messages).toMatchObject([
			{
				role: "user",
				content:
					"[Summary of previously summarized context block]\nThe original request established the API boundary.",
			},
			{ role: "assistant" },
		]);
	});

	it("restores with included", () => {
		const session = SessionManager.inMemory();

		const msgId = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });

		session.appendContextChange(msgId, "summarized", "summary");
		expect(session.getPruneState(msgId)).toBe("summarized");

		session.appendContextChange(msgId, "included");
		expect(session.getEntries().at(-1)).toMatchObject({ type: "context_edit_cancel", targetId: msgId });
		expect(session.getPruneState(msgId)).toBeUndefined();
		expect(session.getPruneSummary(msgId)).toBeUndefined();
		expect(session.buildSessionContext().messages.map((m) => m.role)).toEqual(["user"]);
	});

	it("last prune marker wins", () => {
		const session = SessionManager.inMemory();

		const msgId = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });

		session.appendContextChange(msgId, "excluded");
		session.appendContextChange(msgId, "included");
		session.appendContextChange(msgId, "excluded");
		expect(session.getPruneState(msgId)).toBe("excluded");

		session.appendContextChange(msgId, "included");
		expect(session.getPruneState(msgId)).toBeUndefined();
	});

	it("excludes pruned messages from session context", () => {
		const session = SessionManager.inMemory();

		const msg1 = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendMessage(assistantMessage("hi", 2));
		session.appendMessage({ role: "user", content: "followup", timestamp: 3 });

		session.appendContextChange(msg1, "excluded");

		const ctx = session.buildSessionContext();
		expect(ctx.messages.map((m) => m.role)).toEqual(["assistant", "user"]);
	});

	it("restores pruned messages to context on unprune", () => {
		const session = SessionManager.inMemory();

		const msg1 = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendMessage(assistantMessage("hi", 2));

		session.appendContextChange(msg1, "excluded");
		expect(session.buildSessionContext().messages.map((m) => m.role)).toEqual(["assistant"]);

		session.appendContextChange(msg1, "included");
		expect(session.buildSessionContext().messages.map((m) => m.role)).toEqual(["user", "assistant"]);
	});

	it("preserves global prune state when extracting a sibling branch", () => {
		const rootId = "root";
		const session = SessionManager.inMemory(undefined, undefined, [
			msg(rootId, null, "user", "SECRET"),
			msg("first", rootId, "user", "first branch"),
			legacyPrune("legacy", "first", rootId, "excluded"),
		]);

		session.branch(rootId);
		const siblingLeafId = session.appendMessage({ role: "user", content: "sibling branch", timestamp: 3 });
		expect(session.buildSessionContext().messages.map((message) => message.role)).toEqual(["user"]);

		session.createBranchedSession(siblingLeafId);
		expect(session.getPruneState(rootId)).toBe("excluded");
		expect(session.buildSessionContext().messages.map((message) => message.role)).toEqual(["user"]);
	});

	it("preserves a summarized block when extracting a sibling branch", () => {
		const rootId = "root";
		const session = SessionManager.inMemory(undefined, undefined, [
			msg(rootId, null, "user", "full original request"),
			msg("first", rootId, "user", "first branch"),
			legacyPrune("legacy", "first", rootId, "summarized", "Original request summary."),
		]);

		session.branch(rootId);
		const siblingLeafId = session.appendMessage({ role: "user", content: "sibling branch", timestamp: 3 });
		session.createBranchedSession(siblingLeafId);

		expect(session.getPruneState(rootId)).toBe("summarized");
		expect(session.getPruneSummary(rootId)).toBe("Original request summary.");
		expect(session.buildSessionContext().messages).toMatchObject([
			{ role: "custom", content: "[Summary of previously summarized context block]\nOriginal request summary." },
			{ role: "user", content: "sibling branch" },
		]);
	});

	it("prune entries themselves are not projected into context", () => {
		const session = SessionManager.inMemory();

		const msg1 = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendContextChange(msg1, "excluded");

		const ctx = session.buildSessionContext();
		expect(ctx.messages).toEqual([]);
	});

	it("throws when pruning a non-existent entry", () => {
		const session = SessionManager.inMemory();

		expect(() => session.appendContextChange("non-existent", "excluded")).toThrow("Entry non-existent not found");
	});
});

describe("SessionManager prune persistence", () => {
	let tempDir: string;

	afterEach(() => {
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it("loads legacy markers without rewriting and retains legacy tool summaries", () => {
		tempDir = join(tmpdir(), `legacy-prune-${Date.now()}-${Math.random()}`);
		mkdirSync(tempDir, { recursive: true });
		const call = fauxAssistantMessage([fauxToolCall("read", { path: "large.txt" })], { stopReason: "toolUse" });
		const toolCall = call.content.find((part) => part.type === "toolCall");
		if (!toolCall) throw new Error("expected tool call");
		const entries = [
			{
				type: "session",
				version: CURRENT_SESSION_VERSION,
				id: "legacy-session",
				timestamp: "2025-01-01T00:00:00Z",
				cwd: tempDir,
			},
			{ type: "message", id: "call", parentId: null, timestamp: "2025-01-01T00:00:00Z", message: call },
			{
				type: "message",
				id: "result",
				parentId: "call",
				timestamp: "2025-01-01T00:00:00Z",
				message: {
					role: "toolResult",
					toolCallId: toolCall.id,
					toolName: "read",
					content: [{ type: "text", text: "ORIGINAL_LARGE_OUTPUT" }],
					isError: false,
					timestamp: 1,
				},
			},
			legacyPrune("summary", "result", "call", "summarized", "The file was inspected."),
			legacyPrune("tail", "summary", "result", "summarized"),
		];
		const file = join(tempDir, "legacy.jsonl");
		const original = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
		writeFileSync(file, original);
		const session = SessionManager.open(file);
		expect(readFileSync(file, "utf8")).toBe(original);
		expect(session.buildSessionContext().messages).toMatchObject([
			{ role: "custom", content: "[Summary of previously summarized context block]\nThe file was inspected." },
		]);
		expect(
			session.buildSessionProjection().entries.find((entry) => entry.sourceEntry.id === "result")?.messages,
		).toEqual([]);
		session.appendContextChange("call", "included");
		session.appendContextChange("result", "included");
		expect(readFileSync(file, "utf8").startsWith(original)).toBe(true);
		const reopened = SessionManager.open(file);
		expect(reopened.buildSessionContext().messages.map((message) => message.role)).toEqual([
			"assistant",
			"toolResult",
		]);
		expect(reopened.getEntries().filter((entry) => entry.type === "prune")).toHaveLength(2);
		expect(reopened.getEntries().filter((entry) => entry.type === "context_edit_cancel")).toHaveLength(2);
	});

	it("persists context edits across reload", () => {
		tempDir = join(tmpdir(), `prune-test-${Date.now()}-${Math.random()}`);
		mkdirSync(tempDir, { recursive: true });

		const session = SessionManager.create("/tmp/prune-proj", tempDir);
		const msg1 = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendMessage(assistantMessage("hi", 2));
		const msg3 = session.appendMessage({ role: "user", content: "followup", timestamp: 3 });
		session.appendContextChange(msg1, "summarized", "hello summary");

		const file = session.getSessionFile();
		expect(file).toBeDefined();

		const reopened = SessionManager.open(file!);
		expect(reopened.getPruneState(msg1)).toBe("summarized");
		expect(reopened.getPruneSummary(msg1)).toBe("hello summary");
		expect(reopened.getPruneState(msg3)).toBeUndefined();

		const ctx = reopened.buildSessionContext();
		expect(ctx.messages).toMatchObject([
			{ role: "user", content: "[Summary of previously summarized context block]\nhello summary" },
			{ role: "assistant" },
			{ role: "user", content: "followup" },
		]);
	});

	it("keeps every summarized tool exchange entry out of context after reload", () => {
		tempDir = join(tmpdir(), `prune-tool-exchange-${Date.now()}-${Math.random()}`);
		mkdirSync(tempDir, { recursive: true });
		const session = SessionManager.create("/tmp/prune-proj", tempDir);
		const call = fauxAssistantMessage(
			[fauxToolCall("read", { path: "large-a.txt" }), fauxToolCall("read", { path: "large-b.txt" })],
			{ stopReason: "toolUse" },
		);
		const callId = session.appendMessage(call);
		const toolCallIds = call.content.filter((part) => part.type === "toolCall").map((part) => part.id);
		for (const [index, toolCallId] of toolCallIds.entries()) {
			session.appendMessage({
				role: "toolResult",
				toolCallId,
				toolName: "read",
				content: [{ type: "text", text: `large tool output ${index}` }],
				isError: false,
				timestamp: index + 1,
			});
		}
		const resultIds = session
			.getEntries()
			.filter((entry) => entry.type === "message" && entry.message.role === "toolResult")
			.map((entry) => entry.id);
		session.appendMessage(assistantMessage("follow-up", 3));
		session.appendContextChange(callId, "summarized", "The files were inspected.");
		for (const resultId of resultIds) session.appendContextChange(resultId, "summarized");

		const reopened = SessionManager.open(session.getSessionFile()!);
		const projected = reopened.buildSessionProjection();
		expect(projected.messages).toMatchObject([
			{
				role: "assistant",
				content: [
					{ type: "text", text: "[Summary of previously summarized context block]\nThe files were inspected." },
				],
			},
			{ role: "assistant" },
		]);
		expect(
			projected.messages.some(
				(message) => message.role === "assistant" && message.content.some((part) => part.type === "toolCall"),
			),
		).toBe(false);
		for (const resultId of resultIds) {
			expect(projected.entries.find((entry) => entry.sourceEntry.id === resultId)?.messages).toEqual([]);
			expect(reopened.getEntry(resultId)).toMatchObject({ type: "message", message: { role: "toolResult" } });
		}
		expect(reopened.getEntry(callId)).toMatchObject({ type: "message", message: { role: "assistant" } });
	});
});
