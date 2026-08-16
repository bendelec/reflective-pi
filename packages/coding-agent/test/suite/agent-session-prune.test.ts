import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.ts";

describe("AgentSession setPruneState", () => {
	const harnesses: Harness[] = [];
	const track = (harness: Harness): Harness => {
		harnesses.push(harness);
		return harness;
	};
	afterEach(() => {
		for (const harness of harnesses) harness.cleanup();
		harnesses.length = 0;
	});

	function userEntryId(harness: Harness): string {
		const entry = harness.sessionManager.getEntries().find((e) => e.type === "message" && e.message.role === "user");
		expect(entry).toBeDefined();
		return entry!.id;
	}

	it("excludes pruned entries from the live context", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		expect(harness.session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

		const id = userEntryId(harness);
		harness.session.setPruneState([id], "excluded");

		// Context rebuild drops the pruned user message.
		expect(harness.session.messages.map((m) => m.role)).toEqual(["assistant"]);
		expect(harness.sessionManager.getPruneState(id)).toBe("excluded");
	});

	it("restores entries on unprune", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const id = userEntryId(harness);
		harness.session.setPruneState([id], "excluded");
		expect(harness.session.messages.map((m) => m.role)).toEqual(["assistant"]);

		harness.session.setPruneState([id], "included");
		expect(harness.session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
		expect(harness.sessionManager.getPruneState(id)).toBeUndefined();
	});

	it("prunes all entries in a block together", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);
		const assistant = harness.sessionManager
			.getEntries()
			.find((e) => e.type === "message" && e.message.role === "assistant")!;
		expect(assistant).toBeDefined();

		harness.session.setPruneState([user, assistant.id], "excluded");
		expect(harness.session.messages).toEqual([]);
	});

	it("prunes context via the prune_context tool", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		expect(harness.session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

		// The id of the first user message, as the tool would list it.
		const user = userEntryId(harness);

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [user] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune the first message");

		// The first user message ("hello") is pruned from the live context.
		const hello = harness.session.messages.find((m) => m.role === "user" && m.content === "hello");
		expect(hello).toBeUndefined();
	});

	it("lists blocks with ids via prune_context without arguments", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("list blocks");

		// The tool result should list the user block id and its preview.
		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain(user);
		expect(text).toContain("user: hello");
	});

	it("includes the context-curation guide in the system prompt", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const prompt = harness.session.systemPrompt;
		expect(prompt).toContain("prune_context");
		expect(prompt).toContain("valuable, limited resource");
		// Reassurance that pruning is safe, so the model is willing to prune proactively.
		expect(prompt).toContain("never deletes history");
	});

	it("spells out the list-then-prune workflow in the tool description", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const description = harness.session.getToolDefinition("prune_context")?.description ?? "";
		expect(description).toContain("list the current blocks");
		expect(description).toContain("reversible");
		expect(description).toContain("never deletes history");
	});

	it("ties the context-status signal to the prune action in the system prompt", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const prompt = harness.session.systemPrompt;
		expect(prompt).toMatch(/\[context-status\].*prune/);
	});

	it("returns error for malformed parameters", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { wrong: "param" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("try malformed params");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: Invalid parameters");
		expect(text).toContain("no parameters to list");
	});

	it("returns error when ids is not an array", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: "not-an-array" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("try non-array ids");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: 'ids' must be an array");
	});

	it("returns error when ids contains non-string values", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [123, "valid-id"] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("try non-string ids");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: All ids must be strings");
		expect(text).toContain("123");
	});
});
