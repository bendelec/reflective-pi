import { Box, Spacer, Text } from "@earendil-works/pi-tui";
import { CONTEXT_STATUS_TAG, type ContextStatusMessage } from "../../../core/messages.ts";
import { theme } from "../theme/theme.ts";

/**
 * Component that renders a context-status message as a single highlighted line.
 * Uses the accent color below 70% usage and the warning color at 70% and above.
 */
export class ContextStatusMessageComponent extends Box {
	private message: ContextStatusMessage;

	constructor(message: ContextStatusMessage) {
		super(1, 1, (t) => theme.bg("customMessageBg", t));
		this.message = message;
		this.updateDisplay();
	}

	override invalidate(): void {
		super.invalidate();
		this.updateDisplay();
	}

	private updateDisplay(): void {
		this.clear();

		const highlight = this.message.percent >= 70 ? "warning" : "accent";
		const label = theme.fg("customMessageLabel", `\x1b[1m${CONTEXT_STATUS_TAG}\x1b[22m`);
		this.addChild(new Text(label, 0, 0));
		this.addChild(new Spacer(1));

		const rest = this.message.content.startsWith(CONTEXT_STATUS_TAG)
			? this.message.content.slice(CONTEXT_STATUS_TAG.length).trimStart()
			: this.message.content;
		this.addChild(new Text(theme.fg(highlight, rest), 0, 0));
	}
}
