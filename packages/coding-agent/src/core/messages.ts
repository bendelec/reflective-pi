/**
 * Custom message types and transformers for the coding agent.
 *
 * Extends the base AgentMessage type with coding-agent specific message types,
 * and provides a transformer to convert them to LLM-compatible messages.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, Message, TextContent } from "@earendil-works/pi-ai";

export const COMPACTION_SUMMARY_PREFIX = `The conversation history before this point was compacted into the following summary:

<summary>
`;

export const COMPACTION_SUMMARY_SUFFIX = `
</summary>`;

export const BRANCH_SUMMARY_PREFIX = `The following is a summary of a branch that this conversation came back from:

<summary>
`;

export const BRANCH_SUMMARY_SUFFIX = `</summary>`;

/**
 * Message type for bash executions via the ! command.
 */
export interface BashExecutionMessage {
	role: "bashExecution";
	command: string;
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
	timestamp: number;
	/** If true, this message is excluded from LLM context (!! prefix) */
	excludeFromContext?: boolean;
}

/**
 * Message type for extension-injected messages via sendMessage().
 * These are custom messages that extensions can inject into the conversation.
 */
export interface CustomMessage<T = unknown> {
	role: "custom";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	display: boolean;
	details?: T;
	timestamp: number;
}

export interface BranchSummaryMessage {
	role: "branchSummary";
	summary: string;
	fromId: string;
	timestamp: number;
}

export interface CompactionSummaryMessage {
	role: "compactionSummary";
	summary: string;
	tokensBefore: number;
	timestamp: number;
}

/**
 * System-generated context status note injected between turns.
 *
 * Sent to the model as a user message and persisted to the transcript like any
 * normal message. Only the most recent one is authoritative; earlier ones are
 * superseded by the newest (see the system prompt).
 */
export interface ContextStatusMessage {
	role: "contextStatus";
	/** Text sent to the model and shown in the TUI; high-pressure notes add a hygiene instruction. */
	content: string;
	/** Context usage percentage (0-100), used to pick the TUI highlight color. */
	percent: number;
	timestamp: number;
}

// Extend CustomAgentMessages via declaration merging
declare module "@earendil-works/pi-agent-core" {
	interface CustomAgentMessages {
		bashExecution: BashExecutionMessage;
		custom: CustomMessage;
		branchSummary: BranchSummaryMessage;
		compactionSummary: CompactionSummaryMessage;
		contextStatus: ContextStatusMessage;
	}
}

/**
 * Convert a BashExecutionMessage to user message text for LLM context.
 */
export function bashExecutionToText(msg: BashExecutionMessage): string {
	let text = `Ran \`${msg.command}\`\n`;
	if (msg.output) {
		text += `\`\`\`\n${msg.output}\n\`\`\``;
	} else {
		text += "(no output)";
	}
	if (msg.cancelled) {
		text += "\n\n(command cancelled)";
	} else if (msg.exitCode !== null && msg.exitCode !== undefined && msg.exitCode !== 0) {
		text += `\n\nCommand exited with code ${msg.exitCode}`;
	}
	if (msg.truncated && msg.fullOutputPath) {
		text += `\n\n[Output truncated. Full output: ${msg.fullOutputPath}]`;
	}
	return text;
}

export function createBranchSummaryMessage(summary: string, fromId: string, timestamp: string): BranchSummaryMessage {
	return {
		role: "branchSummary",
		summary,
		fromId,
		timestamp: new Date(timestamp).getTime(),
	};
}

export function createCompactionSummaryMessage(
	summary: string,
	tokensBefore: number,
	timestamp: string,
): CompactionSummaryMessage {
	return {
		role: "compactionSummary",
		summary: summary,
		tokensBefore,
		timestamp: new Date(timestamp).getTime(),
	};
}

/** Convert CustomMessageEntry to AgentMessage format */
export function createCustomMessage(
	customType: string,
	content: string | (TextContent | ImageContent)[],
	display: boolean,
	details: unknown | undefined,
	timestamp: string,
): CustomMessage {
	return {
		role: "custom",
		customType,
		content,
		display,
		details,
		timestamp: new Date(timestamp).getTime(),
	};
}

export const CONTEXT_STATUS_TAG = "[context-status]";
export const CONTEXT_HYGIENE_CHECK_REQUIRED =
	"CONTEXT HYGIENE CHECK REQUIRED: Before continuing substantive work, call list_context to review the current blocks, assess them against the planned next steps, and exclude every block that no longer adds value with prune_context. Do not wait for automatic compaction.";

/**
 * Percent at which a context-status message carries the explicit hygiene
 * instruction. Derived from the auto-compaction trigger line
 * (contextWindow - reserveTokens) so the nudge always precedes compaction
 * for any reserveTokens: five points below the line, clamped to [50, 80].
 * With compaction disabled there is no line to precede and the historical
 * 80% applies.
 */
export function contextHygieneThresholdPercent(
	contextWindow: number,
	reserveTokens: number,
	compactionEnabled: boolean,
): number {
	if (!compactionEnabled || contextWindow <= 0) return 80;
	const linePercent = (1 - reserveTokens / contextWindow) * 100;
	return Math.max(50, Math.min(80, linePercent - 5));
}

/** Format a context status line: `[context-status] window 128,000 · used 45,230 (35.3%)`. */
export function formatContextStatus(contextWindow: number, used: number, percent: number): string {
	return `${CONTEXT_STATUS_TAG} window ${contextWindow.toLocaleString("en-US")} · used ${used.toLocaleString("en-US")} (${percent.toFixed(1)}%)`;
}

export function createContextStatusMessage(
	contextWindow: number,
	used: number,
	percent: number,
	timestamp: number,
	requireHygieneCheck = false,
): ContextStatusMessage {
	return {
		role: "contextStatus",
		content: requireHygieneCheck
			? `${formatContextStatus(contextWindow, used, percent)}\n\n${CONTEXT_HYGIENE_CHECK_REQUIRED}`
			: formatContextStatus(contextWindow, used, percent),
		percent,
		timestamp,
	};
}

/**
 * Transform AgentMessages (including custom types) to LLM-compatible Messages.
 *
 * This is used by:
 * - Agent's transormToLlm option (for prompt calls and queued messages)
 * - Compaction's generateSummary (for summarization)
 * - Custom extensions and tools
 */
export function convertToLlm(messages: AgentMessage[]): Message[] {
	return messages
		.map((m): Message | undefined => {
			switch (m.role) {
				case "bashExecution":
					// Skip messages excluded from context (!! prefix)
					if (m.excludeFromContext) {
						return undefined;
					}
					return {
						role: "user",
						content: [{ type: "text", text: bashExecutionToText(m) }],
						timestamp: m.timestamp,
					};
				case "custom": {
					const content = typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content;
					return {
						role: "user",
						content,
						timestamp: m.timestamp,
					};
				}
				case "branchSummary":
					return {
						role: "user",
						content: [{ type: "text" as const, text: BRANCH_SUMMARY_PREFIX + m.summary + BRANCH_SUMMARY_SUFFIX }],
						timestamp: m.timestamp,
					};
				case "compactionSummary":
					return {
						role: "user",
						content: [
							{ type: "text" as const, text: COMPACTION_SUMMARY_PREFIX + m.summary + COMPACTION_SUMMARY_SUFFIX },
						],
						timestamp: m.timestamp,
					};
				case "contextStatus":
					return {
						role: "user",
						content: [{ type: "text" as const, text: m.content }],
						timestamp: m.timestamp,
					};
				case "user":
				case "assistant":
				case "toolResult":
					return m;
				default:
					// biome-ignore lint/correctness/noSwitchDeclarations: fine
					const _exhaustiveCheck: never = m;
					return undefined;
			}
		})
		.filter((m) => m !== undefined);
}
