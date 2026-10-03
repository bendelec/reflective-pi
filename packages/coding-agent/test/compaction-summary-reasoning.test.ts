import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, type Model, normalizeContext, type TranscriptContext } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeBlock } from "../src/core/block-summarization.ts";
import {
	type CompactionPreparation,
	compact,
	completeSummarization,
	generateSummary,
	generateSummaryWithUsage,
} from "../src/core/compaction/index.ts";
import type { PruneBlock } from "../src/core/prune.ts";

const { completeSimpleMock } = vi.hoisted(() => ({
	completeSimpleMock: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-ai/compat")>();
	return {
		...actual,
		completeSimple: completeSimpleMock,
	};
});

function createModel(
	reasoning: boolean,
	maxTokens = 8192,
	compat?: Model<"anthropic-messages">["compat"],
): Model<"anthropic-messages"> {
	return {
		id: reasoning ? "reasoning-model" : "non-reasoning-model",
		name: reasoning ? "Reasoning Model" : "Non-reasoning Model",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		reasoning,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens,
		...(compat ? { compat } : {}),
	};
}

const mockSummaryResponse: AssistantMessage = {
	role: "assistant",
	content: [{ type: "text", text: "## Goal\nTest summary" }],
	api: "anthropic-messages",
	provider: "anthropic",
	model: "claude-sonnet-4-5",
	usage: {
		input: 10,
		output: 10,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 20,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
	stopReason: "stop",
	timestamp: Date.now(),
};

const mockToolCallResponse: AssistantMessage = {
	...mockSummaryResponse,
	content: [{ type: "toolCall", id: "tool-call-1", name: "read", arguments: { path: "README.md" } }],
	stopReason: "toolUse",
};

const messages: AgentMessage[] = [{ role: "user", content: "Summarize this.", timestamp: Date.now() }];
function userBlock(content: string): PruneBlock {
	return {
		entryIds: ["user-1"],
		entries: [
			{
				type: "message",
				id: "user-1",
				parentId: null,
				timestamp: new Date().toISOString(),
				message: { role: "user", content, timestamp: Date.now() },
			},
		],
	};
}

const block = userBlock(
	"Keep the original user requirement and the concrete result in the replacement summary. ".repeat(8),
);

describe("generateSummary reasoning options", () => {
	beforeEach(() => {
		completeSimpleMock.mockReset();
		completeSimpleMock.mockResolvedValue(mockSummaryResponse);
	});

	it("uses the provided thinking level for reasoning-capable models", async () => {
		const result = await generateSummaryWithUsage(
			messages,
			createModel(true),
			2000,
			"test-key",
			undefined,
			undefined,
			undefined,
			undefined,
			"medium",
		);

		expect(result.text).toBe("## Goal\nTest summary");
		expect(result.usage).toEqual(mockSummaryResponse.usage);

		expect(completeSimpleMock).toHaveBeenCalledTimes(1);
		expect(completeSimpleMock.mock.calls[0][2]).toMatchObject({
			reasoning: "medium",
			apiKey: "test-key",
		});
	});

	it("preserves the string result from generateSummary", async () => {
		await expect(generateSummary(messages, createModel(false), 2000, "test-key")).resolves.toBe(
			"## Goal\nTest summary",
		);
	});

	it("uses fresh routing sessions without prompt caching", async () => {
		await generateSummary(messages, createModel(false), 2000, "test-key");
		await generateSummary(messages, createModel(false), 2000, "test-key");

		const requestOptions = completeSimpleMock.mock.calls.map((call) => call[2]);
		expect(requestOptions).toHaveLength(2);
		expect(requestOptions.every((options) => options?.cacheRetention === "none")).toBe(true);

		const sessionIds = requestOptions.map((options) => options?.sessionId);
		expect(sessionIds[0]).not.toBe(sessionIds[1]);
	});

	it("honors caller-supplied routing session and tool choice without prompt caching", async () => {
		await completeSummarization(createModel(false), normalizeContext({ systemPrompt: "Summarize", messages: [] }), {
			sessionId: "current-routing-session",
			cacheRetention: "long",
			toolChoice: "auto",
		});

		expect(completeSimpleMock.mock.calls[0][2]).toMatchObject({
			sessionId: "current-routing-session",
			cacheRetention: "none",
			toolChoice: "auto",
		});
	});

	it("preserves the previous summary without an empty history request for a split turn", async () => {
		const preparation: CompactionPreparation = {
			firstKeptEntryId: "entry-keep",
			messagesToSummarize: [],
			turnPrefixMessages: messages,
			isSplitTurn: true,
			tokensBefore: 100,
			previousSummary: "previous checkpoint",
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 2000, keepRecentTokens: 20 },
		};

		const result = await compact(preparation, createModel(false), "test-key");

		expect(completeSimpleMock).toHaveBeenCalledTimes(1);
		expect(result.summary).toContain("previous checkpoint");
		const requestContext = completeSimpleMock.mock.calls[0][1] as TranscriptContext;
		const prompt = JSON.stringify(requestContext.messages);
		// Regression test for #9652: clear boundaries and continuation wording avoid the reasoning-extraction false positive.
		expect(prompt).toContain("# Conversation\\n[User]: Summarize this.");
		expect(prompt).toContain("# Instructions\\nThe messages above are earlier context from an ongoing conversation.");
	});

	it("rejects tool calls from conversation summaries", async () => {
		completeSimpleMock.mockResolvedValueOnce(mockToolCallResponse);

		await expect(generateSummaryWithUsage(messages, createModel(false), 2000, "test-key")).rejects.toThrow(
			"Summarization attempted to call a tool",
		);
	});

	it("rejects tool calls from split-turn summaries", async () => {
		completeSimpleMock.mockResolvedValueOnce(mockToolCallResponse);
		const preparation: CompactionPreparation = {
			firstKeptEntryId: "entry-keep",
			messagesToSummarize: [],
			turnPrefixMessages: messages,
			isSplitTurn: true,
			tokensBefore: 100,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 2000, keepRecentTokens: 20 },
		};

		await expect(compact(preparation, createModel(false), "test-key")).rejects.toThrow(
			"Turn prefix summarization attempted to call a tool",
		);
	});

	it("rejects a length-limited history summary", async () => {
		completeSimpleMock.mockResolvedValueOnce({
			...mockSummaryResponse,
			stopReason: "length",
			content: [{ type: "text", text: "partial" }],
		});

		await expect(generateSummaryWithUsage(messages, createModel(false), 2000, "test-key")).rejects.toThrow(
			"generation hit the token cap",
		);
	});

	it("rejects a length-limited split-turn summary", async () => {
		completeSimpleMock.mockResolvedValueOnce({
			...mockSummaryResponse,
			stopReason: "length",
			content: [{ type: "text", text: "partial" }],
		});
		const preparation: CompactionPreparation = {
			firstKeptEntryId: "entry-keep",
			messagesToSummarize: [],
			turnPrefixMessages: messages,
			isSplitTurn: true,
			tokensBefore: 100,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 2000, keepRecentTokens: 20 },
		};

		await expect(compact(preparation, createModel(false), "test-key")).rejects.toThrow(
			"generation hit the token cap",
		);
	});

	it("allows reasoning up to the model output cap while keeping a short final summary", async () => {
		completeSimpleMock.mockResolvedValueOnce({
			...mockSummaryResponse,
			content: [
				{ type: "thinking", thinking: "Long reasoning" },
				{ type: "text", text: "## Goal\nTest summary" },
			],
			usage: { ...mockSummaryResponse.usage, output: 7800, reasoning: 7750 },
		});

		await expect(summarizeBlock({ block, model: createModel(true) })).resolves.toBe("## Goal\nTest summary");
		expect(completeSimpleMock.mock.calls[0][2]).toMatchObject({ maxTokens: 8192 });
	});

	it("clamps the block summary generation budget to the model output cap", async () => {
		await summarizeBlock({ block, model: createModel(false, 2048) });
		expect(completeSimpleMock.mock.calls[0][2]).toMatchObject({ maxTokens: 2048 });
	});

	it("reserves context headroom when a block nearly fills the model window", async () => {
		await summarizeBlock({ block, model: { ...createModel(true), contextWindow: 4000 } });
		expect(completeSimpleMock.mock.calls[0][2].maxTokens).toBeLessThan(8192);
		expect(completeSimpleMock.mock.calls[0][2].maxTokens).toBeGreaterThan(0);
	});

	it("rejects a block that cannot fit before calling the model", async () => {
		await expect(
			summarizeBlock({ block: userBlock("x".repeat(16000)), model: { ...createModel(true), contextWindow: 4000 } }),
		).rejects.toThrow("Block is too large to summarize within the model's context window");
		expect(completeSimpleMock).not.toHaveBeenCalled();
	});

	it("accepts a summary of up to 128 estimated tokens for a short block", async () => {
		const summary = "x".repeat(512);
		completeSimpleMock.mockResolvedValueOnce({
			...mockSummaryResponse,
			content: [{ type: "text", text: summary }],
		});

		await expect(summarizeBlock({ block: userBlock("Short note."), model: createModel(true) })).resolves.toBe(
			summary,
		);
	});

	it("rejects a final summary longer than half of a large original block", async () => {
		completeSimpleMock.mockResolvedValueOnce({
			...mockSummaryResponse,
			content: [{ type: "text", text: "Verbose replacement detail. ".repeat(120) }],
		});

		await expect(summarizeBlock({ block: userBlock("x".repeat(4000)), model: createModel(true) })).rejects.toThrow(
			/Block summary exceeds ~500 allowed text tokens: ~840 summary tokens for ~1000 original block tokens/,
		);
	});

	it("reports the token cap and response metadata when block summarization runs out of tokens", async () => {
		completeSimpleMock.mockResolvedValueOnce({
			...mockSummaryResponse,
			stopReason: "length",
			content: [{ type: "thinking", thinking: "Only reasoning was generated." }],
			usage: { ...mockSummaryResponse.usage, output: 8192, reasoning: 8192 },
		});

		await expect(summarizeBlock({ block, model: createModel(true) })).rejects.toThrow(
			/generation hit the token cap.*stopReason=length.*outputTokens=8192.*reasoningTokens=8192.*contentTypes=thinking/,
		);
	});

	it("reports response metadata when block summarization returns only reasoning", async () => {
		completeSimpleMock.mockResolvedValueOnce({
			...mockSummaryResponse,
			content: [{ type: "thinking", thinking: "Only reasoning was generated." }],
			usage: { ...mockSummaryResponse.usage, output: 42 },
		});

		await expect(summarizeBlock({ block, model: createModel(true) })).rejects.toThrow(
			/returned no text.*stopReason=stop.*outputTokens=42.*contentTypes=thinking/,
		);
	});

	it("does not set reasoning when thinking is off", async () => {
		await generateSummary(
			messages,
			createModel(true),
			2000,
			"test-key",
			undefined,
			undefined,
			undefined,
			undefined,
			"off",
		);

		expect(completeSimpleMock).toHaveBeenCalledTimes(1);
		expect(completeSimpleMock.mock.calls[0][2]).toMatchObject({
			apiKey: "test-key",
		});
		expect(completeSimpleMock.mock.calls[0][2]).not.toHaveProperty("reasoning");
	});

	it("does not set reasoning for non-reasoning models", async () => {
		await generateSummary(
			messages,
			createModel(false),
			2000,
			"test-key",
			undefined,
			undefined,
			undefined,
			undefined,
			"medium",
		);

		expect(completeSimpleMock).toHaveBeenCalledTimes(1);
		expect(completeSimpleMock.mock.calls[0][2]).toMatchObject({
			apiKey: "test-key",
		});
		expect(completeSimpleMock.mock.calls[0][2]).not.toHaveProperty("reasoning");
	});

	it("leaves Anthropic refusal fallback handling to pi-ai model metadata", async () => {
		await generateSummary(
			messages,
			createModel(true, 8192, {
				allowedFallbackModels: [
					{
						provider: "anthropic",
						model: "claude-opus-4-8",
						cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
					},
				],
			}),
			2000,
			"test-key",
		);

		expect(completeSimpleMock).toHaveBeenCalledTimes(1);
		expect(completeSimpleMock.mock.calls[0][2]).not.toHaveProperty("refusalFallbacks");
	});

	it("does not set Anthropic refusal fallback for models without allowed fallback targets", async () => {
		await generateSummary(messages, createModel(true), 2000, "test-key");

		expect(completeSimpleMock).toHaveBeenCalledTimes(1);
		expect(completeSimpleMock.mock.calls[0][2]).not.toHaveProperty("refusalFallbacks");
	});

	it("clamps compaction summary maxTokens to the model output cap", async () => {
		const preparation: CompactionPreparation = {
			firstKeptEntryId: "entry-keep",
			messagesToSummarize: messages,
			turnPrefixMessages: messages,
			isSplitTurn: true,
			tokensBefore: 600000,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 500000, keepRecentTokens: 20000 },
		};

		const result = await compact(preparation, createModel(false, 128000), "test-key");

		expect(result.usage).toEqual({
			...mockSummaryResponse.usage,
			input: 20,
			output: 20,
			totalTokens: 40,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		});
		expect(completeSimpleMock.mock.calls.map((call) => call[2]?.maxTokens)).toEqual([128000, 128000]);
	});
});
