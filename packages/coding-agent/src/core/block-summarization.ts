import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";
import { contentText, normalizeContext, type RetryPolicy } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai/compat";
import { estimateMessageTokens, estimateTextTokens } from "@earendil-works/pi-ai/utils/estimate";
import { completeSummarization, getSummarizationFailure } from "./compaction/compaction.ts";
import { serializeConversation } from "./compaction/utils.ts";
import { convertToLlm } from "./messages.ts";
import type { PruneBlock } from "./prune.ts";
import { sessionEntryToContextMessages } from "./session-manager.ts";

const BLOCK_SUMMARY_SYSTEM_PROMPT = `You create a concise factual replacement for one prior context block in an agent session.

Preserve decisions, concrete results, file paths, identifiers, commands, errors, and unfinished work that may matter later. Omit routine tool noise, superseded intermediate work, and reasoning that no longer changes future decisions. Do not continue the task, give advice, or call tools. Keep the replacement summary within half the length of the original block, or 128 tokens for a short block. Return only the replacement summary.`;

const MAX_BLOCK_SUMMARY_RATIO = 0.5;
const MIN_BLOCK_SUMMARY_TOKENS = 128;

function getBlockMessages(block: PruneBlock): AgentMessage[] {
	return block.entries.flatMap(sessionEntryToContextMessages);
}

export interface BlockSummarizationRequest {
	block: PruneBlock;
	model: Model<any>;
	apiKey?: string;
	headers?: Record<string, string>;
	env?: Record<string, string>;
	signal?: AbortSignal;
	streamFn?: StreamFn;
	retry?: RetryPolicy;
}

/** Summarize one atomic context block without changing session state. */
export async function summarizeBlock(request: BlockSummarizationRequest): Promise<string> {
	const messages = getBlockMessages(request.block);
	if (messages.length === 0) {
		throw new Error("Cannot summarize a block with no context messages");
	}

	const llmMessages = convertToLlm(messages);
	const originalTokens = llmMessages.reduce((total, message) => total + estimateMessageTokens(message), 0);
	const conversation = serializeConversation(llmMessages);
	const promptText = `<context-block>\n${conversation}\n</context-block>`;
	const estimatedInputTokens = estimateTextTokens(BLOCK_SUMMARY_SYSTEM_PROMPT) + estimateTextTokens(promptText);
	// Reserve output room without making small-window models unusable: the 2048 floor is
	// capped at 20% of the window, and never below 10% of it.
	const contextReserve = Math.max(
		Math.min(2048, Math.floor(request.model.contextWindow * 0.2)),
		Math.floor(request.model.contextWindow * 0.1),
	);
	const availableOutputTokens = request.model.contextWindow - estimatedInputTokens - contextReserve;
	if (availableOutputTokens <= 0) {
		throw new Error("Block is too large to summarize within the model's context window");
	}
	const maxTokens = Math.min(
		request.model.maxTokens > 0 ? request.model.maxTokens : availableOutputTokens,
		availableOutputTokens,
	);
	const response = await completeSummarization(
		request.model,
		normalizeContext({
			systemPrompt: BLOCK_SUMMARY_SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: promptText }],
					timestamp: Date.now(),
				},
			],
		}),
		{
			maxTokens,
			apiKey: request.apiKey,
			headers: request.headers,
			env: request.env,
			signal: request.signal,
		},
		request.streamFn,
		request.retry,
	);

	const responseDetails = `stopReason=${response.stopReason}, outputTokens=${response.usage.output}, reasoningTokens=${response.usage.reasoning ?? "unreported"}, contentTypes=${response.content.map((part) => part.type).join(",") || "none"}`;
	const failure = getSummarizationFailure(response, "Block summarization");
	if (failure) {
		throw new Error(`${failure} (${responseDetails})`);
	}
	if (response.content.some((part) => part.type === "toolCall")) {
		throw new Error("Block summarization attempted to call a tool");
	}

	const summary = contentText(response.content).trim();
	if (!summary) {
		throw new Error(`Block summarization returned no text (${responseDetails})`);
	}
	const summaryTokens = estimateTextTokens(summary);
	const summaryLimit = Math.max(MIN_BLOCK_SUMMARY_TOKENS, Math.floor(originalTokens * MAX_BLOCK_SUMMARY_RATIO));
	if (summaryTokens > summaryLimit) {
		throw new Error(
			`Block summary exceeds ~${summaryLimit} allowed text tokens: ~${summaryTokens} summary tokens for ~${originalTokens} original block tokens`,
		);
	}
	return summary;
}
