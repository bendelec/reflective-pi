import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { CONTEXT_HYGIENE_CHECK_REQUIRED, createContextStatusMessage } from "../../src/core/messages.ts";
import { createHarness, type Harness } from "./harness.ts";

function createEchoTool(): AgentTool {
	return {
		name: "echo",
		label: "Echo",
		description: "Echo text back",
		parameters: Type.Object({ text: Type.String() }),
		execute: async (_toolCallId, params) => {
			const text = typeof params === "object" && params !== null && "text" in params ? String(params.text) : "";
			return { content: [{ type: "text", text: `echo:${text}` }], details: { text } };
		},
	};
}

describe("AgentSession context status", () => {
	const harnesses: Harness[] = [];
	const track = (harness: Harness): Harness => {
		harnesses.push(harness);
		return harness;
	};
	afterEach(() => {
		for (const harness of harnesses) harness.cleanup();
		harnesses.length = 0;
	});

	it("injects a context-status message after a tool-call turn (baseline)", async () => {
		const harness = track(
			await createHarness({
				models: [{ id: "test-model", contextWindow: 1000 }],
				tools: [createEchoTool()],
			}),
		);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("echo", { text: "hello" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		await harness.session.prompt("do work");

		const status = harness.session.messages.filter((message) => message.role === "contextStatus");
		expect(status.length).toBe(1);
		expect(status[0].role).toBe("contextStatus");
		expect(status[0].content).toContain("window");
		expect(status[0].content).toContain("used");
	});

	it("adds a mandatory hygiene check to high-pressure status messages", () => {
		const status = createContextStatusMessage(128_000, 102_400, 80, Date.now(), true);
		expect(status.content).toContain("[context-status] window 128,000 · used 102,400 (80.0%)");
		expect(status.content).toContain(CONTEXT_HYGIENE_CHECK_REQUIRED);
	});

	it("does not inject a context-status message on a terminal (no-tool) turn", async () => {
		const harness = track(
			await createHarness({
				models: [{ id: "test-model", contextWindow: 1000 }],
			}),
		);
		harness.setResponses([fauxAssistantMessage("done")]);

		await harness.session.prompt("hi");

		const status = harness.session.messages.filter((message) => message.role === "contextStatus");
		expect(status.length).toBe(0);
	});

	it("persists the context-status message to the session tree", async () => {
		const harness = track(
			await createHarness({
				models: [{ id: "test-model", contextWindow: 1000 }],
				tools: [createEchoTool()],
			}),
		);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("echo", { text: "hello" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		await harness.session.prompt("do work");

		const entries = harness.sessionManager.getEntries();
		const statusEntries = entries.filter(
			(entry) => entry.type === "message" && entry.message.role === "contextStatus",
		);
		expect(statusEntries.length).toBe(1);
	});
});
