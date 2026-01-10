/**
 * Doctor command for validating environment and configuration.
 */

import { config } from "dotenv";
import fetch from "node-fetch";
import { createHmac } from "crypto";

interface CheckResult {
  status: "pass" | "warn" | "fail";
  message: string;
  details?: string;
}

interface DoctorReport {
  environment: CheckResult[];
  tokenValidation: CheckResult[];
  apiConnectivity: CheckResult[];
  permissions: CheckResult[];
  recommendations: string[];
}

/**
 * Format a check result for display.
 */
function formatCheck(result: CheckResult): string {
  const icon =
    result.status === "pass" ? "[PASS]" :
    result.status === "warn" ? "[WARN]" :
    "[FAIL]";

  let output = `  ${icon} ${result.message}`;
  if (result.details) {
    output += `\n       ${result.details}`;
  }
  return output;
}

/**
 * Check environment variables.
 */
function checkEnvironment(): CheckResult[] {
  const results: CheckResult[] = [];

  // Check META_ACCESS_TOKEN
  if (process.env.META_ACCESS_TOKEN) {
    const token = process.env.META_ACCESS_TOKEN;
    if (token.length > 50) {
      results.push({
        status: "pass",
        message: "META_ACCESS_TOKEN is set",
        details: `Token length: ${token.length} characters`,
      });
    } else {
      results.push({
        status: "warn",
        message: "META_ACCESS_TOKEN seems short",
        details: "Token might be invalid or truncated",
      });
    }
  } else {
    results.push({
      status: "fail",
      message: "META_ACCESS_TOKEN is not set",
      details: "This is required for API access",
    });
  }

  // Check META_APP_ID
  if (process.env.META_APP_ID) {
    results.push({
      status: "pass",
      message: "META_APP_ID is set",
    });
  } else {
    results.push({
      status: "warn",
      message: "META_APP_ID is not set",
      details: "Optional, but needed for OAuth and app secret proof",
    });
  }

  // Check META_APP_SECRET
  if (process.env.META_APP_SECRET) {
    results.push({
      status: "pass",
      message: "META_APP_SECRET is set",
    });
  } else {
    results.push({
      status: "warn",
      message: "META_APP_SECRET is not set",
      details: "Optional, but recommended for enhanced security",
    });
  }

  // Check META_MCP_LOG_LEVEL
  const logLevel = process.env.META_MCP_LOG_LEVEL;
  if (logLevel) {
    const validLevels = ["debug", "info", "warn", "error", "silent"];
    if (validLevels.includes(logLevel.toLowerCase())) {
      results.push({
        status: "pass",
        message: `META_MCP_LOG_LEVEL is set to '${logLevel}'`,
      });
    } else {
      results.push({
        status: "warn",
        message: `META_MCP_LOG_LEVEL '${logLevel}' is not valid`,
        details: `Valid values: ${validLevels.join(", ")}`,
      });
    }
  } else {
    results.push({
      status: "warn",
      message: "META_MCP_LOG_LEVEL is not set",
      details: "Defaulting to 'info'",
    });
  }

  return results;
}

/**
 * Validate the access token.
 */
async function checkTokenValidation(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const token = process.env.META_ACCESS_TOKEN;

  if (!token) {
    results.push({
      status: "fail",
      message: "Cannot validate token - META_ACCESS_TOKEN not set",
    });
    return results;
  }

  const apiVersion = process.env.META_API_VERSION || "v23.0";
  const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com";

  try {
    // Test basic token validity with /me endpoint
    const meUrl = `${baseUrl}/${apiVersion}/me?access_token=${token}`;
    const meResponse = await fetch(meUrl);
    const meData = (await meResponse.json()) as any;

    if (meData.error) {
      results.push({
        status: "fail",
        message: "Token validation failed",
        details: meData.error.message,
      });
      return results;
    }

    results.push({
      status: "pass",
      message: "Token is valid",
      details: `User/Page: ${meData.name || meData.id}`,
    });

    // Debug token to get scopes and expiration
    const debugUrl = `${baseUrl}/${apiVersion}/debug_token?input_token=${token}&access_token=${token}`;
    const debugResponse = await fetch(debugUrl);
    const debugData = (await debugResponse.json()) as any;

    if (debugData.data) {
      const tokenInfo = debugData.data;

      // Check expiration
      if (tokenInfo.expires_at) {
        const expiresAt = new Date(tokenInfo.expires_at * 1000);
        const now = new Date();
        const daysUntilExpiry = Math.floor(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiry <= 0) {
          results.push({
            status: "fail",
            message: "Token has expired",
            details: `Expired on: ${expiresAt.toISOString()}`,
          });
        } else if (daysUntilExpiry <= 7) {
          results.push({
            status: "warn",
            message: `Token expires in ${daysUntilExpiry} days`,
            details: `Expires: ${expiresAt.toISOString()}`,
          });
        } else {
          results.push({
            status: "pass",
            message: `Token expires in ${daysUntilExpiry} days`,
            details: `Expires: ${expiresAt.toISOString()}`,
          });
        }
      } else if (tokenInfo.data_access_expires_at === 0) {
        results.push({
          status: "pass",
          message: "Token does not expire (system user token)",
        });
      }

      // Check scopes
      if (tokenInfo.scopes && tokenInfo.scopes.length > 0) {
        const hasAdsManagement = tokenInfo.scopes.includes("ads_management");
        const hasAdsRead = tokenInfo.scopes.includes("ads_read");

        if (hasAdsManagement) {
          results.push({
            status: "pass",
            message: `Scopes: ${tokenInfo.scopes.join(", ")}`,
          });
        } else if (hasAdsRead) {
          results.push({
            status: "warn",
            message: "Only ads_read scope available",
            details: "Write operations will fail. Add ads_management for full access.",
          });
        } else {
          results.push({
            status: "warn",
            message: `Scopes: ${tokenInfo.scopes.join(", ")}`,
            details: "No ads_management or ads_read scope found",
          });
        }
      }
    }
  } catch (error) {
    results.push({
      status: "fail",
      message: "Token validation request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return results;
}

/**
 * Check API connectivity.
 */
async function checkApiConnectivity(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com";

  try {
    const start = Date.now();
    const response = await fetch(`${baseUrl}/v23.0/me`, {
      method: "HEAD",
    });
    const latency = Date.now() - start;

    if (response.status === 400 || response.status === 200) {
      // 400 is expected without token, 200 with token
      results.push({
        status: "pass",
        message: `Connected to ${baseUrl}`,
        details: `Latency: ${latency}ms`,
      });
    } else {
      results.push({
        status: "warn",
        message: `Unexpected response from ${baseUrl}`,
        details: `Status: ${response.status}`,
      });
    }
  } catch (error) {
    results.push({
      status: "fail",
      message: `Cannot connect to ${baseUrl}`,
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // Check app secret proof if configured
  if (process.env.META_ACCESS_TOKEN && process.env.META_APP_SECRET) {
    try {
      const proof = createHmac("sha256", process.env.META_APP_SECRET)
        .update(process.env.META_ACCESS_TOKEN)
        .digest("hex");

      results.push({
        status: "pass",
        message: "App secret proof generation working",
        details: `Proof: ${proof.substring(0, 16)}...`,
      });
    } catch (error) {
      results.push({
        status: "fail",
        message: "App secret proof generation failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Check account access and permissions.
 */
async function checkPermissions(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const token = process.env.META_ACCESS_TOKEN;

  if (!token) {
    results.push({
      status: "fail",
      message: "Cannot check permissions - no token",
    });
    return results;
  }

  const apiVersion = process.env.META_API_VERSION || "v23.0";
  const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com";

  try {
    // Get ad accounts
    const accountsUrl = `${baseUrl}/${apiVersion}/me/adaccounts?fields=id,name,account_status,currency,funding_source_details&access_token=${token}`;
    const accountsResponse = await fetch(accountsUrl);
    const accountsData = (await accountsResponse.json()) as any;

    if (accountsData.error) {
      results.push({
        status: "fail",
        message: "Cannot access ad accounts",
        details: accountsData.error.message,
      });
      return results;
    }

    const accounts = accountsData.data || [];
    if (accounts.length === 0) {
      results.push({
        status: "warn",
        message: "No ad accounts found",
        details: "Token may not have access to any ad accounts",
      });
    } else {
      results.push({
        status: "pass",
        message: `Found ${accounts.length} accessible ad account(s)`,
      });

      // Check each account
      for (const account of accounts.slice(0, 5)) {
        // Limit to first 5
        const status =
          account.account_status === 1 ? "ACTIVE" :
          account.account_status === 2 ? "DISABLED" :
          account.account_status === 3 ? "UNSETTLED" :
          "PENDING";

        const hasFunding = !!account.funding_source_details;

        if (status === "ACTIVE" && hasFunding) {
          results.push({
            status: "pass",
            message: `Account ${account.id}: ${account.name}`,
            details: `Status: ${status}, Currency: ${account.currency}`,
          });
        } else if (status === "ACTIVE") {
          results.push({
            status: "warn",
            message: `Account ${account.id}: ${account.name}`,
            details: `Status: ${status}, No payment method configured`,
          });
        } else {
          results.push({
            status: "warn",
            message: `Account ${account.id}: ${account.name}`,
            details: `Status: ${status}`,
          });
        }
      }

      if (accounts.length > 5) {
        results.push({
          status: "pass",
          message: `... and ${accounts.length - 5} more account(s)`,
        });
      }
    }
  } catch (error) {
    results.push({
      status: "fail",
      message: "Permissions check failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return results;
}

/**
 * Generate recommendations based on the report.
 */
function generateRecommendations(report: Omit<DoctorReport, "recommendations">): string[] {
  const recommendations: string[] = [];

  // Check for failures
  const allChecks = [
    ...report.environment,
    ...report.tokenValidation,
    ...report.apiConnectivity,
    ...report.permissions,
  ];

  const failures = allChecks.filter((c) => c.status === "fail");
  const warnings = allChecks.filter((c) => c.status === "warn");

  if (failures.some((f) => f.message.includes("META_ACCESS_TOKEN"))) {
    recommendations.push(
      "Set META_ACCESS_TOKEN environment variable with a valid Meta API token"
    );
  }

  if (failures.some((f) => f.message.includes("expired"))) {
    recommendations.push(
      "Refresh your access token using the Meta Business Suite or OAuth flow"
    );
  }

  if (warnings.some((w) => w.message.includes("META_APP_SECRET"))) {
    recommendations.push(
      "Consider setting META_APP_SECRET for enhanced security with app secret proof"
    );
  }

  if (warnings.some((w) => w.message.includes("No payment method"))) {
    recommendations.push(
      "Add a payment method to your ad account(s) for ad delivery"
    );
  }

  if (warnings.some((w) => w.message.includes("expires in"))) {
    recommendations.push(
      "Refresh your token soon to avoid service interruption"
    );
  }

  if (!process.env.META_MCP_LOG_LEVEL) {
    recommendations.push(
      "Set META_MCP_LOG_LEVEL=debug during development for detailed logging"
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Your configuration looks good! No issues detected.");
  }

  return recommendations;
}

/**
 * Execute the doctor command.
 */
export async function runDoctor(): Promise<void> {
  // Load environment
  config({ path: ".env.local" });
  config({ path: ".env" });

  console.log("");
  console.log("Meta MCP Doctor Report");
  console.log("======================");
  console.log("");

  // Run all checks
  console.log("Environment:");
  const environment = checkEnvironment();
  for (const check of environment) {
    console.log(formatCheck(check));
  }
  console.log("");

  console.log("Token Validation:");
  const tokenValidation = await checkTokenValidation();
  for (const check of tokenValidation) {
    console.log(formatCheck(check));
  }
  console.log("");

  console.log("API Connectivity:");
  const apiConnectivity = await checkApiConnectivity();
  for (const check of apiConnectivity) {
    console.log(formatCheck(check));
  }
  console.log("");

  console.log("Permissions:");
  const permissions = await checkPermissions();
  for (const check of permissions) {
    console.log(formatCheck(check));
  }
  console.log("");

  // Generate recommendations
  const recommendations = generateRecommendations({
    environment,
    tokenValidation,
    apiConnectivity,
    permissions,
  });

  console.log("Recommendations:");
  for (const rec of recommendations) {
    console.log(`  - ${rec}`);
  }
  console.log("");

  // Summary
  const allChecks = [
    ...environment,
    ...tokenValidation,
    ...apiConnectivity,
    ...permissions,
  ];
  const passCount = allChecks.filter((c) => c.status === "pass").length;
  const warnCount = allChecks.filter((c) => c.status === "warn").length;
  const failCount = allChecks.filter((c) => c.status === "fail").length;

  console.log("Summary:");
  console.log(`  ${passCount} passed, ${warnCount} warnings, ${failCount} failed`);
  console.log("");

  // Exit with error if there are failures
  if (failCount > 0) {
    process.exit(1);
  }
}
