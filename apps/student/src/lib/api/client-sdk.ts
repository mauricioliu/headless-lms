// One-time browser-side SDK configuration for client mutations. Server calls
// configure their own instance in server-call.ts.
//
// The browser has no `redirect()`, so a 401 surfaces as an `ApiError` like any
// other status and the caller decides what to do with it.
import { configureSdk } from "@headless-lms/sdk";

import { ApiError, responseMessage, responseStatus } from "./shared";

let configured = false;
export function ensureClientSdk(): void {
  if (configured) return;
  configureSdk({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
    onError: (error, response) =>
      new ApiError(responseStatus(response), responseMessage(error, response)),
  });
  configured = true;
}
