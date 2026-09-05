import { resolve as resolveNodePath } from "node:path";
import type { PruneBlock } from "./prune.ts";

/**
 * Post-prune re-acquisition accounting.
 *
 * Over-pruning is invisible to the model: re-reading freshly excluded content
 * feels like diligence, and nothing prices the margin. This state machine
 * prices it. After each prune it records the file paths whose content lived
 * in the excluded blocks and watches the following turns for reads or edits
 * targeting those paths. It produces two verdicts:
 *
 * - negative: excluded material was re-acquired inside the window. Emitted
 *   early when the re-acquisition is heavy (the cause-effect link is clearest
 *   when the delay is shortest), otherwise at window close with totals.
 * - positive: a full window with zero re-acquisition. The working-set
 *   selection held. Without this arm, cost-only feedback teaches "prune
 *   less" instead of "prune correctly".
 *
 * Re-acquisition is reads only. A blind edit that succeeds is context
 * economy, not over-prune cost; one that fails forces a read, which this
 * signal already captures. The ledger side records both reads and edits
 * from the excluded blocks: a file the model edited is still working-set
 * material, and a later read of it is genuine re-acquisition.
 *
 * Re-acquisition after the window closes is not counted: a read many turns
 * later is not clearly attributable to the prune.
 */
export const PRUNE_ACCOUNTING_WINDOW_TURNS = 15;
const EARLY_FILE_THRESHOLD = 3;
const EARLY_CHAR_THRESHOLD = 5000;

export interface PruneAccountingVerdict {
	kind: "negative" | "positive";
	/** Blocks excluded by the prune being reported. */
	prunedBlocks: number;
	/** Files re-acquired inside the window (negative only). */
	files: string[];
	/** Characters re-ingested via re-acquisition (negative only). */
	chars: number;
	/** Turns elapsed since the prune at verdict time. */
	turns: number;
}

interface ActiveWindow {
	prunedBlocks: number;
	paths: Set<string>;
	files: string[];
	chars: number;
	turns: number;
	/** The turn that contained the prune itself does not count toward the window. */
	skipNextTurnEnd: boolean;
}

/** Extract the read/edit target paths (the touched files) from excluded prune blocks. */
function extractPaths(blocks: readonly PruneBlock[], resolve: (p: string) => string): Set<string> {
	const paths = new Set<string>();
	for (const block of blocks) {
		for (const entry of block.entries) {
			if (entry.type !== "message") continue;
			const message = entry.message;
			if (message.role !== "assistant") continue;
			for (const part of message.content) {
				if (part.type !== "toolCall") continue;
				if (part.name !== "read" && part.name !== "edit") continue;
				const path = (part.arguments as { path?: unknown })?.path;
				if (typeof path === "string" && path.length > 0) paths.add(resolve(path));
			}
		}
	}
	return paths;
}

export class PruneAccounting {
	private window: ActiveWindow | undefined;
	private readonly resolve: (p: string) => string;

	constructor(cwd: string) {
		this.resolve = (p) => {
			try {
				return resolveNodePath(cwd, p);
			} catch {
				return p;
			}
		};
	}

	/**
	 * Open a window for a just-executed prune. A still-open previous window is
	 * closed by this prune: its verdict is returned if re-acquisition evidence
	 * already accumulated, and discarded otherwise (a window cut short is not
	 * evidence of a good prune).
	 */
	onPrune(blocks: readonly PruneBlock[]): PruneAccountingVerdict | undefined {
		const carried = this.closeWindow();
		this.window = {
			prunedBlocks: blocks.length,
			paths: extractPaths(blocks, this.resolve),
			files: [],
			chars: 0,
			turns: 0,
			skipNextTurnEnd: true,
		};
		return carried;
	}

	/** Record a read execution from the turn that just finished. Edits are not
	 * re-acquisition: a successful blind edit is context economy, and a failed
	 * one forces a read that this signal captures on its own. */
	onToolUse(name: string, path: string, outputChars: number): void {
		const w = this.window;
		if (!w) return;
		if (name !== "read") return;
		if (!w.paths.has(this.resolve(path))) return;
		if (!w.files.includes(path)) w.files.push(path);
		w.chars += outputChars;
	}

	/** Advance the window; return a verdict when one is due. */
	onTurnEnd(): PruneAccountingVerdict | undefined {
		const w = this.window;
		if (!w) return undefined;
		if (w.skipNextTurnEnd) {
			w.skipNextTurnEnd = false;
			return undefined;
		}
		w.turns++;
		if (w.files.length >= EARLY_FILE_THRESHOLD || w.chars >= EARLY_CHAR_THRESHOLD) {
			return this.closeWindow();
		}
		if (w.turns >= PRUNE_ACCOUNTING_WINDOW_TURNS) {
			const verdict: PruneAccountingVerdict = {
				kind: w.files.length > 0 ? "negative" : "positive",
				prunedBlocks: w.prunedBlocks,
				files: [...w.files],
				chars: w.chars,
				turns: w.turns,
			};
			this.window = undefined;
			return verdict;
		}
		return undefined;
	}

	private closeWindow(): PruneAccountingVerdict | undefined {
		const w = this.window;
		this.window = undefined;
		if (!w || w.files.length === 0) return undefined;
		return {
			kind: "negative",
			prunedBlocks: w.prunedBlocks,
			files: [...w.files],
			chars: w.chars,
			turns: w.turns,
		};
	}
}

/** Format a verdict as the injected `[prune-accounting]` message text. */
export function formatPruneAccountingVerdict(verdict: PruneAccountingVerdict): string {
	if (verdict.kind === "positive") {
		return `[prune-accounting] ${verdict.turns} turns after pruning ${verdict.prunedBlocks} block(s), no excluded file was re-read or edited. The working-set selection held.`;
	}
	const files = verdict.files.map((f) => `${f}`).join(", ");
	const chars = verdict.chars.toLocaleString("en-US");
	return `[prune-accounting] ${verdict.turns} turn(s) after pruning ${verdict.prunedBlocks} block(s), ${verdict.files.length} file(s) whose content was excluded were re-read (~${chars} characters re-ingested): ${files}. The prune removed material that remained in active use.`;
}
