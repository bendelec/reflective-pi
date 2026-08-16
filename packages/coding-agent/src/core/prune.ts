import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { contentText, type ToolResultMessage } from "@earendil-works/pi-ai";
import { type SessionEntry, sessionEntryToContextMessages } from "./session-manager.ts";

/** An atomic block of entries that must be pruned together. */
export interface PruneBlock {
	/** Entry ids in this block, in order. */
	entryIds: string[];
	/** The entries themselves, in order. */
	entries: SessionEntry[];
}

/** Rendered preview of a block: the summary line plus indented detail lines. */
export interface BlockPreview {
	/** The single preview line for the block. */
	line: string;
	/** Indented detail lines (tool exchanges only). */
	detail: string[];
}

function hasToolCalls(message: AgentMessage): boolean {
	return message.role === "assistant" && message.content.some((block) => block.type === "toolCall");
}

function isToolExchange(block: PruneBlock): boolean {
	const first = block.entries[0];
	return first?.type === "message" && hasToolCalls(first.message);
}

/**
 * Group context entries into atomic prune blocks.
 *
 * A tool exchange (an assistant message with tool calls plus every
 * immediately-following toolResult answering those calls) is atomic. Every
 * other entry is a block of one. This is the minimal grouping the wire format
 * requires: a toolResult references its assistant's toolCall by id, so the two
 * cannot be pruned independently in either direction.
 */
export function groupPruneBlocks(entries: readonly SessionEntry[]): PruneBlock[] {
	const blocks: PruneBlock[] = [];

	for (const entry of entries) {
		// Skip entries that do not contribute to context (bookkeeping/state).
		if (sessionEntryToContextMessages(entry).length === 0) {
			continue;
		}

		const last = blocks[blocks.length - 1];
		if (
			entry.type === "message" &&
			entry.message.role === "toolResult" &&
			last !== undefined &&
			isToolExchange(last)
		) {
			last.entryIds.push(entry.id);
			last.entries.push(entry);
			continue;
		}
		blocks.push({ entryIds: [entry.id], entries: [entry] });
	}

	return blocks;
}

/** First non-empty, trimmed line of text. */
function firstLine(text: string): string {
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed) return trimmed;
	}
	return "";
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function joinDetail(name: string, target: string, content: string): string {
	let line = name;
	if (target) line += ` ${target}`;
	if (content) line += `: "${content}"`;
	return line;
}

function toolNames(message: AgentMessage): string[] {
	return message.role === "assistant"
		? message.content.filter((block) => block.type === "toolCall").map((block) => block.name)
		: [];
}

function previewLine(entry: SessionEntry | undefined): string {
	if (!entry) return "";
	if (entry.type === "message") {
		const message = entry.message;
		switch (message.role) {
			case "user":
				return `user: ${firstLine(contentText(message.content))}`;
			case "assistant":
				return hasToolCalls(message)
					? `assistant: ${toolNames(message).join(", ")}`
					: `assistant: ${firstLine(contentText(message.content))}`;
			case "toolResult":
				return `tool: ${message.toolName}`;
			case "contextStatus":
				return `context: ${firstLine(message.content)}`;
			case "custom":
				return `custom: ${firstLine(contentText(message.content))}`;
			case "bashExecution":
				return `bash: ${firstLine(message.command)}`;
			default:
				return message.role;
		}
	}
	if (entry.type === "compaction") return `compaction: ${firstLine(entry.summary)}`;
	if (entry.type === "branch_summary") return `branch: ${firstLine(entry.summary)}`;
	if (entry.type === "custom_message") return `custom: ${firstLine(contentText(entry.content))}`;
	return entry.type;
}

/**
 * Detail line for one tool call: `toolName target: "content preview"`.
 *
 * The content preview source is per-tool: read/bash take it from the result
 * (file content / command output), write/edit take it from the arguments (the
 * content being written), because for those the result is just an ack.
 */
function detailLine(name: string, args: Record<string, unknown>, result: ToolResultMessage | undefined): string {
	switch (name) {
		case "read": {
			const target = str(args.path);
			const content = firstLine(contentText(result?.content ?? ""));
			return joinDetail(name, target, content);
		}
		case "write": {
			const target = str(args.path);
			const content = firstLine(str(args.content));
			return joinDetail(name, target, content);
		}
		case "edit": {
			const target = str(args.path);
			const edits = Array.isArray(args.edits) ? args.edits : [];
			const firstNewText = edits.length > 0 ? str((edits[0] as { newText?: unknown }).newText) : "";
			const content = firstLine(firstNewText);
			return joinDetail(name, target, content);
		}
		case "bash": {
			const target = str(args.command);
			const content = firstLine(contentText(result?.content ?? ""));
			return joinDetail(name, target, content);
		}
		default:
			return name;
	}
}

function detailLines(block: PruneBlock): string[] {
	const first = block.entries[0];
	if (first?.type !== "message" || first.message.role !== "assistant") return [];
	const message = first.message;

	const calls = message.content.filter((block) => block.type === "toolCall");
	if (calls.length === 0) return [];

	const results = new Map<string, ToolResultMessage>();
	for (const entry of block.entries.slice(1)) {
		if (entry.type === "message" && entry.message.role === "toolResult") {
			results.set(entry.message.toolCallId, entry.message);
		}
	}

	return calls.map((call) => detailLine(call.name, call.arguments, results.get(call.id)));
}

/** Build the preview (summary line + detail lines) for a prune block. */
export function previewBlock(block: PruneBlock): BlockPreview {
	return {
		line: previewLine(block.entries[0]),
		detail: detailLines(block),
	};
}
