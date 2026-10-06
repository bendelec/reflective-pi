import { contentText, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { estimateProjectedContextTokens } from "../../src/core/compaction/index.ts";
import { groupPruneBlocks } from "../../src/core/prune.ts";
import {
	buildSessionProjection,
	CONTEXT_BLOCK_SUMMARY_PREFIX,
	type ContextEditCancelEntry,
	type ContextEditEntry,
	type PruneEntry,
	parseSessionEntries,
	type SessionEntry,
	type SessionHeader,
	SessionManager,
} from "../../src/core/session-manager.ts";

const timestamp = "2025-01-01T00:00:00Z";

function legacySession(state: "excluded" | "summarized" = "summarized"): SessionManager {
	const entries: SessionEntry[] = [
		{
			type: "message",
			id: "root",
			parentId: null,
			timestamp,
			message: { role: "user", content: "RAW_ORIGINAL", timestamp: 1 },
		},
		{
			type: "message",
			id: "sibling",
			parentId: "root",
			timestamp,
			message: { role: "user", content: "sibling", timestamp: 2 },
		},
		{
			type: "prune",
			id: "legacy",
			parentId: "sibling",
			timestamp,
			targetId: "root",
			state,
			...(state === "summarized" ? { summary: "LEGACY_SUMMARY" } : {}),
		},
	];
	return SessionManager.inMemory(undefined, undefined, entries);
}

function projectedText(session: SessionManager): string[] {
	return session.buildSessionContext().messages.flatMap((message) => {
		if ("content" in message) return [contentText(message.content)];
		if ("summary" in message) return [message.summary];
		return [];
	});
}

describe("branch-local context curation", () => {
	it.each(["excluded", "summarized"] as const)(
		"overrides a global legacy %s baseline with edits and restore-original",
		(state) => {
			const session = legacySession(state);
			session.branch("root");
			const sibling = session.appendMessage({ role: "user", content: "other path", timestamp: 3 });
			expect(session.getPruneState("root")).toBe(state);
			session.appendContextChange("root", "summarized", "NEW_SUMMARY");
			expect(projectedText(session)).toEqual([`${CONTEXT_BLOCK_SUMMARY_PREFIX}NEW_SUMMARY`, "other path"]);
			const cancel = session.appendContextChange("root", "included");
			expect(projectedText(session)).toEqual(["RAW_ORIGINAL", "other path"]);
			expect(session.getPruneState("root")).toBeUndefined();
			expect(session.getPruneSummary("root")).toBeUndefined();

			session.branch(sibling);
			expect(session.getPruneState("root")).toBe(state);
			expect(projectedText(session)).toEqual(
				state === "summarized" ? [`${CONTEXT_BLOCK_SUMMARY_PREFIX}LEGACY_SUMMARY`, "other path"] : ["other path"],
			);
			session.branch(cancel);
			const next = session.appendContextChange("root", "excluded");
			expect(projectedText(session)).toEqual(["other path"]);
			session.branch(cancel);
			session.appendMessage({ role: "user", content: "descendant", timestamp: 4 });
			expect(projectedText(session)).toEqual(["RAW_ORIGINAL", "other path", "descendant"]);
			session.branch(next);
			expect(session.getPruneState("root")).toBe("excluded");
		},
	);

	it("cancels, re-summarizes, and cancels a legacy-summarized tool block atomically", () => {
		const source = SessionManager.inMemory();
		const call = fauxAssistantMessage([fauxToolCall("read", {})], { stopReason: "toolUse" });
		const head = source.appendMessage(call);
		const callId = call.content.find((part) => part.type === "toolCall")?.id;
		if (!callId) throw new Error("expected tool call id");
		const result = source.appendMessage({
			role: "toolResult",
			toolCallId: callId,
			toolName: "read",
			content: [{ type: "text", text: "RAW_TOOL_TAIL" }],
			isError: false,
			timestamp: 2,
		});
		const ids = [head, result];
		const entries = source.getEntries();
		const baseline: PruneEntry[] = ids.map((targetId, index) => ({
			type: "prune",
			id: `legacy-${index}`,
			parentId: index === 0 ? result : `legacy-${index - 1}`,
			timestamp,
			targetId,
			state: "summarized",
			...(index === 0 ? { summary: "LEGACY_TOOL_SUMMARY" } : {}),
		}));
		const session = SessionManager.inMemory(undefined, undefined, [source.getHeader()!, ...entries, ...baseline]);
		session.branch(baseline[baseline.length - 1]!.id);

		for (const id of ids) session.appendContextChange(id, "included");
		expect(projectedText(session)).toEqual(["", "RAW_TOOL_TAIL"]);
		const restoredLeaf = session.getLeafId()!;
		session.appendMessage({ role: "user", content: "after restore", timestamp: 3 });
		expect(projectedText(session)).toEqual(["", "RAW_TOOL_TAIL", "after restore"]);

		session.branch(restoredLeaf);
		for (const [index, id] of ids.entries()) {
			session.appendContextChange(id, "summarized", index === 0 ? "NEW_TOOL_SUMMARY" : undefined);
		}
		expect(projectedText(session)).toEqual([`${CONTEXT_BLOCK_SUMMARY_PREFIX}NEW_TOOL_SUMMARY`]);
		for (const id of ids) session.appendContextChange(id, "included");
		expect(projectedText(session)).toEqual(["", "RAW_TOOL_TAIL"]);
		session.appendMessage({ role: "user", content: "after second restore", timestamp: 4 });
		expect(projectedText(session)).toEqual(["", "RAW_TOOL_TAIL", "after second restore"]);
	});

	it("resolves global legacy markers by file order, including restore on a sibling", () => {
		const session = legacySession();
		const entries = session.getEntries();
		const restore: PruneEntry = {
			type: "prune",
			id: "legacy-restore",
			parentId: "root",
			timestamp,
			targetId: "root",
			state: "included",
		};
		const imported = SessionManager.inMemory(undefined, undefined, [...entries, restore]);
		imported.branch("legacy");
		expect(imported.getPruneState("root")).toBeUndefined();
		expect(projectedText(imported)).toEqual(["RAW_ORIGINAL", "sibling"]);
		expect(buildSessionProjection([...entries, restore], "legacy").messages[0]).toMatchObject({
			role: "user",
			content: "RAW_ORIGINAL",
		});
	});

	it("inherits edits and cancellation on descendants but not sibling paths or branch summaries", () => {
		const session = SessionManager.inMemory();
		const root = session.appendMessage({ role: "user", content: "original", timestamp: 1 });
		const edit = session.appendContextChange(root, "excluded");
		const descendant = session.appendMessage({ role: "user", content: "descendant", timestamp: 2 });
		expect(projectedText(session)).toEqual(["descendant"]);
		const restored = session.appendContextChange(root, "included");
		expect(projectedText(session)).toEqual(["original", "descendant"]);
		session.branch(descendant);
		expect(projectedText(session)).toEqual(["descendant"]);
		session.branch(restored);
		session.appendMessage({ role: "user", content: "after restore", timestamp: 3 });
		expect(projectedText(session)).toEqual(["original", "descendant", "after restore"]);
		session.branchWithSummary(root, "abandoned branch summary");
		expect(projectedText(session)).toEqual(["original", "abandoned branch summary"]);
		expect(session.getPruneState(root)).toBeUndefined();
		session.branch(edit);
		expect(projectedText(session)).toEqual([]);
		session.resetLeaf();
		expect(projectedText(session)).toEqual([]);
		expect(session.getPruneState(root)).toBeUndefined();
		session.newSession();
		expect(session.getPruneState(root)).toBeUndefined();
	});

	it("rejects mutations of missing, sibling, or bookkeeping targets without writing a marker", () => {
		const session = SessionManager.inMemory();
		const root = session.appendMessage({ role: "user", content: "original", timestamp: 1 });
		const sibling = session.appendMessage({ role: "user", content: "sibling", timestamp: 2 });
		session.branch(root);
		const metadata = session.appendCustomEntry("metadata", {});
		const count = session.getEntryCount();
		for (const state of ["excluded", "included", "summarized"] as const) {
			expect(() => session.appendContextChange("missing", state, "summary")).toThrow("not found");
			expect(() => session.appendContextChange(sibling, state, "summary")).toThrow("not on the active branch");
			expect(() => session.appendContextChange(metadata, state, "summary")).toThrow("does not contribute editable");
			for (const invalidId of ["missing", sibling, metadata]) {
				expect(() =>
					session.appendContextChanges([
						{ targetId: root, state },
						{ targetId: invalidId, state },
					]),
				).toThrow();
				expect(session.getEntryCount()).toBe(count);
			}
		}
		expect(session.appendContextChanges([])).toEqual([]);
		expect(session.getEntryCount()).toBe(count);
	});

	it("keeps a summarized tool block atomic in the selector, including its omitted tails", () => {
		const session = SessionManager.inMemory();
		const call = fauxAssistantMessage([fauxToolCall("read", {}), fauxToolCall("bash", {})], {
			stopReason: "toolUse",
		});
		const head = session.appendMessage(call);
		const ids = [head];
		for (const part of call.content) {
			if (part.type !== "toolCall") continue;
			ids.push(
				session.appendMessage({
					role: "toolResult",
					toolCallId: part.id,
					toolName: part.name,
					content: [{ type: "text", text: "RAW_TOOL_OUTPUT" }],
					isError: false,
					timestamp: 2,
				}),
			);
		}
		for (const [index, id] of ids.entries()) {
			session.appendContextChange(id, "summarized", index === 0 ? "TOOL_SUMMARY" : undefined);
		}
		expect(ids.map((id) => session.getPruneState(id))).toEqual(["summarized", "summarized", "summarized"]);
		expect(groupPruneBlocks(session.buildContextEntriesAll()).map((block) => block.entryIds)).toEqual([ids]);
		expect(groupPruneBlocks(session.buildContextEntries())).toEqual([]);
		expect(session.buildSessionContext().messages).toMatchObject([
			{ role: "assistant", content: [{ type: "text", text: `${CONTEXT_BLOCK_SUMMARY_PREFIX}TOOL_SUMMARY` }] },
		]);
		expect(session.getEntries().filter((entry) => entry.type === "context_edit")).toMatchObject([
			{
				targetId: head,
				curation: "summary",
				replacement: { content: [{ type: "text", text: `${CONTEXT_BLOCK_SUMMARY_PREFIX}TOOL_SUMMARY` }] },
			},
			{ targetId: ids[1], curation: "summary", replacement: null },
			{ targetId: ids[2], curation: "summary", replacement: null },
		]);
		for (const id of ids) session.appendContextChange(id, "included");
		expect(groupPruneBlocks(session.buildContextEntries()).map((block) => block.entryIds)).toEqual([ids]);
		expect(session.buildSessionContext().messages.map((message) => message.role)).toEqual([
			"assistant",
			"toolResult",
			"toolResult",
		]);
	});
});

describe("curation of nonstandard context entries", () => {
	it("supports context status, custom messages, branch summaries, and bash executions", () => {
		const session = SessionManager.inMemory();
		const status = session.appendMessage({ role: "contextStatus", content: "RAW_STATUS", percent: 20, timestamp: 1 });
		const custom = session.appendCustomMessageEntry("note", "RAW_CUSTOM", false);
		const branch = session.branchWithSummary(custom, "RAW_BRANCH_SUMMARY");
		const bash = session.appendMessage({
			role: "bashExecution",
			command: "echo original",
			output: "RAW_BASH",
			exitCode: 0,
			cancelled: false,
			truncated: false,
			timestamp: 2,
		});
		const ids = [status, custom, branch, bash];
		for (const id of ids) session.appendContextChange(id, "summarized", "REPLACEMENT");
		expect(projectedText(session)).toEqual(ids.map(() => `${CONTEXT_BLOCK_SUMMARY_PREFIX}REPLACEMENT`));
		for (const id of ids) session.appendContextChange(id, "excluded");
		expect(session.buildSessionContext().messages).toEqual([]);
		for (const id of ids) session.appendContextChange(id, "included");
		expect(session.buildSessionContext().messages.map((message) => message.role)).toEqual([
			"contextStatus",
			"custom",
			"branchSummary",
			"bashExecution",
		]);
	});

	it("replaces only the compaction summary, preserving the checkpoint system message", () => {
		const session = SessionManager.inMemory();
		session.appendMessage({ role: "system", content: "SYSTEM_CHECKPOINT", timestamp: 1 });
		session.appendMessage({ role: "user", content: "DISCARDED_HISTORY", timestamp: 2 });
		const compaction = session.appendCompaction("RAW_COMPACTION_SUMMARY", null, 100);
		session.appendContextChange(compaction, "summarized", "COMPACTION_REPLACEMENT");
		expect(session.buildSessionContext().messages).toMatchObject([
			{ role: "system", content: "SYSTEM_CHECKPOINT" },
			{ role: "compactionSummary", summary: `${CONTEXT_BLOCK_SUMMARY_PREFIX}COMPACTION_REPLACEMENT` },
		]);
		session.appendContextChange(compaction, "excluded");
		expect(session.buildSessionContext().messages).toEqual([]);
		session.appendContextChange(compaction, "included");
		expect(projectedText(session)).toEqual(["SYSTEM_CHECKPOINT", "RAW_COMPACTION_SUMMARY"]);
	});

	it("restoration cannot recover history outside the compaction retention boundary", () => {
		const session = SessionManager.inMemory();
		const discarded = session.appendMessage({ role: "user", content: "DISCARDED", timestamp: 1 });
		session.appendContextChange(discarded, "excluded");
		const retained = session.appendMessage({ role: "user", content: "RETAINED", timestamp: 2 });
		session.appendCompaction("FIRST_SUMMARY", retained, 100);
		session.appendContextChange(discarded, "included");
		session.appendContextChange(retained, "summarized", "RETAINED_REPLACEMENT");
		const newest = session.appendCompaction("NEWEST_SUMMARY", retained, 80);
		expect(projectedText(session)).toEqual(["NEWEST_SUMMARY", `${CONTEXT_BLOCK_SUMMARY_PREFIX}RETAINED_REPLACEMENT`]);
		session.appendContextChange(newest, "excluded");
		expect(projectedText(session)).toEqual([`${CONTEXT_BLOCK_SUMMARY_PREFIX}RETAINED_REPLACEMENT`]);
		session.appendContextChange(retained, "included");
		expect(projectedText(session)).toEqual(["RETAINED"]);
	});
});

describe("curation extraction and persistence", () => {
	const directories: string[] = [];
	afterEach(() => {
		for (const directory of directories) rmSync(directory, { recursive: true, force: true });
		directories.length = 0;
	});

	it("preserves a sibling legacy restore marker when extracting its target and invalidates old usage", () => {
		const directory = mkdtempSync(join(tmpdir(), "legacy-prune-extraction-"));
		directories.push(directory);
		const header: SessionHeader = {
			type: "session",
			version: 3,
			id: "legacy-session",
			timestamp,
			cwd: directory,
		};
		const root: SessionEntry = {
			type: "message",
			id: "root",
			parentId: null,
			timestamp,
			message: { role: "user", content: "x".repeat(40000), timestamp: 1 },
		};
		const excluded: PruneEntry = {
			type: "prune",
			id: "legacy-excluded",
			parentId: "root",
			timestamp,
			targetId: "root",
			state: "excluded",
		};
		const assistant: SessionEntry = {
			type: "message",
			id: "assistant",
			parentId: excluded.id,
			timestamp,
			message: {
				role: "assistant",
				content: [{ type: "text", text: "answer" }],
				api: "faux",
				provider: "faux",
				model: "faux",
				usage: {
					input: 10,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 11,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2,
			},
		};
		const included: PruneEntry = {
			type: "prune",
			id: "legacy-included",
			parentId: assistant.id,
			timestamp,
			targetId: "root",
			state: "included",
		};
		const sourceFile = join(directory, "legacy.jsonl");
		writeFileSync(
			sourceFile,
			[header, root, excluded, assistant, included].map((entry) => JSON.stringify(entry)).join("\n"),
		);
		const session = SessionManager.open(sourceFile);
		session.branch(assistant.id);
		const before = estimateProjectedContextTokens(
			session.buildSessionProjection(),
			session.getBranch(),
			session.getEntries(),
		);
		expect(before.lastUsageIndex).toBeNull();
		expect(before.tokens).toBeGreaterThan(10000);

		const extractedFile = session.createBranchedSession(assistant.id)!;
		session.branch(assistant.id);
		const extractedEstimate = estimateProjectedContextTokens(
			session.buildSessionProjection(),
			session.getBranch(),
			session.getEntries(),
		);
		expect(extractedEstimate.lastUsageIndex).toBeNull();
		expect(extractedEstimate.tokens).toBeGreaterThan(10000);
		expect(projectedText(session)).toEqual(["x".repeat(40000), "answer"]);

		const reloaded = SessionManager.open(extractedFile);
		reloaded.branch(assistant.id);
		const after = estimateProjectedContextTokens(
			reloaded.buildSessionProjection(),
			reloaded.getBranch(),
			reloaded.getEntries(),
		);
		expect(after.lastUsageIndex).toBeNull();
		expect(after.tokens).toBeGreaterThan(10000);
		expect(session.getEntry(included.id)).toMatchObject({ type: "prune", targetId: root.id, state: "included" });
		expect(session.getEntry(included.id)?.parentId).toBe(assistant.id);
		expect(session.getPruneState(root.id)).toBeUndefined();
		expect(session.getPruneSummary(root.id)).toBeUndefined();
		expect(reloaded.getEntry(included.id)).toMatchObject({ type: "prune", state: "included" });
		expect(reloaded.getPruneState(root.id)).toBeUndefined();
		expect(reloaded.getPruneSummary(root.id)).toBeUndefined();
	});

	it.each(["excluded", "summarized"] as const)(
		"extracts a path with legacy %s baseline and restore without authoring legacy records",
		(state) => {
			const session = legacySession(state);
			session.branch("root");
			const restoration = session.appendContextChange("root", "included");
			session.createBranchedSession(restoration);
			expect(projectedText(session)).toEqual(["RAW_ORIGINAL"]);
			expect(session.getEntry("legacy")).toMatchObject({ type: "prune", targetId: "root", state });
			expect(session.getEntries().filter((entry) => entry.type === "prune")).toHaveLength(1);
			expect(session.getEntry(restoration)).toMatchObject({ type: "context_edit_cancel", targetId: "root" });
			session.branch("root");
			expect(session.getPruneState("root")).toBe(state);
		},
	);

	it("extracts local edits, not sibling edits, and leaves dangling cancellation targets inert", () => {
		const session = SessionManager.inMemory();
		const root = session.appendMessage({ role: "user", content: "original", timestamp: 1 });
		const sibling = session.appendContextChange(root, "excluded");
		session.branch(root);
		const edit = session.appendContextChange(root, "summarized", "LOCAL_SUMMARY");
		const dangling: ContextEditCancelEntry = {
			type: "context_edit_cancel",
			id: "dangling",
			parentId: edit,
			timestamp,
			targetId: "not-retained",
		};
		const imported = SessionManager.inMemory(undefined, undefined, [...session.getEntries(), dangling]);
		imported.createBranchedSession("dangling");
		expect(projectedText(imported)).toEqual([`${CONTEXT_BLOCK_SUMMARY_PREFIX}LOCAL_SUMMARY`]);
		expect(imported.getEntry(sibling)).toBeUndefined();
		expect(imported.getEntry("dangling")).toMatchObject({ targetId: "not-retained" });
	});

	it("restores a summarized tool exchange retained across two compaction checkpoints", () => {
		const directory = mkdtempSync(join(tmpdir(), "context-curation-compaction-retention-"));
		directories.push(directory);
		const session = SessionManager.create(directory, directory);
		const discarded = session.appendMessage({ role: "user", content: "OUTSIDE_RETENTION", timestamp: 1 });
		const assistant = fauxAssistantMessage([fauxToolCall("read", {}), fauxToolCall("bash", {})], {
			stopReason: "toolUse",
		});
		const head = session.appendMessage(assistant);
		const callIds = assistant.content.flatMap((part) => (part.type === "toolCall" ? [part.id] : []));
		const results = callIds.map((toolCallId, index) =>
			session.appendMessage({
				role: "toolResult",
				toolCallId,
				toolName: index === 0 ? "read" : "bash",
				content: [{ type: "text", text: `RAW_TOOL_RESULT_${index}` }],
				isError: false,
				timestamp: index + 2,
			}),
		);
		const exchangeIds = [head, ...results];
		session.appendContextChanges(
			exchangeIds.map((targetId, index) => ({
				targetId,
				state: "summarized" as const,
				...(index === 0 ? { summary: "TOOL_EXCHANGE_SUMMARY" } : {}),
			})),
		);

		session.appendCompaction("FIRST_CHECKPOINT", head, 1000);
		expect(session.buildContextEntriesAll().map((entry) => entry.id)).toEqual(expect.arrayContaining(exchangeIds));
		session.appendMessage({ role: "user", content: "between checkpoints", timestamp: 4 });
		session.appendCompaction("SECOND_CHECKPOINT", head, 1200);
		expect(session.buildContextEntriesAll().map((entry) => entry.id)).toEqual(expect.arrayContaining(exchangeIds));
		expect(projectedText(session)).toContain("SECOND_CHECKPOINT");
		expect(projectedText(session)).toContain(`${CONTEXT_BLOCK_SUMMARY_PREFIX}TOOL_EXCHANGE_SUMMARY`);
		expect(projectedText(session)).not.toContain("RAW_TOOL_RESULT_0");
		expect(projectedText(session)).not.toContain("RAW_TOOL_RESULT_1");

		for (const id of exchangeIds) session.appendContextChange(id, "included");
		session.appendContextChange(discarded, "included");
		const file = session.getSessionFile();
		if (!file) throw new Error("expected persisted session file");
		expect(readFileSync(file, "utf8")).toContain('"type":"context_edit_cancel"');

		const reloaded = SessionManager.open(file);
		const projection = reloaded.buildSessionProjection();
		const restoredAssistant = projection.messages.find(
			(message) => message.role === "assistant" && message.content.some((part) => part.type === "toolCall"),
		);
		if (!restoredAssistant || restoredAssistant.role !== "assistant") {
			throw new Error("expected restored assistant tool-call head in projection");
		}
		const projectedCalls = restoredAssistant.content.filter((part) => part.type === "toolCall");
		const projectedResults = projection.messages.filter((message) => message.role === "toolResult");
		expect(projectedCalls.map((call) => call.id)).toEqual(callIds);
		expect(projectedResults.map((result) => result.toolCallId)).toEqual(callIds);
		expect(projectedResults.map((result) => contentText(result.content))).toEqual([
			"RAW_TOOL_RESULT_0",
			"RAW_TOOL_RESULT_1",
		]);
		expect(projectedText(reloaded)).not.toContain("OUTSIDE_RETENTION");
		expect(reloaded.getPruneState(discarded)).toBeUndefined();
	});

	it("reloads edits and cancellations, copies the full tree on fork, and persists path extraction", () => {
		const directory = mkdtempSync(join(tmpdir(), "context-curation-"));
		directories.push(directory);
		const session = SessionManager.create(directory, directory);
		const root = session.appendMessage({ role: "user", content: "original", timestamp: 1 });
		session.appendMessage(fauxAssistantMessage("answer"));
		const edited = session.appendContextChange(root, "summarized", "SUMMARY");
		session.branch(root);
		session.appendMessage(fauxAssistantMessage("other answer"));
		const omitted = session.appendContextChange(root, "excluded");
		const restored = session.appendContextChange(root, "included");
		const source = session.getSessionFile()!;
		const originalFile = readFileSync(source, "utf8");
		const reloaded = SessionManager.open(source);
		expect(projectedText(reloaded)).toEqual(["original", "other answer"]);
		expect(readFileSync(source, "utf8")).toBe(originalFile);
		expect(reloaded.getEntries().some((entry) => entry.type === "prune")).toBe(false);
		reloaded.branch(edited);
		expect(projectedText(reloaded)).toEqual([`${CONTEXT_BLOCK_SUMMARY_PREFIX}SUMMARY`, "answer"]);
		reloaded.branch(omitted);
		expect(projectedText(reloaded)).toEqual(["other answer"]);
		const fork = SessionManager.forkFrom(source, directory, directory);
		expect(fork.getEntries()).toEqual(session.getEntries());
		expect(projectedText(fork)).toEqual(["original", "other answer"]);
		fork.branch(edited);
		expect(projectedText(fork)).toEqual([`${CONTEXT_BLOCK_SUMMARY_PREFIX}SUMMARY`, "answer"]);
		const extractedFile = fork.createBranchedSession(restored)!;
		const extracted = SessionManager.open(extractedFile);
		expect(projectedText(extracted)).toEqual(["original", "other answer"]);
		expect(extracted.getEntry(edited)).toBeUndefined();
		expect(extracted.getEntries().some((entry) => entry.type === "prune")).toBe(false);
		extracted.branch(omitted);
		expect(projectedText(extracted)).toEqual(["other answer"]);
		extracted.setSessionFile(source);
		expect(projectedText(extracted)).toEqual(["original", "other answer"]);
	});

	it("preserves imported standard edits and unknown entry types", () => {
		const session = SessionManager.inMemory();
		const user = session.appendMessage({ role: "user", content: "original", timestamp: 1 });
		const edit = session.appendContextEdit(user, { content: "UPSTREAM_REPLACEMENT" });
		expect(session.getEntry(edit)).toMatchObject({
			type: "context_edit",
			replacement: { content: "UPSTREAM_REPLACEMENT" },
		} satisfies Partial<ContextEditEntry>);
		expect(session.getPruneState(user)).toBeUndefined();
		expect(projectedText(session)).toEqual(["UPSTREAM_REPLACEMENT"]);
		const [unknown] = parseSessionEntries(
			JSON.stringify({ type: "future_entry", id: "future", parentId: edit, timestamp }),
		);
		const imported = SessionManager.inMemory(undefined, undefined, [...session.getEntries(), unknown]);
		expect(projectedText(imported)).toEqual(["UPSTREAM_REPLACEMENT"]);
		expect(imported.getEntry("future")).toBe(unknown);
	});
});
