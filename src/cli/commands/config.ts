/**
 * Config generator command for Claude/Cursor.
 */

export interface ConfigOptions {
  client: "claude" | "cursor" | "vscode";
  output?: string;
  json?: boolean;
}

interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface ClaudeConfig {
  mcpServers: Record<string, McpServerConfig>;
}

interface CursorConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Generate Claude Desktop configuration.
 */
function generateClaudeConfig(): ClaudeConfig {
  return {
    mcpServers: {
      "meta-ads": {
        command: "npx",
        args: ["-y", "meta-ads-mcp"],
        env: {
          META_ACCESS_TOKEN: "<YOUR_META_ACCESS_TOKEN>",
          META_APP_ID: "<OPTIONAL_APP_ID>",
          META_APP_SECRET: "<OPTIONAL_APP_SECRET>",
          META_MCP_LOG_LEVEL: "info",
        },
      },
    },
  };
}

/**
 * Generate Cursor configuration.
 */
function generateCursorConfig(): CursorConfig {
  return {
    mcpServers: {
      "meta-ads": {
        command: "npx",
        args: ["-y", "meta-ads-mcp"],
        env: {
          META_ACCESS_TOKEN: "<YOUR_META_ACCESS_TOKEN>",
          META_APP_ID: "<OPTIONAL_APP_ID>",
          META_APP_SECRET: "<OPTIONAL_APP_SECRET>",
          META_MCP_LOG_LEVEL: "info",
        },
      },
    },
  };
}

/**
 * Generate VSCode configuration.
 */
function generateVSCodeConfig(): CursorConfig {
  return {
    mcpServers: {
      "meta-ads": {
        command: "npx",
        args: ["-y", "meta-ads-mcp"],
        env: {
          META_ACCESS_TOKEN: "<YOUR_META_ACCESS_TOKEN>",
          META_APP_ID: "<OPTIONAL_APP_ID>",
          META_APP_SECRET: "<OPTIONAL_APP_SECRET>",
          META_MCP_LOG_LEVEL: "info",
        },
      },
    },
  };
}

/**
 * Execute the config command.
 */
export async function runConfig(options: ConfigOptions): Promise<void> {
  let config: ClaudeConfig | CursorConfig;
  let configPath: string;
  let instructions: string;

  switch (options.client) {
    case "claude":
      config = generateClaudeConfig();
      configPath = "~/Library/Application Support/Claude/claude_desktop_config.json";
      instructions = `
Claude Desktop Configuration
=============================

Add the following to your Claude Desktop config file:
${configPath}

`;
      break;
    case "cursor":
      config = generateCursorConfig();
      configPath = "~/.cursor/mcp.json";
      instructions = `
Cursor Configuration
====================

Add the following to your Cursor MCP config file:
${configPath}

`;
      break;
    case "vscode":
      config = generateVSCodeConfig();
      configPath = "~/.vscode/mcp.json";
      instructions = `
VSCode Configuration
====================

Add the following to your VSCode MCP config file:
${configPath}

`;
      break;
    default:
      throw new Error(`Unknown client type: ${options.client}`);
  }

  const jsonOutput = JSON.stringify(config, null, 2);

  if (options.json) {
    // Output only JSON for piping
    console.log(jsonOutput);
  } else {
    // Output with instructions
    console.error(instructions);
    console.log(jsonOutput);
    console.error(`
Instructions:
1. Copy the JSON above
2. Open the config file at: ${configPath}
3. Merge this configuration with your existing config
4. Replace <YOUR_META_ACCESS_TOKEN> with your actual token
5. Restart your ${options.client === "claude" ? "Claude Desktop" : options.client === "cursor" ? "Cursor" : "VSCode"}

Environment Variables:
- META_ACCESS_TOKEN (required): Your Meta API access token
- META_APP_ID (optional): For OAuth and app secret proof
- META_APP_SECRET (optional): For OAuth and app secret proof
- META_MCP_LOG_LEVEL (optional): debug | info | warn | error | silent
`);
  }
}
