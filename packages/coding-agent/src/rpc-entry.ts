#!/usr/bin/env node
import { BINARY_NAME } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";

process.title = `${BINARY_NAME}-rpc`;
process.env.PI_CODING_AGENT = "true";
process.env.AI_AGENT = "pi";
process.emitWarning = (() => {}) as typeof process.emitWarning;

configureHttpDispatcher();

main(["--mode", "rpc", ...process.argv.slice(2)]);
