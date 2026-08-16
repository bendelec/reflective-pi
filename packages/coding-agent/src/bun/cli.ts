#!/usr/bin/env node
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { BINARY_NAME } from "../config.ts";

process.title = BINARY_NAME;
process.emitWarning = (() => {}) as typeof process.emitWarning;

registerBunOAuthFlows();

import { restoreSandboxEnv } from "./restore-sandbox-env.ts";

restoreSandboxEnv();

await import("./register-bedrock.ts");
await import("../cli.ts");
