import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Token } from "marked";
import { Markdown, type MarkdownOptions, type MarkdownTheme } from "../src/components/markdown.ts";

function makeTheme(): MarkdownTheme {
	return {
		heading: (text) => `\x1b[36m${text}\x1b[39m`,
		link: (text) => `\x1b[34m${text}\x1b[39m`,
		linkUrl: (text) => text,
		code: (text) => `\x1b[33m${text}\x1b[39m`,
		codeBlock: (text) => text,
		codeBlockBorder: (text) => text,
		quote: (text) => text,
		quoteBorder: (text) => text,
		hr: (text) => text,
		listBullet: (text) => text,
		bold: (text) => `\x1b[1m${text}\x1b[22m`,
		italic: (text) => `\x1b[3m${text}\x1b[23m`,
		strikethrough: (text) => `\x1b[9m${text}\x1b[29m`,
		underline: (text) => `\x1b[4m${text}\x1b[24m`,
	};
}

interface TokenCacheView {
	cachedTokens?: { tokens: Token[]; stableTokenCount: number };
}

const samples = {
	paragraphs:
		"**Anchor** with [inline link](https://example.com).\n\nSecond paragraph.\n\nLast *emphasis*, ~~strict strike~~ and `code`.\n\nNext paragraph.",
	headings: "First paragraph\n\nA heading\n---\n\n# Next\n\nText\n===\n\nAfter heading.",
	tables: "Anchor.\n\nBefore.\n\n| Name | Value |\n| --- | ---: |\n| a | 1 |\n| longer name | 222 |\n\nAfter table.",
	fences: "Anchor.\n\nBefore.\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nAfter.\n\n~~~~\nx\n~~~\n~~~~",
	lists: "Anchor.\n\nBefore.\n\n- first\n\n  Continued paragraph.\n\n- second\n  - nested\n\n    ```\n    code\n    ```\n\nAfter list.\n\n1. numbered\n2. next",
	quotes: "Anchor.\n\nBefore.\n\n> quote\n>\n> - item\n> - other\n>\n> continuation\n\nAfter quote.",
	references:
		'[target] and [text][target] and ![image][target].\n\nMiddle.\n\nLast.\n\n[target]: https://example.com "title"\n',
	blankLineReferences: "[one two three]\n\n[one\n\ntwo\n\nthree]: https://example.com",
	delayedDollarBlock: "$$\nx\n\ny\n\nz\n=1\n$$",
	setextReference: "[one\n---\n\ntwo\n\nthree]: https://example.com",
	h1Reference: "[one\n===\n\ntwo\n\nthree]: https://example.com",
	tableReference: "[one\n| --- |\n\ntwo\n\nthree]: https://example.com",
	nestedReferences: "[target]\n\nMiddle.\n\nLast.\n\n> [target]: https://example.com\n\nTail.",
	multilineReferences: "[two lines]\n\nMiddle.\n\nLast.\n\n[two\nlines]:\n https://example.com\n",
	html: "An <a href='https://example.com'>open anchor\n\nMiddle https://example.org\n\nTail </a>.\n\n<code>raw\n\nStill raw\n\n</code>",
	math: "Anchor.\n\nBefore.\n\nMath $x_i + y^2$ and \\(x + y\\).\n\n$$\nx^2 + y^2\n$$\n\nAfter.\n\n\\[\nx_i\n\\]",
	newlines: "Anchor.\r\n\r\nBefore.\r\n\r\nEmoji 🙂 and café.\r\n\r\n\tcode\r\n\r\nTail\r\n",
};

describe("Markdown streaming", () => {
	for (const [name, source] of Object.entries(samples)) {
		it(`matches a fresh full render at every appended character: ${name}`, () => {
			const theme = makeTheme();
			const streamed = new Markdown("", 1, 1, theme);
			for (let length = 0; length <= source.length; length++) {
				const text = source.slice(0, length);
				streamed.setText(text);
				const expected = new Markdown(text, 1, 1, theme).render(37);
				assert.deepEqual(streamed.render(37), expected, `prefix ${length}: ${JSON.stringify(text)}`);
			}
		});
	}

	it("matches full parsing when a chunk completes an earlier multi-paragraph construct", () => {
		for (const [before, appended] of [
			["[one two three]\n\n[one\n\ntwo\n\nthree", "]: https://example.com"],
			["$$\nx\n\ny\n\nz", "\n=1\n$$"],
			["[one\n---\n\ntwo\n\nthree", "]: https://example.com"],
			["[one\n===\n\ntwo\n\nthree", "]: https://example.com"],
			["[one\n| --- |\n\ntwo\n\nthree", "]: https://example.com"],
		] as const) {
			const theme = makeTheme();
			const streamed = new Markdown(before, 1, 0, theme);
			streamed.render(60);
			streamed.setText(before + appended);
			assert.deepEqual(streamed.render(60), new Markdown(before + appended, 1, 0, theme).render(60));
		}
	});

	it("matches full rendering for deterministic mixed Markdown chunk streams", () => {
		const fragments = [
			"Plain text\n\n",
			"**bold** and `code`\n\n",
			"- item\n\n",
			"> quote\n\n",
			"```ts\n",
			"const a = 1;\n",
			"```\n\n",
			"[label\n\n",
			"part\n\n",
			"]: https://example.com\n\n",
			"$$\nx\n\n",
			"=1\n$$\n\n",
			"<a>html\n\n",
			"</a>\n\n",
			"| a | b |\n",
			"| - | - |\n",
			"---\n\n",
		];
		for (let seed = 0; seed < 32; seed++) {
			const theme = makeTheme();
			const streamed = new Markdown("", 1, 0, theme);
			let state = seed + 1;
			let text = "";
			for (let chunk = 0; chunk < 20; chunk++) {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
				text += fragments[state % fragments.length];
				streamed.setText(text);
				assert.deepEqual(
					streamed.render(41),
					new Markdown(text, 1, 0, theme).render(41),
					`seed ${seed}, chunk ${chunk}: ${JSON.stringify(text)}`,
				);
			}
		}
	});

	it("retains completed token identities and their rendered styling when only the tail grows", () => {
		const theme = makeTheme();
		let boldCalls = 0;
		const bold = theme.bold;
		theme.bold = (text) => {
			boldCalls++;
			return bold(text);
		};
		const source = "**Anchor**.\n\nSecond completed paragraph.\n\nCurrent";
		const streamed = new Markdown(source, 1, 0, theme);
		streamed.render(60);
		const before = (streamed as unknown as TokenCacheView).cachedTokens?.tokens[0];
		assert.ok(before);
		const beforeCalls = boldCalls;
		streamed.setText(`${source} tail`);
		const actual = streamed.render(60);
		assert.equal((streamed as unknown as TokenCacheView).cachedTokens?.tokens[0], before);
		assert.equal(boldCalls, beforeCalls);
		assert.deepEqual(actual, new Markdown(`${source} tail`, 1, 0, makeTheme()).render(60));
	});

	it("reparses earlier references when a late definition appears", () => {
		const theme = makeTheme();
		const source = "[target]\n\nMiddle.\n\nLast.\n\n";
		const streamed = new Markdown(source, 0, 0, theme);
		streamed.render(60);
		const before = (streamed as unknown as TokenCacheView).cachedTokens?.tokens[0];
		const updated = `${source}[target]: https://example.com`;
		streamed.setText(updated);
		assert.deepEqual(streamed.render(60), new Markdown(updated, 0, 0, theme).render(60));
		assert.notEqual((streamed as unknown as TokenCacheView).cachedTokens?.tokens[0], before);
	});

	it("refreshes all completed blocks on explicit style invalidation and width changes", () => {
		const theme = makeTheme();
		let color = "31";
		const style = { color: (text: string) => `\x1b[${color}m${text}\x1b[39m`, italic: true };
		const source = "Anchor with **bold**.\n\nMiddle paragraph.\n\nCurrent tail.";
		const streamed = new Markdown(source, 1, 1, theme, style);
		streamed.render(60);
		streamed.setText(`${source} more`);
		streamed.render(60);
		color = "32";
		streamed.invalidate();
		for (const width of [60, 23, 1, 60]) {
			assert.deepEqual(streamed.render(width), new Markdown(`${source} more`, 1, 1, theme, style).render(width));
		}
	});

	it("reuses completed code highlighting, but refreshes width and explicit invalidation", () => {
		const theme = makeTheme();
		let highlightCalls = 0;
		let prefix = "old:";
		theme.highlightCode = (code) => {
			highlightCalls++;
			return code.split("\n").map((line) => prefix + line);
		};
		const source = "```ts\nconst ready = true;\n```\n\nBefore.\n\nCurrent";
		const streamed = new Markdown(source, 1, 0, theme);
		streamed.render(60);
		assert.equal(highlightCalls, 1);
		streamed.setText(`${source} tail`);
		streamed.render(60);
		assert.equal(highlightCalls, 1);
		streamed.render(30);
		assert.equal(highlightCalls, 2);
		prefix = "new:";
		streamed.invalidate();
		const actual = streamed.render(30);
		assert.equal(highlightCalls, 3);
		assert.deepEqual(actual, new Markdown(`${source} tail`, 1, 0, theme).render(30));
	});

	it("same-text setText explicitly refreshes background, theme and highlighting closures", () => {
		const theme = makeTheme();
		let color = "31";
		const background = (text: string) => `\x1b[${color}m${text}\x1b[49m`;
		theme.bold = (text) => `\x1b[${color}m${text}\x1b[39m`;
		theme.highlightCode = (code) => [`${color}:${code}`];
		const source = "**Anchor**.\n\n```ts\nconst a = 1;\n```\n\nTail.";
		const streamed = new Markdown(source, 1, 1, theme, { bgColor: background });
		const before = streamed.render(60);
		color = "32";
		streamed.setText(source);
		const after = streamed.render(60);
		assert.notDeepEqual(after, before);
		assert.deepEqual(after, new Markdown(source, 1, 1, theme, { bgColor: background }).render(60));
	});

	it("falls back for edits, shrinking text and transforms that rewrite earlier source", () => {
		const theme = makeTheme();
		const options: MarkdownOptions = {
			transform: (text, width) =>
				`${width}\n\n${text.includes("done") ? text.replace("Anchor", "Rewritten") : text}`,
		};
		const streamed = new Markdown("", 1, 1, theme, undefined, options);
		for (const [text, width] of [
			["Anchor.\n\nMiddle.\n\nTail", 50],
			["Anchor.\n\nMiddle.\n\nTail done", 50],
			["Anchor.\n\nMiddle.\n\nTail done again", 25],
			["Different **text**", 25],
			["", 25],
			["Anchor.\n\nMiddle.\n\nTail", 50],
		] as const) {
			streamed.setText(text);
			assert.deepEqual(streamed.render(width), new Markdown(text, 1, 1, theme, undefined, options).render(width));
		}
	});
});
