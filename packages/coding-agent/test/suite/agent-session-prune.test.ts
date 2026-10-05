import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.ts";

describe("AgentSession setPruneState", () => {
	const harnesses: Harness[] = [];
	const track = (harness: Harness): Harness => {
		harnesses.push(harness);
		return harness;
	};
	afterEach(() => {
		for (const harness of harnesses) harness.cleanup();
		harnesses.length = 0;
	});

	function userEntryId(harness: Harness): string {
		const entry = harness.sessionManager.getEntries().find((e) => e.type === "message" && e.message.role === "user");
		expect(entry).toBeDefined();
		return entry!.id;
	}

	function seedLaterVisibleBlocks(harness: Harness, count = 8): string[] {
		const ids: string[] = [];
		for (let index = 0; index < count; index++) {
			ids.push(
				harness.sessionManager.appendMessage({
					role: "user",
					content: `later visible block ${index + 1}`,
					timestamp: Date.now(),
				}),
			);
		}
		harness.session.refreshContext();
		return ids;
	}

	function latestToolResult(harness: Harness): (typeof harness.session.messages)[number] | undefined {
		return harness.session.messages.filter((message) => message.role === "toolResult").at(-1);
	}

	function toolResultText(message: AgentMessage): string {
		if (message.role !== "toolResult") return "";
		return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
	}

	it("excludes pruned entries from the live context", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		// The fork seeds a leading system message into the transcript (upstream v0.87.1
		// moved the system prompt into `state.messages`).
		expect(harness.session.messages.map((m) => m.role)).toEqual(["system", "user", "assistant"]);

		const id = userEntryId(harness);
		harness.session.setPruneState([id], "excluded");

		// Context rebuild drops the pruned user message; the seeded system message remains.
		expect(harness.session.messages.map((m) => m.role)).toEqual(["system", "assistant"]);
		expect(harness.sessionManager.getPruneState(id)).toBe("excluded");
		expect(harness.sessionManager.getEntries().filter((entry) => entry.type === "prune")).toHaveLength(0);
	});

	it("replaces an atomic block with a persisted summary", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const id = userEntryId(harness);
		harness.session.setBlockSummary([id], "The user started the greeting task.");

		expect(harness.sessionManager.getPruneState(id)).toBe("summarized");
		expect(harness.sessionManager.getPruneSummary(id)).toBe("The user started the greeting task.");
		expect(harness.session.messages).toMatchObject([
			// The transcript starts with the fork-seeded system prompt message
			// (upstream v0.87.1 moved the system prompt into `state.messages`).
			{ role: "system" },
			{
				role: "user",
				content: "[Summary of previously summarized context block]\nThe user started the greeting task.",
			},
			{ role: "assistant" },
		]);
	});

	it("prevalidates every summary target before changing session or live context", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const activeId = userEntryId(harness);
		const activeLeaf = harness.sessionManager.getLeafId();
		harness.sessionManager.branch(activeId);
		const siblingId = harness.sessionManager.appendMessage({
			role: "user",
			content: "sibling",
			timestamp: Date.now(),
		});
		harness.sessionManager.branch(activeLeaf!);
		const entriesBefore = harness.sessionManager.getEntries();
		const messagesBefore = harness.session.messages;
		const countBefore = harness.sessionManager.getEntryCount();

		expect(() => harness.session.setBlockSummary([activeId, siblingId], "replacement")).toThrow(
			"not on the active branch",
		);
		expect(harness.sessionManager.getEntries()).toEqual(entriesBefore);
		expect(harness.sessionManager.getEntryCount()).toBe(countBefore);
		expect(harness.sessionManager.getLeafId()).toBe(activeLeaf);
		expect(harness.session.messages).toEqual(messagesBefore);
	});

	it("prevalidates every include/exclude target before changing session or live context", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const activeId = userEntryId(harness);
		const activeLeaf = harness.sessionManager.getLeafId();
		harness.sessionManager.branch(activeId);
		const siblingId = harness.sessionManager.appendMessage({
			role: "user",
			content: "sibling",
			timestamp: Date.now(),
		});
		harness.sessionManager.branch(activeLeaf!);
		const entriesBefore = harness.sessionManager.getEntries();
		const messagesBefore = harness.session.messages;
		const countBefore = harness.sessionManager.getEntryCount();

		for (const state of ["included", "excluded"] as const) {
			expect(() => harness.session.setPruneState([activeId, siblingId], state)).toThrow("not on the active branch");
			expect(harness.sessionManager.getEntries()).toEqual(entriesBefore);
			expect(harness.sessionManager.getEntryCount()).toBe(countBefore);
			expect(harness.sessionManager.getLeafId()).toBe(activeLeaf);
			expect(harness.session.messages).toEqual(messagesBefore);
		}
	});

	it("restores entries on unprune", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const id = userEntryId(harness);
		harness.session.setPruneState([id], "excluded");
		// Only the user message is pruned; the seeded system message stays (upstream v0.87.1).
		expect(harness.session.messages.map((m) => m.role)).toEqual(["system", "assistant"]);

		harness.session.setPruneState([id], "included");
		// Restored: leading system message precedes the unpruned user/assistant pair.
		expect(harness.session.messages.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
		expect(harness.sessionManager.getPruneState(id)).toBeUndefined();
	});

	it("prunes all entries in a block together", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);
		const assistant = harness.sessionManager
			.getEntries()
			.find((e) => e.type === "message" && e.message.role === "assistant")!;
		expect(assistant).toBeDefined();

		harness.session.setPruneState([user, assistant.id], "excluded");
		// Both block entries are pruned; only the seeded system message remains
		// (upstream v0.87.1 moved the system prompt into the transcript).
		expect(harness.session.messages.map((m) => m.role)).toEqual(["system"]);
	});

	it("prunes context via the prune_context tool", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		// Leading system message is part of the transcript (upstream v0.87.1).
		expect(harness.session.messages.map((m) => m.role)).toEqual(["system", "user", "assistant"]);

		// Keep the intended target outside the protected recent suffix.
		const user = userEntryId(harness);
		const recentIds = seedLaterVisibleBlocks(harness);

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [user] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune the first message");

		// The first user message ("hello") is pruned from the live context.
		const hello = harness.session.messages.find((m) => m.role === "user" && m.content === "hello");
		expect(hello).toBeUndefined();

		// The success result is factual: what was pruned and how much remains.
		const result = latestToolResult(harness);
		expect(result).toBeDefined();
		expect(result!.role).toBe("toolResult");
		if (result!.role !== "toolResult") throw new Error("expected tool result");
		expect(result!.isError).toBe(false);
		const text = toolResultText(result!);
		expect(text).toContain("Pruned 1 block(s).");
		expect(text).toContain("block(s) remain.");
		expect(text).not.toContain(recentIds[0]);
	});

	it("keeps protected blocks during a mixed prune and guides a retry", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const eligibleId = userEntryId(harness);
		const recentIds = seedLaterVisibleBlocks(harness);

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [eligibleId, recentIds[recentIds.length - 1]] })], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune selected blocks");

		const result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		const text = toolResultText(result);
		expect(text).toContain("Kept");
		expect(text).toContain(recentIds[recentIds.length - 1]);
		expect(text).toContain("list_context");
		expect(text).toMatch(/retry|continue/i);
		expect(harness.sessionManager.getPruneState(eligibleId)).toBe("excluded");
		expect(harness.sessionManager.getPruneState(recentIds[recentIds.length - 1])).toBeUndefined();
	});

	it("reports an all-protected prune without edits and accepts an older retry", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const eligibleId = userEntryId(harness);
		const recentIds = seedLaterVisibleBlocks(harness);
		const protectedId = recentIds[recentIds.length - 1];

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [protectedId] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune the recent block");
		let result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("Nothing pruned");
		expect(harness.sessionManager.getPruneState(protectedId)).toBeUndefined();

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [eligibleId] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("retry with the old block");
		result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("Pruned 1 block(s).");
		expect(harness.sessionManager.getPruneState(eligibleId)).toBe("excluded");
	});

	it("reports when the requested prune has no older unprotected blocks", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const protectedId = harness.sessionManager.getLeafId()!;

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [protectedId] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune only the recent block");

		const result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("No older unprotected blocks");
		expect(harness.sessionManager.getPruneState(protectedId)).toBeUndefined();
	});

	it("summarizes only eligible old blocks when protected ids are also selected", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const eligibleId = userEntryId(harness);
		const recentIds = seedLaterVisibleBlocks(harness);
		let summaryRequest = "";
		harness.setResponses([
			fauxAssistantMessage(
				[fauxToolCall("summarize_context", { ids: [eligibleId, recentIds[recentIds.length - 1]] })],
				{ stopReason: "toolUse" },
			),
			(context) => {
				summaryRequest = JSON.stringify(context.messages);
				return fauxAssistantMessage("Summary of the old hello block.");
			},
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize selected blocks");

		const result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("Kept");
		expect(toolResultText(result)).toContain(recentIds[recentIds.length - 1]);
		expect(summaryRequest).toContain("hello");
		expect(summaryRequest).not.toContain(`later visible block 8`);
		expect(harness.sessionManager.getPruneState(eligibleId)).toBe("summarized");
		expect(harness.sessionManager.getPruneState(recentIds[recentIds.length - 1])).toBeUndefined();
	});

	it("does not resolve auth or a configured model for an all-protected summary", async () => {
		const harness = track(
			await createHarness({
				models: [{ id: "test-model", contextWindow: 1000 }],
				settings: { reflectiveContext: { summarizationModel: { provider: "faux", model: "missing-model" } } },
			}),
		);
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const recentIds = seedLaterVisibleBlocks(harness);
		const protectedId = recentIds[recentIds.length - 1];
		await harness.authStorage.delete("faux");
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [protectedId] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the recent block");

		const result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("Nothing summarized");
		expect(harness.sessionManager.getPruneState(protectedId)).toBeUndefined();
		expect(harness.getPendingResponseCount()).toBe(0);
	});

	it("leaves every block unchanged when a later eligible summary request fails", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const eligibleId = userEntryId(harness);
		const secondId = harness.sessionManager.getLeafId()!;
		const recentIds = seedLaterVisibleBlocks(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [eligibleId, secondId] })], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("The first summary was generated but must not be persisted."),
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "Synthetic summary failure" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the old block");

		const result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(true);
		expect(toolResultText(result)).toContain("no blocks were changed");
		expect(harness.sessionManager.getEntries().some((entry) => entry.type === "prune")).toBe(false);
		expect(harness.sessionManager.getPruneState(eligibleId)).toBeUndefined();
		expect(harness.sessionManager.getPruneState(secondId)).toBeUndefined();
		for (const id of recentIds) expect(harness.sessionManager.getPruneState(id)).toBeUndefined();
	});

	it("keeps a block that becomes protected while its summary is in flight", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const targetId = userEntryId(harness);
		const recentIds = seedLaterVisibleBlocks(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [targetId] })], { stopReason: "toolUse" }),
			() => {
				// The human/SDK override can remove newer blocks while a model call awaits.
				harness.session.setPruneState(recentIds, "excluded");
				return fauxAssistantMessage("This generated summary must not replace newly protected history.");
			},
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the old block");

		const result = latestToolResult(harness);
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("Nothing summarized");
		expect(toolResultText(result)).toContain(targetId);
		expect(harness.sessionManager.getPruneState(targetId)).toBeUndefined();
		expect(harness.sessionManager.getPruneSummary(targetId)).toBeUndefined();
		expect(harness.getPendingResponseCount()).toBe(0);
	});

	it("does not restore a block excluded while its summary is in flight", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const targetId = userEntryId(harness);
		seedLaterVisibleBlocks(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [targetId] })], { stopReason: "toolUse" }),
			() => {
				harness.session.setPruneState([targetId], "excluded");
				return fauxAssistantMessage("This stale summary must not restore excluded history.");
			},
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the old block");

		const result = latestToolResult(harness);
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("Nothing summarized");
		expect(toolResultText(result)).toContain("not selectable in the current context");
		expect(harness.sessionManager.getPruneState(targetId)).toBe("excluded");
		expect(harness.sessionManager.getPruneSummary(targetId)).toBeUndefined();
		expect(harness.getPendingResponseCount()).toBe(0);
	});

	it("protects recent blocks using SDK-edited token sizes rather than superseded raw text", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const recentIds = seedLaterVisibleBlocks(harness);
		const targetId = recentIds[recentIds.length - 1];
		const editedId = harness.sessionManager.appendMessage({ role: "user", content: "x".repeat(32768), timestamp: 0 });
		harness.sessionManager.appendContextEdit(editedId, {
			content: [{ type: "text", text: "Short current content." }],
		});
		harness.session.refreshContext();
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [targetId] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune selected block");
		expect(harness.sessionManager.getPruneState(targetId)).toBeUndefined();
		expect(toolResultText(latestToolResult(harness)!)).toContain("Kept 1 protected recent block");
	});

	it("counts non-selectable summary replacements toward the visible token suffix", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const recentIds = seedLaterVisibleBlocks(harness);
		const targetId = recentIds[recentIds.length - 1];
		const summaryId = harness.sessionManager.appendMessage({ role: "user", content: "newer block", timestamp: 0 });
		harness.session.setBlockSummary([summaryId], "x".repeat(32768));
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [targetId] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune selected block");
		expect(harness.sessionManager.getPruneState(targetId)).toBe("excluded");
		expect(harness.sessionManager.getPruneState(summaryId)).toBe("summarized");
		expect(toolResultText(latestToolResult(harness)!)).toContain("Pruned 1 block");
	});

	it("summarizes the current SDK-edited projection rather than original raw content", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("response")]);
		await harness.session.prompt("ORIGINAL SOURCE MARKER");
		const targetId = userEntryId(harness);
		harness.sessionManager.appendContextEdit(targetId, { content: [{ type: "text", text: "SDK EDITED MARKER" }] });
		harness.session.refreshContext();
		seedLaterVisibleBlocks(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [targetId] })], { stopReason: "toolUse" }),
			(request) => {
				const input = JSON.stringify(request.messages);
				expect(input).toContain("SDK EDITED MARKER");
				expect(input).not.toContain("ORIGINAL SOURCE MARKER");
				return fauxAssistantMessage("The SDK-edited context was summarized.");
			},
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the old block");
		expect(harness.sessionManager.getPruneSummary(targetId)).toBe("The SDK-edited context was summarized.");
		expect(harness.getPendingResponseCount()).toBe(0);
	});

	it("does not overwrite source content edited while its summary is in flight", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const targetId = userEntryId(harness);
		seedLaterVisibleBlocks(harness);
		const humanEdit = "The human changed the current content while summarization was running.";
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [targetId] })], { stopReason: "toolUse" }),
			() => {
				harness.sessionManager.appendContextEdit(targetId, { content: [{ type: "text", text: humanEdit }] });
				harness.session.refreshContext();
				return fauxAssistantMessage("Stale generated summary of the original greeting.");
			},
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the old block");

		const result = latestToolResult(harness);
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("Nothing summarized");
		expect(toolResultText(result)).toContain("Kept changed source block(s)");
		expect(toolResultText(result)).toContain("No stale summaries were applied");
		expect(harness.sessionManager.getPruneState(targetId)).toBeUndefined();
		expect(JSON.stringify(harness.sessionManager.buildSessionContext().messages)).toContain(humanEdit);
		expect(harness.getPendingResponseCount()).toBe(0);
	});

	it("reports vanished mixed-summary targets without suggesting a retry when no older blocks remain", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const targetId = userEntryId(harness);
		const recentIds = seedLaterVisibleBlocks(harness);
		const protectedId = recentIds[recentIds.length - 1];
		const oldIds = harness.sessionManager
			.buildContextEntries()
			.slice(0, 5)
			.map((entry) => entry.id);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [targetId, protectedId] })], {
				stopReason: "toolUse",
			}),
			() => {
				harness.session.setPruneState(oldIds, "excluded");
				return fauxAssistantMessage("This generated summary has lost its target.");
			},
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize selected blocks");

		const result = latestToolResult(harness);
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		const text = toolResultText(result);
		expect(text).toContain("Nothing summarized");
		expect(text).toContain("No older unprotected blocks");
		expect(text).toContain(`Unknown id(s): ${targetId}`);
		expect(text).not.toContain("select older blocks");
		expect(harness.sessionManager.getPruneState(targetId)).toBe("excluded");
		expect(harness.sessionManager.getPruneState(protectedId)).toBeUndefined();
	});

	it("reevaluates recent-block protection when context changes before execution", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		const targetId = userEntryId(harness);
		harness.setResponses([
			() => {
				seedLaterVisibleBlocks(harness);
				return fauxAssistantMessage([fauxToolCall("prune_context", { ids: [targetId] })], {
					stopReason: "toolUse",
				});
			},
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune the selected old block");

		const result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain("Pruned 1 block(s).");
		expect(harness.sessionManager.getPruneState(targetId)).toBe("excluded");
	});

	it("keeps a protected multi-result tool exchange atomic", async () => {
		const makeTool = (name: string): AgentTool => ({
			name,
			label: name,
			description: name,
			parameters: Type.Object({}),
			execute: async () => ({ content: [{ type: "text", text: `${name} result` }], details: {} }),
		});
		const harness = track(
			await createHarness({
				models: [{ id: "test-model", contextWindow: 1000 }],
				tools: [makeTool("atomic_a"), makeTool("atomic_b")],
			}),
		);
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");
		seedLaterVisibleBlocks(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("atomic_a", {}), fauxToolCall("atomic_b", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("tools completed"),
		]);
		await harness.session.prompt("run both tools");
		const callEntry = harness.sessionManager
			.getEntries()
			.find(
				(entry) =>
					entry.type === "message" &&
					entry.message.role === "assistant" &&
					entry.message.content.some((part) => part.type === "toolCall" && part.name === "atomic_a"),
			);
		if (callEntry?.type !== "message" || callEntry.message.role !== "assistant") {
			throw new Error("expected atomic tool call entry");
		}
		const callIds = new Set(callEntry.message.content.flatMap((part) => (part.type === "toolCall" ? [part.id] : [])));
		const exchangeIds = harness.sessionManager
			.getEntries()
			.filter(
				(entry) =>
					entry.type === "message" && entry.message.role === "toolResult" && callIds.has(entry.message.toolCallId),
			)
			.map((entry) => entry.id);
		expect(exchangeIds).toHaveLength(2);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [callEntry.id] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune the recent tool exchange");

		const result = latestToolResult(harness);
		expect(result?.role).toBe("toolResult");
		if (result?.role !== "toolResult") throw new Error("expected tool result");
		expect(result.isError).toBe(false);
		expect(toolResultText(result)).toContain(callEntry.id);
		const contextMessages = harness.sessionManager.buildSessionContext().messages;
		expect(
			contextMessages.some(
				(message) =>
					message.role === "assistant" &&
					message.content.some((part) => part.type === "toolCall" && part.name === "atomic_a"),
			),
		).toBe(true);
		const retainedToolResults = contextMessages.filter(
			(message) => message.role === "toolResult" && callIds.has(message.toolCallId),
		);
		expect(retainedToolResults).toHaveLength(2);
		for (const id of exchangeIds) expect(harness.sessionManager.getPruneState(id)).toBeUndefined();
	});

	it("falls back to the active model when no summary model is configured", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);
		seedLaterVisibleBlocks(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [user] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("The active model summarized the greeting task."),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the first message");

		expect(harness.sessionManager.getPruneState(user)).toBe("summarized");
		expect(harness.sessionManager.getPruneSummary(user)).toBe("The active model summarized the greeting task.");
		expect(harness.sessionManager.getEntries().filter((entry) => entry.type === "prune")).toHaveLength(0);
	});

	it("summarizes a tool exchange without leaking the original call or large results into later requests", async () => {
		const largeOutputA = "LARGE_TOOL_OUTPUT_A".repeat(2000);
		const largeOutputB = "LARGE_TOOL_OUTPUT_B".repeat(2000);
		const makeLargeTool = (name: string, output: string): AgentTool => ({
			name,
			label: name,
			description: name,
			parameters: Type.Object({}),
			execute: async () => ({ content: [{ type: "text", text: output }], details: {} }),
		});
		const harness = track(
			await createHarness({
				models: [{ id: "test-model", contextWindow: 100000 }],
				tools: [makeLargeTool("large_a", largeOutputA), makeLargeTool("large_b", largeOutputB)],
			}),
		);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("large_a", {}), fauxToolCall("large_b", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("reports produced"),
		]);
		await harness.session.prompt("generate both reports");

		const toolCallEntry = harness.sessionManager
			.getEntries()
			.find(
				(entry) =>
					entry.type === "message" &&
					entry.message.role === "assistant" &&
					entry.message.content.some((part) => part.type === "toolCall"),
			);
		if (toolCallEntry?.type !== "message" || toolCallEntry.message.role !== "assistant") {
			throw new Error("expected persisted tool call message");
		}
		const id = toolCallEntry.id;
		seedLaterVisibleBlocks(harness);
		let summarizeTurnNextRequest: typeof harness.session.messages = [];
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [id] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("Both reports completed successfully."),
			(context) => {
				summarizeTurnNextRequest = context.messages;
				return fauxAssistantMessage("summary saved");
			},
		]);
		await harness.session.prompt("summarize the report block");

		let nextRequestMessages: typeof harness.session.messages = [];
		harness.setResponses([
			(context) => {
				nextRequestMessages = context.messages;
				return fauxAssistantMessage("continued");
			},
		]);
		await harness.session.prompt("continue");

		const originalToolCallIds = toolCallEntry.message.content.flatMap((part) =>
			part.type === "toolCall" ? [part.id] : [],
		);
		for (const requestMessages of [summarizeTurnNextRequest, nextRequestMessages]) {
			const summaryMessages = requestMessages.filter(
				(message) =>
					(message.role === "user" || message.role === "assistant") &&
					Array.isArray(message.content) &&
					message.content.some(
						(part) =>
							part.type === "text" && part.text.startsWith("[Summary of previously summarized context block]\n"),
					),
			);
			expect(summaryMessages).toHaveLength(1);
			expect(summaryMessages[0].role).toBe("assistant");
			expect(JSON.stringify(summaryMessages)).toContain("Both reports completed successfully.");
			expect(
				requestMessages.some(
					(message) =>
						message.role === "assistant" &&
						message.content.some(
							(part) => part.type === "toolCall" && (part.name === "large_a" || part.name === "large_b"),
						),
				),
			).toBe(false);
			expect(
				requestMessages.some(
					(message) => message.role === "toolResult" && originalToolCallIds.includes(message.toolCallId),
				),
			).toBe(false);
			expect(
				requestMessages.some(
					(message) =>
						message.role === "toolResult" &&
						message.content.some(
							(part) => part.type === "text" && (part.text === largeOutputA || part.text === largeOutputB),
						),
				),
			).toBe(false);
		}
		expect(JSON.stringify(nextRequestMessages)).toContain("Both reports completed successfully.");
		expect(harness.sessionManager.getPruneState(id)).toBe("summarized");
		const originalToolResultIds = harness.sessionManager
			.getEntries()
			.filter(
				(entry) =>
					entry.type === "message" &&
					entry.message.role === "toolResult" &&
					originalToolCallIds.includes(entry.message.toolCallId),
			)
			.map((entry) => entry.id);
		harness.session.setPruneState([id, ...originalToolResultIds], "included");
		expect(
			harness.sessionManager
				.buildSessionContext()
				.messages.some(
					(message) =>
						message.role === "assistant" &&
						message.content.some((part) => part.type === "toolCall" && part.name === "large_a"),
				),
		).toBe(true);
		expect(
			harness.sessionManager
				.buildSessionContext()
				.messages.some(
					(message) =>
						message.role === "toolResult" &&
						message.content.some((part) => part.type === "text" && part.text === largeOutputA),
				),
		).toBe(true);
	});

	it("manual compaction summarizes context edits without exposing hidden tool data", async () => {
		const harness = track(
			await createHarness({
				models: [{ id: "test-model", contextWindow: 100000 }],
				settings: { compaction: { keepRecentTokens: 1 } },
			}),
		);
		const rawOutput = "RAW_HUGE_SIBLING_OUTPUT".repeat(2000);
		const callId = harness.sessionManager.appendMessage(
			fauxAssistantMessage([fauxToolCall("read", { path: "secret.txt" })], { stopReason: "toolUse" }),
		);
		const call = harness.sessionManager.getEntry(callId);
		if (call?.type !== "message" || call.message.role !== "assistant") throw new Error("expected tool call entry");
		const toolCallId = call.message.content.find((part) => part.type === "toolCall")?.id;
		if (!toolCallId) throw new Error("expected tool call id");
		const resultId = harness.sessionManager.appendMessage({
			role: "toolResult",
			toolCallId,
			toolName: "read",
			content: [{ type: "text", text: rawOutput }],
			isError: false,
			timestamp: Date.now(),
		});
		const savedSummary = "The tool output confirmed the required configuration setting.";
		harness.session.setBlockSummary([callId, resultId], savedSummary);
		harness.sessionManager.appendMessage({
			role: "user",
			content: "Continue from the summarized tool block",
			timestamp: Date.now(),
		});
		harness.sessionManager.appendMessage(fauxAssistantMessage("I can continue."));
		harness.session.refreshContext();

		const summaryPrompts: string[] = [];
		harness.setResponses([
			(context) => {
				summaryPrompts.push(JSON.stringify(context.messages));
				return fauxAssistantMessage("Compacted sibling context.");
			},
			(context) => {
				summaryPrompts.push(JSON.stringify(context.messages));
				return fauxAssistantMessage("Compacted turn prefix.");
			},
		]);
		await harness.session.compact();

		const fullPrompt = summaryPrompts.join("\\n");
		expect(fullPrompt).toContain(savedSummary);
		expect(fullPrompt).not.toContain("RAW_HUGE_SIBLING_OUTPUT");
		expect(fullPrompt).not.toContain("secret.txt");
	});

	it("summarizes a selected block with the configured secondary model", async () => {
		const harness = track(
			await createHarness({
				models: [
					{ id: "agent-model", contextWindow: 1000 },
					{ id: "summary-model", contextWindow: 1000 },
				],
				settings: {
					reflectiveContext: { summarizationModel: { provider: "faux", model: "summary-model" } },
				},
			}),
		);
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);
		seedLaterVisibleBlocks(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [user] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("The user opened the greeting task."),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the first message");

		expect(harness.sessionManager.getPruneState(user)).toBe("summarized");
		expect(harness.sessionManager.getPruneSummary(user)).toBe("The user opened the greeting task.");
		expect(harness.session.messages).toContainEqual(
			expect.objectContaining({
				role: "user",
				content: "[Summary of previously summarized context block]\nThe user opened the greeting task.",
			}),
		);
	});

	it("lists blocks with ids via list_context", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);
		const recentIds = seedLaterVisibleBlocks(harness);

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("list_context", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("list blocks");

		// Listing preserves every block id and explicitly marks the protected suffix.
		const result = latestToolResult(harness);
		expect(result).toBeDefined();
		expect(result!.role).toBe("toolResult");
		if (result!.role !== "toolResult") throw new Error("expected tool result");
		expect(result!.isError).toBe(false);
		const text = toolResultText(result!);
		expect(text).toContain(user);
		expect(text).toContain("user: hello");
		expect(text).toContain("Listing is read-only");
		for (const id of recentIds) expect(text).toContain(id);
		expect(text).toContain("[protected: recent]");
	});

	it("registers list_context as a read-only zero-parameter tool", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const definition = harness.session.getToolDefinition("list_context");
		expect(definition).toBeDefined();
		expect(definition!.parameters).toMatchObject({ type: "object", properties: {} });
		expect(definition!.description).toContain("no parameters");
	});

	it("errors when prune_context is called without ids", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune without ids");

		// A mutating tool must fail loudly when the mutation payload is missing.
		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(true);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: prune_context requires");
		expect(text).toContain("Call list_context");
	});

	it("errors when prune_context is called with an empty ids array", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune with empty ids");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(true);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: prune_context requires");
		expect(text).toContain("Call list_context");
	});

	it("errors when no blocks match the given ids", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: ["does-not-exist"] })], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune unknown id");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(true);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("No current context blocks matched");
		expect(text).toContain("does-not-exist");
	});

	it("frames context hygiene as a quality requirement in the system prompt", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const prompt = harness.session.systemPrompt;
		expect(prompt).toContain("prune_context");
		expect(prompt).toContain("context is your working set");
		expect(prompt).toContain("competes for attention");
		expect(prompt).toContain("natural work boundaries");
		expect(prompt).toContain("safety signal, not the normal trigger");
	});

	it("advertises ids as an array of strings", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const parameters = harness.session.getToolDefinition("prune_context")?.parameters;
		expect(parameters).toMatchObject({
			type: "object",
			properties: {
				ids: {
					type: "array",
					items: { type: "string" },
				},
			},
		});
	});

	it("spells out the list-then-prune workflow in the tool description", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const description = harness.session.getToolDefinition("prune_context")?.description ?? "";
		expect(description).toContain("Call list_context");
		expect(description).toContain("exclude the selected blocks");
		// The agent tool only excludes; restoration is via the user's /prune command.
		expect(description).toContain("cannot restore blocks");
		expect(description).toContain("/prune");
	});

	it("frames capacity pressure as a context-hygiene safety fallback", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const prompt = harness.session.systemPrompt;
		expect(prompt).toContain("Context-status messages measure capacity only");
		expect(prompt).toContain("safety signal, not the normal trigger for hygiene");
	});

	it("returns error for malformed parameters", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { wrong: "param" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("try malformed params");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(true);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: prune_context requires");
		expect(text).toContain("Call list_context");
	});

	it("returns error when ids is not an array", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: "not-an-array" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("try non-array ids");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: 'ids' must be an array");
	});

	it("returns error when ids contains non-string values", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [123, "valid-id"] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("try non-string ids");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: All ids must be strings");
		expect(text).toContain("123");
	});
});
