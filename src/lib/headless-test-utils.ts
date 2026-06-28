import { HeadlessDriver } from "./headless-driver";

export function createTestDriver(baseUrl?: string): HeadlessDriver {
  return new HeadlessDriver({ baseUrl: baseUrl ?? "http://localhost:3000" });
}
