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
	private initialStates: PruneState[];
	private stagedStates: PruneState[];
	private selectedIndex = 0;
	private showAll = false;
	private maxVisible: number;

	public onCommit?: (changes: PruneChange[]) => void;
	public onCancel?: () => void;

	constructor(blocks: PruneBlock[], previews: BlockPreview[], states: PruneState[], maxVisible: number) {
		this.blocks = blocks;
		this.previews = previews;
		this.initialStates = [...states];
		this.stagedStates = [...states];
		this.maxVisible = maxVisible;
		// Start cursor on the newest (last) visible item
		const visible = this.visibleIndices();
		if (visible.length > 0) {
			this.selectedIndex = visible.length - 1;
		}
	}

	private visibleIndices(): number[] {
		return this.blocks
			.map((_, index) => index)
			.filter((index) => this.showAll || this.initialStates[index] === "included");
	}

	private pendingCount(): number {
		let count = 0;
		for (let i = 0; i < this.blocks.length; i++) {
			if (this.stagedStates[i] !== this.initialStates[i]) count++;
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
			const state = this.stagedStates[blockIndex]!;
			const isHidden = state !== "included";
			const isChanged = state !== this.initialStates[blockIndex];

			const cursor = isSelected ? theme.fg("accent", "› ") : "  ";
			const stateLabel = state === "excluded" ? " [pruned]" : state === "summarized" ? " [summarized]" : "";
			const suffix = `${stateLabel}${isChanged ? " *" : ""}`;
			let line = `${cursor}${preview.line}${suffix}`;
			if (isSelected) {
				line = theme.bold(line);
			} else if (isHidden) {
				line = theme.fg("muted", line);
			}
			lines.push(truncateToWidth(line, width));

			for (const detail of preview.detail) {
				const detailLine = `     ${detail}`;
				lines.push(truncateToWidth(isHidden ? theme.fg("muted", detailLine) : detailLine, width));
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
				this.stagedStates[blockIndex] = this.stagedStates[blockIndex] === "included" ? "excluded" : "included";
			}
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			const changes: PruneChange[] = [];
			for (let i = 0; i < this.blocks.length; i++) {
				if (this.stagedStates[i] !== this.initialStates[i]) {
					changes.push({
						block: this.blocks[i]!,
						state: this.stagedStates[i]!,
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
		const states = blocks.map((block) => {
			const state = getPruneState(block.entryIds[0]!);
			return state && block.entryIds.every((id) => getPruneState(id) === state) ? state : "included";
		});
		const maxVisible = Math.max(5, Math.floor(terminalHeight / 2));

		this.pruneList = new PruneList(blocks, previews, states, maxVisible);
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
