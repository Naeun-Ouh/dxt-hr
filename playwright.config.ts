import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "*.spec.ts", fullyParallel: false, workers: 1,
  use: { baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1308 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }, trace: "retain-on-failure" },
  webServer: [
    { command: "node --import tsx tests/e2e/mock-supabase.ts", url: "http://localhost:54329/health", reuseExistingServer: false },
    { command: "npm run start -- --port 3100", url: "http://localhost:3100/login", reuseExistingServer: false,
      env: { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54329", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key", APP_ORIGIN: "http://localhost:3100" } },
  ],
});
