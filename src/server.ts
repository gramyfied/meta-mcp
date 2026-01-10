/**
 * MCP Server implementation.
 *
 * Extracted from index.ts to allow CLI to import it separately.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MetaApiClient } from "./meta-client.js";
import { AuthManager } from "./utils/auth.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerAudienceTools } from "./tools/audiences.js";
import { registerCreativeTools } from "./tools/creatives.js";
import { registerOAuthTools } from "./tools/oauth.js";
import { registerValidationTools } from "./tools/validation.js";
import { registerCampaignResources } from "./resources/campaigns.js";
import { registerInsightsResources } from "./resources/insights.js";
import { registerAudienceResources } from "./resources/audiences.js";

export async function startServer(): Promise<void> {
  try {
    console.error("Starting Meta Marketing API MCP Server...");
    console.error("Environment check:");
    console.error(`   NODE_VERSION: ${process.version}`);
    console.error(
      `   META_ACCESS_TOKEN: ${
        process.env.META_ACCESS_TOKEN ? "Present" : "Missing"
      }`
    );
    console.error(
      `   MCP_SERVER_NAME: ${process.env.MCP_SERVER_NAME || "Not set"}`
    );

    // Initialize authentication
    console.error("Initializing authentication...");
    const auth = AuthManager.fromEnvironment();
    console.error("Auth manager created successfully");

    // Validate and refresh token if needed
    console.error("Validating Meta access token...");
    try {
      const currentToken = await auth.refreshTokenIfNeeded();
      console.error("Token validation and refresh successful");
      console.error(`Token ready: ${currentToken.substring(0, 20)}...`);

      const hasOAuthConfig = !!(
        process.env.META_APP_ID && process.env.META_APP_SECRET
      );
      console.error(
        `OAuth configuration: ${hasOAuthConfig ? "Available" : "Not configured"}`
      );
      console.error(
        `Auto-refresh: ${
          process.env.META_AUTO_REFRESH === "true" ? "Enabled" : "Disabled"
        }`
      );
    } catch (error) {
      console.error("Token validation failed:", error);
      console.error(
        "Use OAuth tools to obtain a new token or check configuration"
      );
      process.exit(1);
    }

    // Initialize Meta API client
    console.error("Initializing Meta API client...");
    const metaClient = new MetaApiClient(auth);
    console.error("Meta API client created successfully");

    // Initialize MCP Server
    console.error("Initializing MCP Server...");
    const server = new McpServer({
      name: process.env.MCP_SERVER_NAME || "Meta Marketing API Server",
      version: process.env.MCP_SERVER_VERSION || "1.7.0",
    });
    console.error("MCP Server instance created");

    // Register all tools
    console.error("Registering tools...");
    registerCampaignTools(server, metaClient);
    console.error("   Campaign tools registered");
    registerAnalyticsTools(server, metaClient);
    console.error("   Analytics tools registered");
    registerAudienceTools(server, metaClient);
    console.error("   Audience tools registered");
    registerCreativeTools(server, metaClient);
    console.error("   Creative tools registered");
    registerOAuthTools(server, auth);
    console.error("   OAuth tools registered");
    registerValidationTools(server, metaClient);
    console.error("   Validation tools registered");

    // Register all resources
    console.error("Registering resources...");
    registerCampaignResources(server, metaClient);
    console.error("   Campaign resources registered");
    registerInsightsResources(server, metaClient);
    console.error("   Insights resources registered");
    registerAudienceResources(server, metaClient);
    console.error("   Audience resources registered");

    // Add account discovery tool
    server.tool("get_ad_accounts", {}, async () => {
      try {
        const accounts = await metaClient.getAdAccounts();

        const accountsData = accounts.map((account) => ({
          id: account.id,
          name: account.name,
          account_status: account.account_status,
          currency: account.currency,
          timezone_name: account.timezone_name,
          balance: account.balance,
          business: account.business
            ? {
                id: account.business.id,
                name: account.business.name,
              }
            : null,
        }));

        const response = {
          success: true,
          accounts: accountsData,
          total_accounts: accountsData.length,
          message: "Ad accounts retrieved successfully",
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error getting ad accounts: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Add server health check tool
    server.tool("health_check", {}, async () => {
      try {
        const accounts = await metaClient.getAdAccounts();
        const response = {
          status: "healthy",
          server_name: "Meta Marketing API Server",
          version: "1.7.0",
          timestamp: new Date().toISOString(),
          meta_api_connection: "connected",
          accessible_accounts: accounts.length,
          rate_limit_status: "operational",
          features: {
            campaign_management: true,
            analytics_reporting: true,
            audience_management: true,
            creative_management: true,
            real_time_insights: true,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        const response = {
          status: "unhealthy",
          server_name: "Meta Marketing API Server",
          version: "1.7.0",
          timestamp: new Date().toISOString(),
          error: errorMessage,
          meta_api_connection: "failed",
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    // Add server capabilities info
    server.tool("get_capabilities", {}, async () => {
      const capabilities = {
        server_info: {
          name: "Meta Marketing API Server",
          version: "1.7.0",
          description:
            "MCP server providing access to Meta Marketing API for campaign management, analytics, and audience targeting",
        },
        api_coverage: {
          campaigns: {
            description: "Full campaign lifecycle management",
            operations: [
              "create",
              "read",
              "update",
              "delete",
              "pause",
              "resume",
            ],
          },
          ad_sets: {
            description: "Ad set management and targeting",
            operations: ["create", "read", "update", "list"],
          },
          ads: {
            description: "Individual ad management",
            operations: ["create", "read", "update", "list"],
          },
          insights: {
            description: "Performance analytics and reporting",
            metrics: ["impressions", "clicks", "spend", "reach", "ctr", "cpc"],
          },
          audiences: {
            description: "Custom and lookalike audience management",
            types: ["custom", "lookalike", "website", "app"],
          },
        },
        rate_limits: {
          development_tier: { max_score: 60, decay_time: "5 minutes" },
          standard_tier: { max_score: 9000, decay_time: "5 minutes" },
        },
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(capabilities, null, 2),
          },
        ],
      };
    });

    // Add AI workflow guidance tool
    server.tool(
      "get_ai_guidance",
      "Get comprehensive guidance for AI assistants on how to effectively use this Meta Marketing API server.",
      {},
      async () => {
        const guidance = {
          server_purpose: {
            description:
              "This MCP server provides comprehensive access to Meta (Facebook/Instagram) advertising capabilities.",
            primary_use_cases: [
              "Campaign performance analysis and optimization",
              "Automated campaign creation and management",
              "Audience research and targeting insights",
              "Creative performance testing and analysis",
            ],
          },
          common_workflows: {
            campaign_analysis: {
              description: "Analyze campaign performance",
              key_tools: [
                "get_ad_accounts",
                "list_campaigns",
                "get_insights",
                "compare_performance",
              ],
            },
            new_campaign_setup: {
              description: "Create and launch a new advertising campaign",
              key_tools: [
                "create_campaign",
                "create_ad_set",
                "create_ad_creative",
                "create_ad",
              ],
            },
          },
          best_practices: {
            error_handling: [
              "Always check health_check before starting major operations",
              "Use get_ad_accounts to verify account access",
              "Handle rate limiting by spacing out API calls",
            ],
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(guidance, null, 2),
            },
          ],
        };
      }
    );

    console.error("Connecting to MCP transport...");
    console.error(
      `Server: ${
        process.env.MCP_SERVER_NAME || "Meta Marketing API Server"
      } v${process.env.MCP_SERVER_VERSION || "1.7.0"}`
    );
    console.error(`Meta API Version: ${auth.getApiVersion()}`);

    // Connect to transport
    console.error("Attempting server connection...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Transport connection established");

    console.error("Meta Marketing API MCP Server started successfully");
    console.error("Ready to receive requests from MCP clients");
    console.error("Server is now running and listening...");
  } catch (error) {
    console.error("Failed to start Meta Marketing API MCP Server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
