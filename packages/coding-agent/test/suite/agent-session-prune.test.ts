import { fauxAssistantMessage } from "@earendil-works/pi-ai";
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
});
