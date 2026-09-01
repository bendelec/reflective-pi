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

	it("replaces an atomic block with a persisted summary", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const id = userEntryId(harness);
		harness.session.setBlockSummary([id], "The user started the greeting task.");

		expect(harness.sessionManager.getPruneState(id)).toBe("summarized");
		expect(harness.sessionManager.getPruneSummary(id)).toBe("The user started the greeting task.");
		expect(harness.session.messages).toMatchObject([
			{
				role: "custom",
				content: "[Summary of previously summarized context block]\nThe user started the greeting task.",
			},
			{ role: "assistant" },
		]);
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

		// The success result is factual: what was pruned and how much remains.
		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(false);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Pruned 1 block(s).");
		expect(text).toContain("block(s) remain.");
	});

	it("falls back to the active model when no summary model is configured", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [user] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("The active model summarized the greeting task."),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the first message");

		expect(harness.sessionManager.getPruneState(user)).toBe("summarized");
		expect(harness.sessionManager.getPruneSummary(user)).toBe("The active model summarized the greeting task.");
	});

	it("summarizes a selected block with the configured secondary model", async () => {
		const harness = track(
			await createHarness({
				models: [
					{ id: "agent-model", contextWindow: 1000 },
					{ id: "summary-model", contextWindow: 1000 },
				],
				settings: {
					reflectiveContext: { summarizationModel: { provider: "faux", model: "summary-model" } },
				},
			}),
		);
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("summarize_context", { ids: [user] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("The user opened the greeting task."),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("summarize the first message");

		expect(harness.sessionManager.getPruneState(user)).toBe("summarized");
		expect(harness.sessionManager.getPruneSummary(user)).toBe("The user opened the greeting task.");
		expect(harness.session.messages).toContainEqual(
			expect.objectContaining({
				role: "custom",
				content: "[Summary of previously summarized context block]\nThe user opened the greeting task.",
			}),
		);
	});

	it("lists blocks with ids via list_context", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		const user = userEntryId(harness);

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("list_context", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("list blocks");

		// The tool result lists the user block id, its preview, and the read-only note.
		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(false);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain(user);
		expect(text).toContain("user: hello");
		expect(text).toContain("Listing is read-only");
	});

	it("registers list_context as a read-only zero-parameter tool", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const definition = harness.session.getToolDefinition("list_context");
		expect(definition).toBeDefined();
		expect(definition!.parameters).toMatchObject({ type: "object", properties: {} });
		expect(definition!.description).toContain("no parameters");
	});

	it("errors when prune_context is called without ids", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune without ids");

		// A mutating tool must fail loudly when the mutation payload is missing.
		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(true);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: prune_context requires");
		expect(text).toContain("Call list_context");
	});

	it("errors when prune_context is called with an empty ids array", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: [] })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune with empty ids");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(true);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: prune_context requires");
		expect(text).toContain("Call list_context");
	});

	it("errors when no blocks match the given ids", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		harness.setResponses([fauxAssistantMessage("hello back")]);
		await harness.session.prompt("hello");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("prune_context", { ids: ["does-not-exist"] })], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("prune unknown id");

		const result = harness.session.messages.find((m) => m.role === "toolResult");
		expect(result).toBeDefined();
		expect(result!.isError).toBe(true);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("No current context blocks matched");
		expect(text).toContain("does-not-exist");
	});

	it("frames context hygiene as a quality requirement in the system prompt", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const prompt = harness.session.systemPrompt;
		expect(prompt).toContain("prune_context");
		expect(prompt).toContain("context is your working set");
		expect(prompt).toContain("competes for attention");
		expect(prompt).toContain("natural work boundaries");
		expect(prompt).toContain("safety signal, not the normal trigger");
	});

	it("advertises ids as an array of strings", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const parameters = harness.session.getToolDefinition("prune_context")?.parameters;
		expect(parameters).toMatchObject({
			type: "object",
			properties: {
				ids: {
					type: "array",
					items: { type: "string" },
				},
			},
		});
	});

	it("spells out the list-then-prune workflow in the tool description", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const description = harness.session.getToolDefinition("prune_context")?.description ?? "";
		expect(description).toContain("Call list_context");
		expect(description).toContain("exclude the selected blocks");
		// The agent tool only excludes; restoration is via the user's /prune command.
		expect(description).toContain("cannot restore blocks");
		expect(description).toContain("/prune");
	});

	it("frames capacity pressure as a context-hygiene safety fallback", async () => {
		const harness = track(await createHarness({ models: [{ id: "test-model", contextWindow: 1000 }] }));
		const prompt = harness.session.systemPrompt;
		expect(prompt).toContain("Context-status messages measure capacity only");
		expect(prompt).toContain("safety signal, not the normal trigger for hygiene");
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
		expect(result!.isError).toBe(true);
		const text = result!.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Error: prune_context requires");
		expect(text).toContain("Call list_context");
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
