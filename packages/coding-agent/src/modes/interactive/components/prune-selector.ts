import {
	type Component,
	Container,
	type Focusable,
	getKeybindings,
	Spacer,
	Text,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import { type BlockPreview, type PruneBlock, previewBlock } from "../../../core/prune.ts";
import type { PruneState } from "../../../core/session-manager.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint } from "./keybinding-hints.ts";

/** A staged prune change: the block and the new state to apply on commit. */
export interface PruneChange {
	block: PruneBlock;
	state: PruneState;
}

/**
 * Linear list of atomic prune blocks.
 *
 * Space toggles the selected block's state locally (staged). Enter commits all
 * staged changes and closes; Escape/Ctrl-C aborts without committing.
 */
class PruneList implements Component {
	private blocks: PruneBlock[];
	private previews: BlockPreview[];
	private initialPruned: boolean[];
	private stagedPruned: boolean[];
	private selectedIndex = 0;
	private showAll = false;
	private maxVisible: number;

	public onCommit?: (changes: PruneChange[]) => void;
	public onCancel?: () => void;

	constructor(blocks: PruneBlock[], previews: BlockPreview[], pruned: boolean[], maxVisible: number) {
		this.blocks = blocks;
		this.previews = previews;
		this.initialPruned = [...pruned];
		this.stagedPruned = [...pruned];
		this.maxVisible = maxVisible;
	}

	private visibleIndices(): number[] {
		return this.blocks.map((_, index) => index).filter((index) => this.showAll || !this.initialPruned[index]);
	}

	private pendingCount(): number {
		let count = 0;
		for (let i = 0; i < this.blocks.length; i++) {
			if (this.stagedPruned[i] !== this.initialPruned[i]) count++;
		}
		return count;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const visible = this.visibleIndices();
		if (visible.length === 0) {
			return [truncateToWidth(theme.fg("muted", "  No messages to prune"), width)];
		}

		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), visible.length - this.maxVisible),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, visible.length);

		const lines: string[] = [];
		for (let i = startIndex; i < endIndex; i++) {
			const blockIndex = visible[i]!;
			const preview = this.previews[blockIndex]!;
			const isSelected = i === this.selectedIndex;
			const isPruned = this.stagedPruned[blockIndex]!;
			const isChanged = this.stagedPruned[blockIndex] !== this.initialPruned[blockIndex];

			const cursor = isSelected ? theme.fg("accent", "› ") : "  ";
			const suffix = `${isPruned ? " [pruned]" : ""}${isChanged ? " *" : ""}`;
			let line = `${cursor}${preview.line}${suffix}`;
			if (isSelected) {
				line = theme.bold(line);
			} else if (isPruned) {
				line = theme.fg("muted", line);
			}
			lines.push(truncateToWidth(line, width));

			for (const detail of preview.detail) {
				const detailLine = `     ${detail}`;
				lines.push(truncateToWidth(isPruned ? theme.fg("muted", detailLine) : detailLine, width));
			}
		}

		const pending = this.pendingCount();
		const status = `  (${this.selectedIndex + 1}/${visible.length})${pending > 0 ? ` [${pending} changes]` : ""}${this.showAll ? " [all]" : ""}`;
		lines.push(truncateToWidth(theme.fg("muted", status), width));
		return lines;
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		const visible = this.visibleIndices();
		if (visible.length === 0) {
			if (kb.matches(keyData, "tui.select.cancel")) this.onCancel?.();
			return;
		}
		if (kb.matches(keyData, "tui.select.up")) {
			this.selectedIndex = this.selectedIndex === 0 ? visible.length - 1 : this.selectedIndex - 1;
		} else if (kb.matches(keyData, "tui.select.down")) {
			this.selectedIndex = this.selectedIndex === visible.length - 1 ? 0 : this.selectedIndex + 1;
		} else if (kb.matches(keyData, "app.prune.toggle")) {
			const blockIndex = visible[this.selectedIndex];
			if (blockIndex !== undefined) {
				this.stagedPruned[blockIndex] = !this.stagedPruned[blockIndex];
			}
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			const changes: PruneChange[] = [];
			for (let i = 0; i < this.blocks.length; i++) {
				if (this.stagedPruned[i] !== this.initialPruned[i]) {
					changes.push({
						block: this.blocks[i]!,
						state: this.stagedPruned[i] ? "excluded" : "included",
					});
				}
			}
			this.onCommit?.(changes);
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancel?.();
		} else if (kb.matches(keyData, "app.prune.toggleAll")) {
			this.showAll = !this.showAll;
			this.selectedIndex = 0;
		}
	}
}

class PruneHelp implements Component {
	invalidate(): void {}

	render(width: number): string[] {
		const hints = [
			keyHint("tui.select.up", "move"),
			keyHint("app.prune.toggle", "toggle"),
			keyHint("tui.select.confirm", "save"),
			keyHint("tui.select.cancel", "cancel"),
			keyHint("app.prune.toggleAll", "show all"),
		];
		return [truncateToWidth(`  ${hints.join(" · ")}`, width)];
	}
}

/**
 * Selector for pruning (or restoring) atomic blocks of context messages.
 */
export class PruneSelectorComponent extends Container implements Focusable {
	private pruneList: PruneList;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
	}

	constructor(
		blocks: PruneBlock[],
		getPruneState: (id: string) => PruneState | undefined,
		terminalHeight: number,
		onCommit: (changes: PruneChange[]) => void,
		onCancel: () => void,
	) {
		super();

		const previews = blocks.map((block) => previewBlock(block));
		const pruned = blocks.map((block) => block.entryIds.every((id) => getPruneState(id) === "excluded"));
		const maxVisible = Math.max(5, Math.floor(terminalHeight / 2));

		this.pruneList = new PruneList(blocks, previews, pruned, maxVisible);
		this.pruneList.onCommit = onCommit;
		this.pruneList.onCancel = onCancel;

		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.addChild(new Text(theme.bold("  Prune Context"), 1, 0));
		this.addChild(new PruneHelp());
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(this.pruneList);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	handleInput(keyData: string): void {
		this.pruneList.handleInput(keyData);
	}
}
