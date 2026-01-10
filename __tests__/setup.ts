/**
 * Jest test setup file.
 *
 * Runs before each test file.
 */

// Set test environment variables
process.env.META_ACCESS_TOKEN = "test_access_token_for_testing";
process.env.META_APP_ID = "test_app_id";
process.env.META_APP_SECRET = "test_app_secret";
process.env.META_MCP_LOG_LEVEL = "silent";
process.env.META_API_VERSION = "v23.0";
process.env.META_BASE_URL = "https://graph.facebook.com";

// Increase timeout for async tests
jest.setTimeout(10000);

// Mock console.error to reduce noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});
