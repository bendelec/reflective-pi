import { performance } from "node:perf_hooks";
import { fauxAssistantMessage } from "../packages/ai/src/providers/faux.ts";
import { AssistantMessageComponent } from "../packages/coding-agent/src/modes/interactive/components/assistant-message.ts";
import { initTheme } from "../packages/coding-agent/src/modes/interactive/theme/theme.ts";
import { Markdown } from "../packages/tui/src/components/markdown.ts";
import { TuiMainScreen } from "../packages/tui/src/tui-main-screen.ts";

// Run with Bun from the repository root. No terminal, provider, network or session file is used.
class DiscardTerminal {
	columns = 120;
	rows = 40;
	bytes = 0;
	get kittyProtocolActive() { return false; }
	start() {}
	stop() {}
	async drainInput() {}
	write(text) { this.bytes += text.length; }
	moveBy() {}
	hideCursor() {}
	showCursor() {}
	clearLine() {}
	clearFromCursor() {}
	clearScreen() {}
	setTitle() {}
	setProgress() {}
}

initTheme("dark", false);
const staticFrame = process.argv.includes("--static");
const distinctHistory = process.argv.includes("--distinct");
const paragraph = "A representative paragraph with **bold text**, `inline code`, and a [link](https://example.com). Some useful explanation of implementation details and correctness.\n\n";
const historyText = `## Previous result\n\n${paragraph.repeat(6)}\`\`\`ts\nconst ready = true;\n\`\`\`\n`;
const terminal = new DiscardTerminal();
const tui = new TuiMainScreen(terminal, false);
const historyCount = 300;
const textLength = 20000;
for (let i = 0; i < historyCount; i++) {
	const text = distinctHistory ? historyText.replace(/\b(?:a|the|with|and|Some)\b/g, (word) => `${word}${i}`) : historyText;
	tui.addChild(new AssistantMessageComponent(fauxAssistantMessage(text)));
}
const message = fauxAssistantMessage(paragraph.repeat(Math.ceil(textLength / paragraph.length)).slice(0, textLength));
const active = new AssistantMessageComponent(message);
tui.addChild(active);
// Fail rather than accidentally compare source components against stale dist Markdown through package aliases.
if (!active.children[0]?.children.some((child) => child instanceof Markdown)) {
	throw new Error("Mixed source/dist modules: run Bun from the repo root with --tsconfig-override ./tsconfig.json");
}
tui.renderNow();
for (let i = 0; i < 5; i++) {
	message.content[0].text += " update ";
	active.updateContent(message, true);
	tui.renderNow();
}
const frames = 150;
const intervalMs = 40;
let updateMs = 0;
let renderMs = 0;
const wallStart = performance.now();
const cpuStart = process.cpuUsage();
const bytesStart = terminal.bytes;
for (let i = 0; i < frames; i++) {
	if (!staticFrame) message.content[0].text += " update ";
	let start = performance.now();
	if (!staticFrame) active.updateContent(message, true);
	updateMs += performance.now() - start;
	start = performance.now();
	tui.renderNow();
	renderMs += performance.now() - start;
	await new Promise((resolve) => setTimeout(resolve, Math.max(0, wallStart + (i + 1) * intervalMs - performance.now())));
}
const wallMs = performance.now() - wallStart;
const cpu = process.cpuUsage(cpuStart);
const cpuMs = (cpu.user + cpu.system) / 1000;
console.log(JSON.stringify({
	historyCount, textLength, distinctHistory, frames,
	mode: staticFrame ? "unchanged transcript, 25 frames/sec" : "200 characters/sec, 25 frames/sec",
	cpuPercentOfOneCore: +(cpuMs / wallMs * 100).toFixed(2),
	updateMsPerFrame: +(updateMs / frames).toFixed(3),
	renderMsPerFrame: +(renderMs / frames).toFixed(3),
	cpuMsPerFrame: +(cpuMs / frames).toFixed(3),
	wallMs: +wallMs.toFixed(2),
	writtenBytesPerFrame: +((terminal.bytes - bytesStart) / frames).toFixed(0),
}));
