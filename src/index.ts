#!/usr/bin/env node

/**
 * Meta MCP Entry Point
 *
 * This file serves as the main entry point for the meta-ads-mcp CLI.
 * It delegates to the CLI for command handling or starts the server directly
 * for backward compatibility.
 */

// Check if this is being run as a CLI or imported
const isDirectRun = process.argv[1]?.endsWith("index.js") ||
  process.argv[1]?.endsWith("index.ts") ||
  process.argv[1]?.includes("meta-ads-mcp");

if (isDirectRun) {
  // Import and run CLI
  import("./cli/index.js").catch((error) => {
    // Fallback to direct server start if CLI fails to load
    console.error("CLI load failed, falling back to server start:", error.message);
    import("./server.js").then(({ startServer }) => startServer());
  });
}

// Export server for programmatic use
export { startServer } from "./server.js";
