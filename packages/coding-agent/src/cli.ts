#!/usr/bin/env node
import { setupCli } from "./cli/setup.ts";
import { BINARY_NAME } from "./config.ts";
import { main } from "./main.ts";

setupCli();
// Keep the rxpi display name; setupCli uses APP_NAME so the shared PI_* env vars stay compatible.
process.title = BINARY_NAME;
main(process.argv.slice(2));
