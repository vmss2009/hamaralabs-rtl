import posthog from "posthog-js"

posthog.init("phc_kajFsDjIrM1IS9HZDqvhfxMnGxNm4PWJKuuzq2jVace", {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  defaults: '2025-05-24',
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking
  debug: process.env.NODE_ENV === "development",
});
