/**
 * Validation and context tools for Meta MCP.
 *
 * Provides:
 * - get_account_context: Comprehensive account information in one call
 * - validate_campaign: Pre-creation campaign validation
 * - validate_ad_set: Pre-creation ad set validation
 * - validate_creative: Pre-creation creative validation
 * - summarize_errors: Human-readable error explanations
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MetaApiClient } from "../meta-client.js";
import {
  parseMetaApiError,
  getHumanReadableError,
  toSuccessEnvelope,
  toErrorEnvelope,
  formatToolResponse,
} from "../utils/error-handler.js";
import { ERROR_MESSAGES } from "../types/error-envelope.js";

/**
 * Valid campaign objectives.
 */
const VALID_OBJECTIVES = [
  "OUTCOME_APP_PROMOTION",
  "OUTCOME_AWARENESS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_TRAFFIC",
];

/**
 * Valid optimization goals.
 */
const VALID_OPTIMIZATION_GOALS = [
  "AD_RECALL_LIFT",
  "APP_INSTALLS",
  "BRAND_AWARENESS",
  "CLICKS",
  "CONVERSIONS",
  "IMPRESSIONS",
  "LANDING_PAGE_VIEWS",
  "LEAD_GENERATION",
  "LINK_CLICKS",
  "NONE",
  "OFFSITE_CONVERSIONS",
  "PAGE_LIKES",
  "POST_ENGAGEMENT",
  "REACH",
  "REPLIES",
  "RETURN_ON_AD_SPEND",
  "THRUPLAY",
  "VALUE",
  "VIDEO_VIEWS",
];

/**
 * Valid billing events.
 */
const VALID_BILLING_EVENTS = [
  "APP_INSTALLS",
  "CLICKS",
  "IMPRESSIONS",
  "LINK_CLICKS",
  "NONE",
  "PAGE_LIKES",
  "POST_ENGAGEMENT",
  "THRUPLAY",
  "PURCHASE",
];

/**
 * Valid call-to-action types.
 */
const VALID_CTA_TYPES = [
  "APPLY_NOW",
  "BOOK_TRAVEL",
  "BUY_NOW",
  "CONTACT_US",
  "DOWNLOAD",
  "GET_OFFER",
  "GET_QUOTE",
  "LEARN_MORE",
  "LISTEN_NOW",
  "ORDER_NOW",
  "PLAY_GAME",
  "SHOP_NOW",
  "SIGN_UP",
  "SUBSCRIBE",
  "WATCH_MORE",
];

/**
 * Special ad category requirements.
 */
const SPECIAL_AD_CATEGORIES = [
  "NONE",
  "EMPLOYMENT",
  "HOUSING",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
];

interface ValidationError {
  field: string;
  message: string;
  code: string;
}

interface ValidationWarning {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

/**
 * Register validation and context tools.
 */
export function registerValidationTools(
  server: McpServer,
  client: MetaApiClient
): void {
  // get_account_context tool
  server.tool(
    "get_account_context",
    "Get comprehensive account context in a single call: accounts, currency, timezone, permissions, and business info.",
    {
      account_id: z
        .string()
        .optional()
        .describe("Specific account ID (e.g., 'act_123456'), or omit for all accounts"),
    },
    async ({ account_id }) => {
      try {
        if (account_id) {
          // Get specific account details
          const account = await client.getAdAccount(account_id);
          const fundingSources = await client.getFundingSources(account_id);
          const business = await client.getAccountBusiness(account_id);

          // Get active campaigns count
          const campaigns = await client.getCampaigns(account_id, {
            status: "ACTIVE",
            limit: 1,
          });

          const accountContext = {
            id: account.id,
            name: account.name,
            currency: account.currency,
            timezone: account.timezone_name,
            status:
              account.account_status === 1
                ? "ACTIVE"
                : account.account_status === 2
                ? "DISABLED"
                : account.account_status === 3
                ? "UNSETTLED"
                : "PENDING",
            business: business?.id
              ? { id: business.id, name: business.name }
              : null,
            hasPaymentMethod: fundingSources.length > 0,
            activeCampaigns: campaigns.totalCount || 0,
          };

          return formatToolResponse(
            toSuccessEnvelope({
              accounts: [accountContext],
              total: 1,
              fetchedAt: new Date().toISOString(),
            })
          );
        } else {
          // Get all accounts
          const accounts = await client.getAdAccounts();

          const accountContexts = await Promise.all(
            accounts.slice(0, 10).map(async (account) => {
              try {
                const fundingSources = await client.getFundingSources(
                  account.id
                );

                return {
                  id: account.id,
                  name: account.name,
                  currency: account.currency,
                  timezone: account.timezone_name,
                  status:
                    account.account_status === 1
                      ? "ACTIVE"
                      : account.account_status === 2
                      ? "DISABLED"
                      : account.account_status === 3
                      ? "UNSETTLED"
                      : "PENDING",
                  business: account.business
                    ? { id: account.business.id, name: account.business.name }
                    : null,
                  hasPaymentMethod: fundingSources.length > 0,
                };
              } catch {
                return {
                  id: account.id,
                  name: account.name,
                  currency: account.currency,
                  timezone: account.timezone_name,
                  status: "UNKNOWN",
                  business: account.business
                    ? { id: account.business.id, name: account.business.name }
                    : null,
                  hasPaymentMethod: false,
                };
              }
            })
          );

          return formatToolResponse(
            toSuccessEnvelope({
              accounts: accountContexts,
              total: accounts.length,
              fetchedAt: new Date().toISOString(),
              note:
                accounts.length > 10
                  ? `Showing first 10 of ${accounts.length} accounts`
                  : undefined,
            })
          );
        }
      } catch (error) {
        return formatToolResponse(
          toErrorEnvelope(error as Error, { operation: "get_account_context" })
        );
      }
    }
  );

  // validate_campaign tool
  server.tool(
    "validate_campaign",
    "Validate campaign parameters before creation. Checks objective compatibility, budget requirements, and special ad categories.",
    {
      name: z.string().describe("Campaign name"),
      objective: z.string().describe("Campaign objective"),
      status: z
        .string()
        .optional()
        .default("PAUSED")
        .describe("Campaign status"),
      daily_budget: z.number().optional().describe("Daily budget in cents"),
      lifetime_budget: z
        .number()
        .optional()
        .describe("Lifetime budget in cents"),
      special_ad_categories: z
        .array(z.string())
        .optional()
        .describe("Special ad categories"),
      bid_strategy: z.string().optional().describe("Bid strategy"),
    },
    async (params) => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        suggestions: [],
      };

      // Validate objective
      if (!VALID_OBJECTIVES.includes(params.objective)) {
        result.valid = false;
        result.errors.push({
          field: "objective",
          message: `Invalid objective: ${params.objective}`,
          code: "INVALID_OBJECTIVE",
        });
        result.suggestions.push(
          `Valid objectives: ${VALID_OBJECTIVES.join(", ")}`
        );
      }

      // Validate budget
      if (!params.daily_budget && !params.lifetime_budget) {
        result.warnings.push({
          field: "budget",
          message: "No budget specified. Campaign will use ad set budgets.",
        });
      }

      if (params.daily_budget && params.daily_budget < 100) {
        result.warnings.push({
          field: "daily_budget",
          message:
            "Daily budget is less than $1. This may limit ad delivery.",
        });
      }

      // Validate special ad categories
      if (params.special_ad_categories) {
        for (const category of params.special_ad_categories) {
          if (!SPECIAL_AD_CATEGORIES.includes(category)) {
            result.valid = false;
            result.errors.push({
              field: "special_ad_categories",
              message: `Invalid special ad category: ${category}`,
              code: "INVALID_SPECIAL_AD_CATEGORY",
            });
          }
        }
      }

      // Validate name length
      if (params.name.length > 400) {
        result.valid = false;
        result.errors.push({
          field: "name",
          message: "Campaign name exceeds 400 character limit",
          code: "NAME_TOO_LONG",
        });
      }

      // Suggestions for best practices
      if (params.status === "ACTIVE") {
        result.suggestions.push(
          "Consider creating campaign as PAUSED first, then activating after review"
        );
      }

      return formatToolResponse(
        toSuccessEnvelope({
          validation: result,
          preview: {
            operation: "create_campaign",
            payload: params,
          },
        })
      );
    }
  );

  // validate_ad_set tool
  server.tool(
    "validate_ad_set",
    "Validate ad set parameters. Checks targeting spec, optimization goal compatibility, budget, and promoted object requirements.",
    {
      name: z.string().describe("Ad set name"),
      campaign_id: z.string().describe("Parent campaign ID"),
      optimization_goal: z.string().describe("Optimization goal"),
      billing_event: z.string().describe("Billing event"),
      daily_budget: z.number().optional().describe("Daily budget in cents"),
      lifetime_budget: z
        .number()
        .optional()
        .describe("Lifetime budget in cents"),
      targeting: z
        .object({
          age_min: z.number().optional(),
          age_max: z.number().optional(),
          genders: z.array(z.number()).optional(),
          geo_locations: z
            .object({
              countries: z.array(z.string()).optional(),
            })
            .optional(),
        })
        .optional()
        .describe("Targeting specification"),
      promoted_object: z
        .object({
          page_id: z.string().optional(),
          pixel_id: z.string().optional(),
        })
        .optional()
        .describe("Promoted object"),
    },
    async (params) => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        suggestions: [],
      };

      // Validate optimization goal
      if (!VALID_OPTIMIZATION_GOALS.includes(params.optimization_goal)) {
        result.valid = false;
        result.errors.push({
          field: "optimization_goal",
          message: `Invalid optimization goal: ${params.optimization_goal}`,
          code: "INVALID_OPTIMIZATION_GOAL",
        });
      }

      // Validate billing event
      if (!VALID_BILLING_EVENTS.includes(params.billing_event)) {
        result.valid = false;
        result.errors.push({
          field: "billing_event",
          message: `Invalid billing event: ${params.billing_event}`,
          code: "INVALID_BILLING_EVENT",
        });
      }

      // Validate budget
      if (!params.daily_budget && !params.lifetime_budget) {
        result.valid = false;
        result.errors.push({
          field: "budget",
          message: "Either daily_budget or lifetime_budget is required",
          code: "MISSING_BUDGET",
        });
      }

      // Validate targeting
      if (params.targeting) {
        if (
          params.targeting.age_min &&
          (params.targeting.age_min < 13 || params.targeting.age_min > 65)
        ) {
          result.warnings.push({
            field: "targeting.age_min",
            message: "Age minimum should be between 13 and 65",
          });
        }

        if (
          params.targeting.age_max &&
          params.targeting.age_max < (params.targeting.age_min || 18)
        ) {
          result.valid = false;
          result.errors.push({
            field: "targeting.age_max",
            message: "Age maximum must be greater than age minimum",
            code: "INVALID_AGE_RANGE",
          });
        }

        if (!params.targeting.geo_locations?.countries?.length) {
          result.warnings.push({
            field: "targeting.geo_locations",
            message:
              "No geographic targeting specified. Consider adding country targeting.",
          });
        }
      } else {
        result.valid = false;
        result.errors.push({
          field: "targeting",
          message: "Targeting specification is required",
          code: "MISSING_TARGETING",
        });
      }

      // Check promoted object for certain optimization goals
      const needsPromotedObject = [
        "CONVERSIONS",
        "OFFSITE_CONVERSIONS",
        "VALUE",
        "APP_INSTALLS",
      ];
      if (
        needsPromotedObject.includes(params.optimization_goal) &&
        !params.promoted_object
      ) {
        result.warnings.push({
          field: "promoted_object",
          message: `${params.optimization_goal} typically requires a promoted_object (pixel_id or page_id)`,
        });
      }

      return formatToolResponse(
        toSuccessEnvelope({
          validation: result,
          preview: {
            operation: "create_ad_set",
            payload: params,
          },
        })
      );
    }
  );

  // validate_creative tool
  server.tool(
    "validate_creative",
    "Validate ad creative parameters. Checks image specifications, text lengths, call-to-action compatibility, and link requirements.",
    {
      name: z.string().describe("Creative name"),
      page_id: z.string().describe("Facebook Page ID"),
      message: z.string().optional().describe("Primary text / message"),
      headline: z.string().optional().describe("Headline text"),
      description: z.string().optional().describe("Description text"),
      link_url: z.string().optional().describe("Destination URL"),
      image_url: z.string().optional().describe("Image URL"),
      image_hash: z.string().optional().describe("Image hash"),
      call_to_action: z
        .string()
        .optional()
        .describe("Call to action type"),
    },
    async (params) => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        suggestions: [],
      };

      // Validate page_id format
      if (!params.page_id.match(/^\d+$/)) {
        result.valid = false;
        result.errors.push({
          field: "page_id",
          message: "Page ID must be a numeric string",
          code: "INVALID_PAGE_ID",
        });
      }

      // Validate text lengths
      if (params.message && params.message.length > 2200) {
        result.valid = false;
        result.errors.push({
          field: "message",
          message: "Primary text exceeds 2200 character limit",
          code: "MESSAGE_TOO_LONG",
        });
      } else if (params.message && params.message.length > 125) {
        result.warnings.push({
          field: "message",
          message:
            "Primary text over 125 characters may be truncated on some placements",
        });
      }

      if (params.headline && params.headline.length > 255) {
        result.valid = false;
        result.errors.push({
          field: "headline",
          message: "Headline exceeds 255 character limit",
          code: "HEADLINE_TOO_LONG",
        });
      } else if (params.headline && params.headline.length > 40) {
        result.warnings.push({
          field: "headline",
          message:
            "Headline over 40 characters may be truncated on some placements",
        });
      }

      if (params.description && params.description.length > 255) {
        result.valid = false;
        result.errors.push({
          field: "description",
          message: "Description exceeds 255 character limit",
          code: "DESCRIPTION_TOO_LONG",
        });
      }

      // Validate call to action
      if (params.call_to_action) {
        if (!VALID_CTA_TYPES.includes(params.call_to_action)) {
          result.valid = false;
          result.errors.push({
            field: "call_to_action",
            message: `Invalid call to action: ${params.call_to_action}`,
            code: "INVALID_CTA",
          });
          result.suggestions.push(
            `Valid CTA types include: ${VALID_CTA_TYPES.slice(0, 5).join(", ")}, ...`
          );
        }

        // CTA requires link_url
        if (!params.link_url) {
          result.valid = false;
          result.errors.push({
            field: "link_url",
            message: "link_url is required when using call_to_action",
            code: "MISSING_LINK_URL",
          });
        }
      }

      // Validate image
      if (!params.image_url && !params.image_hash) {
        result.warnings.push({
          field: "image",
          message:
            "No image specified. Consider adding an image for better engagement.",
        });
      }

      if (params.image_url) {
        try {
          const url = new URL(params.image_url);
          if (!["http:", "https:"].includes(url.protocol)) {
            result.valid = false;
            result.errors.push({
              field: "image_url",
              message: "Image URL must use HTTP or HTTPS protocol",
              code: "INVALID_IMAGE_URL",
            });
          }
        } catch {
          result.valid = false;
          result.errors.push({
            field: "image_url",
            message: "Invalid image URL format",
            code: "INVALID_IMAGE_URL",
          });
        }
      }

      // Validate link_url
      if (params.link_url) {
        try {
          const url = new URL(params.link_url);
          if (!["http:", "https:"].includes(url.protocol)) {
            result.valid = false;
            result.errors.push({
              field: "link_url",
              message: "Link URL must use HTTP or HTTPS protocol",
              code: "INVALID_LINK_URL",
            });
          }
        } catch {
          result.valid = false;
          result.errors.push({
            field: "link_url",
            message: "Invalid link URL format",
            code: "INVALID_LINK_URL",
          });
        }
      }

      return formatToolResponse(
        toSuccessEnvelope({
          validation: result,
          preview: {
            operation: "create_ad_creative",
            payload: params,
          },
        })
      );
    }
  );

  // summarize_errors tool
  server.tool(
    "summarize_errors",
    "Convert Meta API error responses to human-readable explanations with suggested fixes.",
    {
      error_response: z
        .string()
        .describe("The raw error response or message from a previous API call"),
      context: z
        .string()
        .optional()
        .describe("What operation was being attempted"),
    },
    async ({ error_response, context }) => {
      try {
        // Try to parse as JSON
        let errorData: unknown;
        try {
          errorData = JSON.parse(error_response);
        } catch {
          // Not JSON, treat as plain error message
          errorData = { error: { message: error_response, code: 0 } };
        }

        const parsed = parseMetaApiError(errorData);

        if (!parsed) {
          return formatToolResponse(
            toSuccessEnvelope({
              summary: "Unable to parse error response",
              original: error_response,
              suggestions: [
                "Check if the error response is in a valid format",
                "Try the operation again and capture the full error",
              ],
            })
          );
        }

        const humanMessage = getHumanReadableError(parsed);

        // Generate likely causes based on error code
        const likelyCauses: string[] = [];
        const suggestedFixes: string[] = [];

        switch (parsed.code) {
          case 17:
          case 4:
          case 613:
            likelyCauses.push("API rate limit exceeded");
            suggestedFixes.push("Wait a few minutes before retrying");
            suggestedFixes.push("Reduce the frequency of API calls");
            suggestedFixes.push(
              "Consider using batch requests to reduce call count"
            );
            break;
          case 190:
            likelyCauses.push("Access token expired or invalid");
            likelyCauses.push("Token was revoked");
            suggestedFixes.push(
              "Generate a new access token using the OAuth flow"
            );
            suggestedFixes.push("Check if token has required permissions");
            break;
          case 200:
          case 10:
            likelyCauses.push("Insufficient permissions");
            likelyCauses.push("Token doesn't have access to this resource");
            suggestedFixes.push(
              "Request ads_management permission for write operations"
            );
            suggestedFixes.push("Verify you have access to this ad account");
            break;
          case 100:
            likelyCauses.push("Invalid parameter value");
            likelyCauses.push("Missing required parameter");
            likelyCauses.push("Parameter format is incorrect");
            suggestedFixes.push("Check the parameter values against the API documentation");
            suggestedFixes.push("Ensure all required fields are provided");
            break;
          default:
            likelyCauses.push("Unknown error occurred");
            suggestedFixes.push("Check the Meta API documentation for error code details");
            suggestedFixes.push("Try the operation again");
        }

        // Add context-specific suggestions
        if (context) {
          if (context.toLowerCase().includes("campaign")) {
            suggestedFixes.push(
              "Use validate_campaign to check parameters before creation"
            );
          }
          if (context.toLowerCase().includes("ad set")) {
            suggestedFixes.push(
              "Use validate_ad_set to check parameters before creation"
            );
          }
          if (context.toLowerCase().includes("creative")) {
            suggestedFixes.push(
              "Use validate_creative to check parameters before creation"
            );
          }
        }

        // Get documentation link
        const documentationLinks: Record<number, string> = {
          17: "https://developers.facebook.com/docs/marketing-api/error-reference",
          100: "https://developers.facebook.com/docs/marketing-api/error-reference",
          190: "https://developers.facebook.com/docs/facebook-login/access-tokens/debugging-and-error-handling",
          200: "https://developers.facebook.com/docs/marketing-api/error-reference#permissions",
        };

        return formatToolResponse(
          toSuccessEnvelope({
            summary: humanMessage,
            technicalDetails: {
              code: parsed.code,
              subcode: parsed.subcode,
              type: parsed.type,
              fbtraceId: parsed.fbtraceId,
            },
            context: context || "Not specified",
            likelyCauses,
            suggestedFixes,
            documentation:
              documentationLinks[parsed.code] ||
              "https://developers.facebook.com/docs/marketing-api/error-reference",
            isRetryable: parsed.isTransient,
            retryAfterMs: parsed.retryAfterMs,
          })
        );
      } catch (error) {
        return formatToolResponse(
          toErrorEnvelope(error as Error, { operation: "summarize_errors" })
        );
      }
    }
  );
}
