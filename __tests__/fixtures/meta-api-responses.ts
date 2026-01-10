/**
 * Mock fixtures for Meta API responses.
 *
 * Uses @faker-js/faker for generating realistic test data.
 */

import { faker } from "@faker-js/faker";

/**
 * Create a mock campaign.
 */
export function createMockCampaign(overrides?: Partial<MockCampaign>): MockCampaign {
  return {
    id: faker.string.numeric(15),
    name: faker.company.catchPhrase(),
    objective: "OUTCOME_TRAFFIC",
    status: "ACTIVE",
    effective_status: "ACTIVE",
    created_time: faker.date.past().toISOString(),
    updated_time: faker.date.recent().toISOString(),
    daily_budget: faker.number.int({ min: 100, max: 10000 }).toString(),
    account_id: `act_${faker.string.numeric(10)}`,
    ...overrides,
  };
}

interface MockCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  effective_status: string;
  created_time: string;
  updated_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
  account_id: string;
}

/**
 * Create a mock ad set.
 */
export function createMockAdSet(overrides?: Partial<MockAdSet>): MockAdSet {
  return {
    id: faker.string.numeric(15),
    name: `Ad Set - ${faker.commerce.product()}`,
    campaign_id: faker.string.numeric(15),
    status: "ACTIVE",
    effective_status: "ACTIVE",
    created_time: faker.date.past().toISOString(),
    updated_time: faker.date.recent().toISOString(),
    daily_budget: faker.number.int({ min: 100, max: 5000 }).toString(),
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    targeting: {
      age_min: 18,
      age_max: 65,
      geo_locations: {
        countries: ["US"],
      },
    },
    ...overrides,
  };
}

interface MockAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  created_time: string;
  updated_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal: string;
  billing_event: string;
  targeting: MockTargeting;
}

interface MockTargeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
  };
}

/**
 * Create a mock ad account.
 */
export function createMockAdAccount(overrides?: Partial<MockAdAccount>): MockAdAccount {
  return {
    id: `act_${faker.string.numeric(10)}`,
    name: faker.company.name(),
    account_status: 1,
    currency: "USD",
    timezone_name: "America/Los_Angeles",
    balance: faker.number.int({ min: 0, max: 10000 }).toString(),
    business: {
      id: faker.string.numeric(15),
      name: faker.company.name(),
    },
    ...overrides,
  };
}

interface MockAdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  balance: string;
  business?: {
    id: string;
    name: string;
  };
}

/**
 * Create a mock Meta API error.
 */
export function createMockMetaError(
  code: number,
  message: string,
  subcode?: number
): MockMetaApiError {
  return {
    error: {
      code,
      message,
      type: code === 190 ? "OAuthException" : "FacebookApiException",
      error_subcode: subcode,
      fbtrace_id: faker.string.alphanumeric(22),
    },
  };
}

interface MockMetaApiError {
  error: {
    code: number;
    message: string;
    type: string;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

/**
 * Pre-built error fixtures.
 */
export const mockRateLimitError = createMockMetaError(
  17,
  "User request limit reached",
  2446079
);

export const mockAuthError = createMockMetaError(
  190,
  "Error validating access token: Session has expired"
);

export const mockPermissionError = createMockMetaError(
  200,
  "(#200) Permissions error"
);

export const mockValidationError = createMockMetaError(
  100,
  "Invalid parameter",
  1366046
);

export const mockAppLimitError = createMockMetaError(
  4,
  "Application request limit reached",
  1504022
);

/**
 * Create a mock paginated response.
 */
export function createMockPaginatedResponse<T>(
  data: T[],
  hasNextPage = false
): MockPaginatedResponse<T> {
  return {
    data,
    paging: hasNextPage
      ? {
          cursors: {
            before: faker.string.alphanumeric(20),
            after: faker.string.alphanumeric(20),
          },
          next: `https://graph.facebook.com/v23.0/next?after=${faker.string.alphanumeric(20)}`,
        }
      : {
          cursors: {
            before: faker.string.alphanumeric(20),
            after: faker.string.alphanumeric(20),
          },
        },
  };
}

interface MockPaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}

/**
 * Create mock insights data.
 */
export function createMockInsights(): MockInsights {
  return {
    impressions: faker.number.int({ min: 1000, max: 100000 }).toString(),
    clicks: faker.number.int({ min: 10, max: 5000 }).toString(),
    spend: faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }).toString(),
    reach: faker.number.int({ min: 500, max: 50000 }).toString(),
    ctr: faker.number.float({ min: 0.5, max: 5, fractionDigits: 2 }).toString(),
    cpc: faker.number.float({ min: 0.1, max: 5, fractionDigits: 2 }).toString(),
    cpm: faker.number.float({ min: 1, max: 20, fractionDigits: 2 }).toString(),
    date_start: faker.date.past().toISOString().split("T")[0],
    date_stop: faker.date.recent().toISOString().split("T")[0],
  };
}

interface MockInsights {
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  ctr: string;
  cpc: string;
  cpm: string;
  date_start: string;
  date_stop: string;
}
