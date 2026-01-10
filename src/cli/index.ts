#!/usr/bin/env node

/**
 * Meta MCP CLI entry point.
 *
 * Commands:
 * - serve (default): Start the MCP server
 * - config: Generate configuration for Claude/Cursor
 * - doctor: Validate environment and configuration
 */

import { runConfig, type ConfigOptions } from "./commands/config.js";
import { runDoctor } from "./commands/doctor.js";

interface ParsedArgs {
  command: string;
  options: Record<string, string | boolean>;
  positional: string[];
}

/**
 * Parse command line arguments.
 */
function parseArgs(args: string[]): ParsedArgs {
  const command = args[0] || "serve";
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (value !== undefined) {
        options[key] = value;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        options[key] = args[++i];
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        options[key] = args[++i];
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, options, positional };
}

/**
 * Show help message.
 */
function showHelp(): void {
  console.log(`
Meta MCP CLI - Meta Marketing API MCP Server

Usage: meta-ads-mcp [command] [options]

Commands:
  serve                 Start the MCP server (default)
  config                Generate configuration for Claude/Cursor
  doctor                Validate environment and configuration
  help                  Show this help message

Config Options:
  --client <type>       Client type: claude, cursor, vscode (default: claude)
  --json                Output only JSON (for piping)

Examples:
  meta-ads-mcp                           Start the MCP server
  meta-ads-mcp serve                     Start the MCP server
  meta-ads-mcp config --client claude    Generate Claude Desktop config
  meta-ads-mcp config --json             Output JSON for piping
  meta-ads-mcp doctor                    Validate environment

Environment Variables:
  META_ACCESS_TOKEN     (required) Meta API access token
  META_APP_ID           (optional) OAuth app ID
  META_APP_SECRET       (optional) OAuth app secret
  META_MCP_LOG_LEVEL    (optional) Log level: debug, info, warn, error, silent
  META_MCP_LOG_FORMAT   (optional) Log format: text, json

For more information, visit: https://github.com/your-repo/meta-ads-mcp
`);
}

/**
 * Run the serve command (start MCP server).
 */
async function runServe(): Promise<void> {
  // Dynamic import to avoid loading server code for other commands
  const { startServer } = await import("../server.js");
  await startServer();
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  try {
    switch (command) {
      case "serve":
        await runServe();
        break;

      case "config":
        await runConfig({
          client: (options.client as ConfigOptions["client"]) || "claude",
          json: !!options.json,
        });
        break;

      case "doctor":
        await runDoctor();
        break;

      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;

      case "version":
      case "--version":
      case "-v":
        // Read version from package.json
        console.log("meta-ads-mcp v1.7.0");
        break;

      default:
        // If no recognized command, default to serve
        // This maintains backward compatibility
        await runServe();
        break;
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
