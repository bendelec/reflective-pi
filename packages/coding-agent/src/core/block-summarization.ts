import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";
import { contentText, type RetryPolicy } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai/compat";
import { completeSummarization } from "./compaction/compaction.ts";
import { serializeConversation } from "./compaction/utils.ts";
import { convertToLlm } from "./messages.ts";
import type { PruneBlock } from "./prune.ts";
import { sessionEntryToContextMessages } from "./session-manager.ts";

const BLOCK_SUMMARY_SYSTEM_PROMPT = `You create a concise factual replacement for one prior context block in an agent session.

Preserve decisions, concrete results, file paths, identifiers, commands, errors, and unfinished work that may matter later. Omit routine tool noise, superseded intermediate work, and reasoning that no longer changes future decisions. Do not continue the task, give advice, or call tools. Return only the replacement summary.`;

const MAX_BLOCK_SUMMARY_TOKENS = 1024;

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

	const conversation = serializeConversation(convertToLlm(messages));
	const response = await completeSummarization(
		request.model,
		{
			systemPrompt: BLOCK_SUMMARY_SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: `<context-block>\n${conversation}\n</context-block>` }],
					timestamp: Date.now(),
				},
			],
		},
		{
			maxTokens: Math.min(MAX_BLOCK_SUMMARY_TOKENS, request.model.maxTokens || MAX_BLOCK_SUMMARY_TOKENS),
			apiKey: request.apiKey,
			headers: request.headers,
			env: request.env,
			signal: request.signal,
		},
		request.streamFn,
		request.retry,
	);

	if (response.stopReason === "error") {
		throw new Error(`Block summarization failed: ${response.errorMessage || "Unknown error"}`);
	}
	if (response.content.some((part) => part.type === "toolCall")) {
		throw new Error("Block summarization attempted to call a tool");
	}

	const summary = contentText(response.content).trim();
	if (!summary) {
		throw new Error("Block summarization returned no text");
	}
	return summary;
}
