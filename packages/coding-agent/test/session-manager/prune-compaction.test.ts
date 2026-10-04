import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_COMPACTION_SETTINGS,
	estimateProjectedContextTokens,
	prepareCompaction,
} from "../../src/core/compaction/index.ts";
import { SessionManager } from "../../src/core/session-manager.ts";

describe("compaction with summarized prune blocks", () => {
	it("compacts the saved block summary without exposing hidden tool data", () => {
		const session = SessionManager.inMemory();
		session.appendMessage({ role: "user", content: "inspect the project", timestamp: 1 });
		const callId = session.appendMessage(
			fauxAssistantMessage([fauxToolCall("read", { path: "private/large.txt" })], { stopReason: "toolUse" }),
		);
		const call = session.getEntry(callId);
		if (call?.type !== "message" || call.message.role !== "assistant") throw new Error("expected tool call entry");
		const toolCallId = call.message.content.find((part) => part.type === "toolCall")?.id;
		if (!toolCallId) throw new Error("expected tool call id");
		const resultId = session.appendMessage({
			role: "toolResult",
			toolCallId,
			toolName: "read",
			content: [{ type: "text", text: "RAW_PRIVATE_OUTPUT".repeat(1000) }],
			isError: false,
			timestamp: 2,
		});
		session.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "I inspected the file." }],
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
			timestamp: 3,
		});
		const keptEntryId = session.appendMessage({ role: "user", content: "continue with the project", timestamp: 4 });
		session.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "Ready." }],
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
			timestamp: 5,
		});
		const summary = "The file was inspected and contains the required project configuration.";
		session.appendContextChange(callId, "summarized", summary);
		session.appendContextChange(resultId, "summarized");

		const projection = session.buildSessionProjection();
		const projectedSummary = projection.messages.find(
			(message) =>
				(message.role === "assistant" || message.role === "user") &&
				Array.isArray(message.content) &&
				message.content.some(
					(part) =>
						part.type === "text" && part.text.startsWith("[Summary of previously summarized context block]\n"),
				),
		);
		expect(projectedSummary).toBeDefined();
		expect(projectedSummary?.role).toBe("assistant");
		expect(projection.messages.filter((message) => message.role === "toolResult")).toHaveLength(0);
		const estimatedTokens = estimateProjectedContextTokens(projection, session.getBranch()).tokens;
		const preparation = prepareCompaction(
			session.getBranch(),
			{ ...DEFAULT_COMPACTION_SETTINGS, keepRecentTokens: 7 },
			session.getLegacyPruneChanges(),
		);

		expect(preparation).toBeDefined();
		expect(preparation?.firstKeptEntryId).toBe(keptEntryId);
		const preparedText = JSON.stringify(preparation?.messagesToSummarize);
		expect(preparedText.match(new RegExp(summary, "g"))).toHaveLength(1);
		expect(preparedText).not.toContain("private/large.txt");
		expect(preparedText).not.toContain("RAW_PRIVATE_OUTPUT");
		expect(preparation?.tokensBefore).toBe(estimatedTokens);
		expect(session.getEntries().filter((entry) => entry.type === "prune")).toHaveLength(0);
		expect([...preparation!.fileOps.read]).toEqual([]);
	});
});
