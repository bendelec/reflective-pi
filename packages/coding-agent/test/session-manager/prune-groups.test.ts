import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { groupPruneBlocks, previewBlock } from "../../src/core/prune.ts";
import type { SessionEntry, SessionMessageEntry } from "../../src/core/session-manager.ts";

function entry(id: string, parentId: string | null, message: AgentMessage): SessionMessageEntry {
	return { type: "message", id, parentId, timestamp: "2025-01-01T00:00:00Z", message };
}

function user(id: string, parentId: string | null, text: string): SessionMessageEntry {
	return entry(id, parentId, { role: "user", content: text, timestamp: 1 });
}

function assistant(id: string, parentId: string | null, text: string): SessionMessageEntry {
	return entry(id, parentId, {
		role: "assistant",
		content: [{ type: "text", text }],
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
		stopReason: "stop",
		timestamp: 1,
	});
}

function assistantTools(id: string, parentId: string | null, names: string[]): SessionMessageEntry {
	return entry(id, parentId, {
		role: "assistant",
		content: names.map((name, index) => ({
			type: "toolCall" as const,
			id: `tool-${id}-${index}`,
			name,
			arguments: {},
		})),
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
		stopReason: "stop",
		timestamp: 1,
	});
}

function toolResult(id: string, parentId: string | null, toolCallId: string): SessionMessageEntry {
	return entry(id, parentId, {
		role: "toolResult",
		toolCallId,
		toolName: "read",
		content: [{ type: "text", text: "result" }],
		isError: false,
		timestamp: 1,
	});
}

function ids(entries: SessionEntry[]): string[] {
	return entries.map((e) => e.id);
}

describe("groupPruneBlocks", () => {
	it("groups a simple conversation into single-message blocks", () => {
		const entries = [user("1", null, "hello"), assistant("2", "1", "hi"), user("3", "2", "again")];

		expect(groupPruneBlocks(entries).map((b) => b.entryIds)).toEqual([["1"], ["2"], ["3"]]);
	});

	it("groups an assistant tool call with its tool result", () => {
		const entries = [
			user("1", null, "read the file"),
			assistantTools("2", "1", ["read"]),
			toolResult("3", "2", "tool-2-0"),
			assistant("4", "3", "done"),
		];

		expect(groupPruneBlocks(entries).map((b) => b.entryIds)).toEqual([["1"], ["2", "3"], ["4"]]);
	});

	it("groups parallel tool calls into one exchange", () => {
		const entries = [
			user("1", null, "read and edit"),
			assistantTools("2", "1", ["read", "edit"]),
			toolResult("3", "2", "tool-2-0"),
			toolResult("4", "2", "tool-2-1"),
			assistant("5", "4", "done"),
		];

		expect(groupPruneBlocks(entries).map((b) => b.entryIds)).toEqual([["1"], ["2", "3", "4"], ["5"]]);
	});

	it("splits sequential tool calls into separate exchanges", () => {
		const entries = [
			user("1", null, "do two steps"),
			assistantTools("2", "1", ["read"]),
			toolResult("3", "2", "tool-2-0"),
			assistantTools("4", "3", ["edit"]),
			toolResult("5", "4", "tool-4-0"),
			assistant("6", "5", "done"),
		];

		expect(groupPruneBlocks(entries).map((b) => b.entryIds)).toEqual([["1"], ["2", "3"], ["4", "5"], ["6"]]);
	});

	it("treats a standalone tool result as its own block", () => {
		const entries = [toolResult("1", null, "missing-call")];

		expect(groupPruneBlocks(entries).map((b) => b.entryIds)).toEqual([["1"]]);
	});

	it("keeps non-message entries as single blocks", () => {
		const entries: SessionEntry[] = [
			user("1", null, "hello"),
			{
				type: "compaction",
				id: "2",
				parentId: "1",
				timestamp: "2025-01-01T00:00:00Z",
				summary: "s",
				firstKeptEntryId: "1",
				tokensBefore: 10,
			},
			user("3", "2", "after compaction"),
		];

		expect(groupPruneBlocks(entries).map((b) => b.entryIds)).toEqual([["1"], ["2"], ["3"]]);
	});

	it("preserves entry order within blocks", () => {
		const entries = [
			assistantTools("1", null, ["read"]),
			toolResult("2", "1", "tool-1-0"),
			toolResult("3", "1", "tool-1-0"),
		];

		const block = groupPruneBlocks(entries)[0];
		expect(block.entryIds).toEqual(["1", "2", "3"]);
		expect(ids(block.entries)).toEqual(["1", "2", "3"]);
	});
});

describe("previewBlock", () => {
	const usage = {
		input: 1,
		output: 1,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 2,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};

	function assistantTool(
		id: string,
		parentId: string | null,
		name: string,
		args: Record<string, unknown>,
	): SessionMessageEntry {
		return entry(id, parentId, {
			role: "assistant",
			content: [{ type: "toolCall" as const, id: `call-${name}`, name, arguments: args }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "test",
			usage,
			stopReason: "stop",
			timestamp: 1,
		});
	}

	function toolResultContent(
		id: string,
		parentId: string | null,
		toolCallId: string,
		text: string,
	): SessionMessageEntry {
		return entry(id, parentId, {
			role: "toolResult",
			toolCallId,
			toolName: "tool",
			content: [{ type: "text", text }],
			isError: false,
			timestamp: 1,
		});
	}

	it("previews a user block", () => {
		const block = { entryIds: ["1"], entries: [user("1", null, "fix the bug")] };
		expect(previewBlock(block)).toEqual({ line: "user: fix the bug", detail: [] });
	});

	it("previews a standalone assistant block", () => {
		const block = { entryIds: ["1"], entries: [assistant("1", null, "here you go")] };
		expect(previewBlock(block).line).toBe("assistant: here you go");
	});

	it("previews an assistant tool-call block by tool names", () => {
		const block = { entryIds: ["1"], entries: [assistantTools("1", null, ["read", "edit"])] };
		expect(previewBlock(block).line).toBe("assistant: read, edit");
		expect(previewBlock(block).detail).toEqual(["read", "edit"]);
	});

	it("previews read detail from the result content", () => {
		const block = {
			entryIds: ["1", "2"],
			entries: [
				assistantTool("1", null, "read", { path: "src/login.ts" }),
				toolResultContent("2", "1", "call-read", "\nexport function login(user) {\n"),
			],
		};
		expect(previewBlock(block).detail).toEqual(['read src/login.ts: "export function login(user) {"']);
	});

	it("previews write detail from the args content", () => {
		const block = {
			entryIds: ["1", "2"],
			entries: [
				assistantTool("1", null, "write", { path: "src/x.ts", content: "const x = 1;\nconst y = 2;" }),
				toolResultContent("2", "1", "call-write", "Successfully wrote 30 bytes"),
			],
		};
		expect(previewBlock(block).detail).toEqual(['write src/x.ts: "const x = 1;"']);
	});

	it("previews edit detail from the first newText", () => {
		const block = {
			entryIds: ["1", "2"],
			entries: [
				assistantTool("1", null, "edit", {
					path: "src/y.ts",
					edits: [{ oldText: "a", newText: "if (x) {\n  return;\n}" }],
				}),
				toolResultContent("2", "1", "call-edit", "Edited"),
			],
		};
		expect(previewBlock(block).detail).toEqual(['edit src/y.ts: "if (x) {"']);
	});

	it("previews bash detail from the result output", () => {
		const block = {
			entryIds: ["1", "2"],
			entries: [
				assistantTool("1", null, "bash", { command: "git status" }),
				toolResultContent("2", "1", "call-bash", "On branch main\nnothing to commit"),
			],
		};
		expect(previewBlock(block).detail).toEqual(['bash git status: "On branch main"']);
	});

	it("falls back to the bare tool name for unknown tools", () => {
		const block = {
			entryIds: ["1", "2"],
			entries: [
				assistantTool("1", null, "custom_tool", { some: "arg" }),
				toolResultContent("2", "1", "call-custom", "result"),
			],
		};
		expect(previewBlock(block).detail).toEqual(["custom_tool"]);
	});

	it("previews a context status message", () => {
		const block = {
			entryIds: ["1"],
			entries: [
				entry("1", null, {
					role: "contextStatus",
					content: "[context-status] window 128,000",
					percent: 35.3,
					timestamp: 1,
				}),
			],
		};
		expect(previewBlock(block).line).toBe("context: [context-status] window 128,000");
	});
});
