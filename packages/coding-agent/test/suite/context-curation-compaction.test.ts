import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AssistantMessage, fauxAssistantMessage, type SystemMessage } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateTokens } from "../../src/core/compaction/index.ts";
import type { PruneEntry, SessionEntry } from "../../src/core/session-manager.ts";
import { createHarness, getMessageText, type Harness } from "./harness.ts";

type CompactionInternals = {
	_checkCompaction: (assistant: AssistantMessage) => Promise<boolean>;
	_runAutoCompaction: (reason: "overflow" | "threshold", willRetry: boolean) => Promise<boolean>;
};

function loadSiblingLegacyChange(harness: Harness, state: PruneEntry["state"]): AssistantMessage {
	const model = harness.getModel();
	const assistant: AssistantMessage = {
		...fauxAssistantMessage("answer"),
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 10000,
			output: 10,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 10010,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
	const timestamp = new Date().toISOString();
	const entries: SessionEntry[] = [
		{
			type: "message",
			id: "root",
			parentId: null,
			timestamp,
			message: { role: "user", content: "x".repeat(40000), timestamp: 1 },
		},
		{ type: "message", id: "answer", parentId: "root", timestamp, message: assistant },
		{
			type: "prune",
			id: "sibling",
			parentId: "root",
			timestamp,
			targetId: "root",
			state,
			...(state === "summarized" ? { summary: "small summary" } : {}),
		},
	];
	const file = join(harness.tempDir, "legacy.jsonl");
	writeFileSync(
		file,
		`${[
			JSON.stringify({ type: "session", version: 3, id: "legacy", cwd: harness.tempDir, timestamp }),
			...entries.map((entry) => JSON.stringify(entry)),
		].join("\n")}\n`,
	);
	harness.sessionManager.setSessionFile(file);
	harness.sessionManager.branch("answer");
	harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
	return assistant;
}

describe("curation during compaction", () => {
	const harnesses: Harness[] = [];
	afterEach(() => {
		vi.restoreAllMocks();
		for (const harness of harnesses) harness.cleanup();
		harnesses.length = 0;
	});

	it.each(["modern", "legacy"] as const)(
		"replays checkpoint metadata across repeated compaction and reload after %s summary replacement",
		async (kind) => {
			const harness = await createHarness({ settings: { compaction: { enabled: false, keepRecentTokens: 0 } } });
			harnesses.push(harness);
			const toolA = { name: "tool_a", description: "Tool A", parameters: Type.Object({}) };
			const toolB = { name: "tool_b", description: "Tool B", parameters: Type.Object({}) };
			const toolC = { name: "tool_c", description: "Tool C", parameters: Type.Object({}) };
			const firstSystem: SystemMessage = {
				role: "system",
				content: "BASE_SYSTEM",
				sections: { policy: "<policy>BASE</policy>" },
				toolsAdded: [toolA],
				timestamp: 1,
			};
			harness.sessionManager.appendMessage(firstSystem);
			harness.sessionManager.appendMessage({ role: "user", content: "DISCARDED_USER_SECRET", timestamp: 2 });
			harness.sessionManager.appendMessage({
				role: "system",
				content: "BEFORE_FIRST_CHECKPOINT",
				sections: { policy: "<policy>PRE-CHECKPOINT</policy>" },
				toolsAdded: [toolB],
				toolsRemoved: [{ name: "tool_a" }],
				timestamp: 3,
			});
			harness.sessionManager.appendMessage({ role: "user", content: "RETAINED_USER_ONE", timestamp: 4 });

			const file = join(harness.tempDir, "repeated-compaction.jsonl");
			const saveSessionFile = (): void =>
				writeFileSync(
					file,
					`${[
						JSON.stringify(harness.sessionManager.getHeader()),
						...harness.sessionManager.getEntries().map((entry) => JSON.stringify(entry)),
					].join("\n")}\n`,
				);
			saveSessionFile();
			harness.sessionManager.setSessionFile(file);
			harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;

			harness.setResponses([
				fauxAssistantMessage("RAW_FIRST_COMPACTION_SUMMARY"),
				(context) => {
					const prompt = context.messages.map(getMessageText).join("\n");
					expect(prompt).toContain("<previous-summary>");
					expect(prompt).toContain("EFFECTIVE_CHECKPOINT_SUMMARY");
					expect(prompt).not.toContain("RAW_FIRST_COMPACTION_SUMMARY");
					expect(prompt).not.toContain("DISCARDED_USER_SECRET");
					return fauxAssistantMessage("SECOND_COMPACTION_SUMMARY");
				},
			]);

			await harness.session.compact();
			const firstCheckpoint = harness.sessionManager.getEntries().find((entry) => entry.type === "compaction");
			expect(firstCheckpoint?.type).toBe("compaction");
			if (firstCheckpoint?.type !== "compaction") throw new Error("First compaction checkpoint was not saved");
			expect(firstCheckpoint.systemMessage).toMatchObject({
				content: "BASE_SYSTEM\n\nBEFORE_FIRST_CHECKPOINT",
				sections: { policy: "<policy>PRE-CHECKPOINT</policy>" },
				toolsAdded: [toolB],
			});

			// Persist the in-memory harness session, then reload through SessionManager.
			saveSessionFile();
			harness.sessionManager.setSessionFile(file);
			harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
			if (kind === "modern") {
				harness.sessionManager.appendContextChange(
					firstCheckpoint.id,
					"summarized",
					"EFFECTIVE_CHECKPOINT_SUMMARY",
				);
				saveSessionFile();
				harness.sessionManager.setSessionFile(file);
			} else {
				const marker: PruneEntry = {
					type: "prune",
					id: "legacy-checkpoint-summary",
					parentId: harness.sessionManager.getLeafId(),
					timestamp: new Date().toISOString(),
					targetId: firstCheckpoint.id,
					state: "summarized",
					summary: "EFFECTIVE_CHECKPOINT_SUMMARY",
				};
				writeFileSync(
					file,
					`${[
						JSON.stringify(harness.sessionManager.getHeader()),
						...harness.sessionManager.getEntries().map((entry) => JSON.stringify(entry)),
						JSON.stringify(marker),
					].join("\n")}\n`,
				);
				harness.sessionManager.setSessionFile(file);
			}
			harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
			harness.sessionManager.appendMessage({
				role: "system",
				content: "AFTER_FIRST_CHECKPOINT",
				sections: { policy: "<policy>POST-CHECKPOINT</policy>" },
				toolsAdded: [toolC],
				timestamp: 5,
			});
			harness.sessionManager.appendMessage({ role: "user", content: "RETAINED_USER_TWO", timestamp: 6 });
			harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;

			const result = await harness.session.compact();
			expect(result.summary).toContain("SECOND_COMPACTION_SUMMARY");
			saveSessionFile();
			const secondCheckpoint = harness.sessionManager
				.getEntries()
				.filter((entry) => entry.type === "compaction")
				.at(-1);
			expect(secondCheckpoint?.type).toBe("compaction");
			if (secondCheckpoint?.type !== "compaction") throw new Error("Second compaction checkpoint was not saved");
			expect(secondCheckpoint.systemMessage).toMatchObject({
				content: "BASE_SYSTEM\n\nBEFORE_FIRST_CHECKPOINT\n\nAFTER_FIRST_CHECKPOINT",
				sections: { policy: "<policy>POST-CHECKPOINT</policy>" },
				toolsAdded: [toolB, toolC],
			});

			// A second file reload must preserve both the edited summary projection and system replay.
			harness.sessionManager.setSessionFile(file);
			harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
			const reloadedCheckpoint = harness.sessionManager
				.getEntries()
				.filter((entry) => entry.type === "compaction")
				.at(-1);
			expect(reloadedCheckpoint).toEqual(secondCheckpoint);
			const reloadedSystem = harness.session.messages.find((message) => message.role === "system");
			expect(reloadedSystem).toMatchObject({
				content: "BASE_SYSTEM\n\nBEFORE_FIRST_CHECKPOINT\n\nAFTER_FIRST_CHECKPOINT",
				sections: { policy: "<policy>POST-CHECKPOINT</policy>" },
				toolsAdded: [toolB, toolC],
			});
		},
	);

	it.each(["modern", "legacy"] as const)("never sends a raw checkpoint after %s summary replacement", async (kind) => {
		const harness = await createHarness({ settings: { compaction: { enabled: false, keepRecentTokens: 0 } } });
		harnesses.push(harness);
		const retained = harness.sessionManager.appendMessage({
			role: "user",
			content: "history to summarize",
			timestamp: 1,
		});
		const checkpoint = harness.sessionManager.appendCompaction("RAW_CHECKPOINT_SECRET", retained, 10010);
		if (kind === "modern") harness.session.setBlockSummary([checkpoint], "SAFE_REPLACEMENT");
		harness.sessionManager.appendMessage({ role: "user", content: "new history to summarize", timestamp: 2 });
		const recent = harness.sessionManager.appendMessage({ role: "user", content: "recent message", timestamp: 2 });
		if (kind === "legacy") {
			const file = join(harness.tempDir, "checkpoint.jsonl");
			const marker: PruneEntry = {
				type: "prune",
				id: "legacy-checkpoint",
				parentId: recent,
				timestamp: new Date().toISOString(),
				targetId: checkpoint,
				state: "summarized",
				summary: "SAFE_REPLACEMENT",
			};
			writeFileSync(
				file,
				`${[
					JSON.stringify(harness.sessionManager.getHeader()),
					...[...harness.sessionManager.getEntries(), marker].map((entry) => JSON.stringify(entry)),
				].join("\n")}\n`,
			);
			harness.sessionManager.setSessionFile(file);
		}
		harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
		let requests = 0;
		harness.setResponses([
			(context) => {
				requests++;
				const prompt = context.messages.map(getMessageText).join("\n");
				expect(prompt).toContain("<previous-summary>");
				expect(prompt).toContain("SAFE_REPLACEMENT");
				expect(prompt).not.toContain("RAW_CHECKPOINT_SECRET");
				return fauxAssistantMessage("new checkpoint");
			},
		]);
		const result = await harness.session.compact();
		expect(requests).toBe(1);
		expect(result.summary).toContain("new checkpoint");
	});

	it.each(["excluded", "summarized", "included"] as const)(
		"reports projected context after a sibling legacy %s change",
		async (state) => {
			const harness = await createHarness({ settings: { compaction: { enabled: false } } });
			harnesses.push(harness);
			loadSiblingLegacyChange(harness, state);
			const projectedTokens = harness.session.messages.reduce((sum, message) => sum + estimateTokens(message), 0);
			expect(harness.session.getContextUsage()?.tokens).toBe(projectedTokens);
		},
	);

	it.each(["legacy", "modern"] as const)(
		"still detects silent overflow from fresh usage after %s curation",
		async (kind) => {
			const harness = await createHarness({
				models: [{ id: "faux-1", contextWindow: 1000, maxTokens: 100 }],
				settings: { compaction: { enabled: true, reserveTokens: 0 } },
			});
			harnesses.push(harness);
			const previous = loadSiblingLegacyChange(harness, "excluded");
			if (kind === "modern") harness.sessionManager.appendContextChange("root", "summarized", "small summary");
			const fresh: AssistantMessage = { ...previous, timestamp: previous.timestamp + 1 };
			harness.sessionManager.appendMessage(fresh);
			harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
			expect(harness.session.getContextUsage()?.tokens).toBe(10010);
			const internals = harness.session as unknown as CompactionInternals;
			const compact = vi.spyOn(internals, "_runAutoCompaction").mockResolvedValue(false);
			await internals._checkCompaction(fresh);
			expect(compact).toHaveBeenCalledExactlyOnceWith("overflow", false);
		},
	);

	it("still recovers explicit overflow when later curation invalidates usage", async () => {
		const harness = await createHarness({
			models: [{ id: "faux-1", contextWindow: 1000, maxTokens: 100 }],
			settings: { compaction: { enabled: true, reserveTokens: 0 } },
		});
		harnesses.push(harness);
		const previous = loadSiblingLegacyChange(harness, "excluded");
		const overflow: AssistantMessage = {
			...previous,
			stopReason: "error",
			errorMessage: "prompt is too long",
			timestamp: previous.timestamp + 1,
			usage: { ...previous.usage, input: 0, output: 0, totalTokens: 0 },
		};
		const errorId = harness.sessionManager.appendMessage(overflow);
		harness.sessionManager.appendContextChange("root", "summarized", "small summary");
		harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
		expect(harness.session.getContextUsage()?.tokens).toBeLessThan(1000);
		const internals = harness.session as unknown as CompactionInternals;
		const compact = vi.spyOn(internals, "_runAutoCompaction").mockResolvedValue(false);
		await internals._checkCompaction(overflow);
		expect(compact).toHaveBeenCalledExactlyOnceWith("overflow", true);
		expect(harness.sessionManager.getPruneState(errorId)).toBe("excluded");
	});

	it.each(["excluded", "summarized"] as const)(
		"does not compact using stale overflow usage after a sibling legacy %s change",
		async (state) => {
			const harness = await createHarness({
				models: [{ id: "faux-1", contextWindow: 1000, maxTokens: 100 }],
				settings: { compaction: { enabled: true, reserveTokens: 0 } },
			});
			harnesses.push(harness);
			const assistant = loadSiblingLegacyChange(harness, state);
			const internals = harness.session as unknown as CompactionInternals;
			const compact = vi.spyOn(internals, "_runAutoCompaction").mockResolvedValue(false);
			await internals._checkCompaction(assistant);
			expect(compact).not.toHaveBeenCalled();
		},
	);
});
