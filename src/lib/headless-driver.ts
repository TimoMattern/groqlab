import type { QueryResult, SchemaType } from "@/lib/sanity-types";

export interface CompletionOption {
  label: string;
  type?: string;
  detail?: string;
  apply?: string;
  boost?: number;
}

export interface CompletionResult {
  from: number;
  options: CompletionOption[];
}

export interface HeadlessResponse {
  data?: unknown;
  error?: string;
  commandId: string;
  durationMs: number;
}

export interface ConnectionArgs {
  projectId: string;
  dataset: string;
  token?: string;
}

export class HeadlessDriver {
  private baseUrl: string;

  constructor(options?: { baseUrl?: string }) {
    this.baseUrl = (options?.baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  }

  private async request(command: string, args: Record<string, unknown> = {}): Promise<HeadlessResponse> {
    const response = await fetch(`${this.baseUrl}/api/headless`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args }),
    });
    const json: HeadlessResponse = await response.json();
    if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
    return json;
  }

  async executeCommand(command: string, args: Record<string, unknown> = {}): Promise<HeadlessResponse> {
    return this.request(command, args);
  }

  async query(groq: string, connection: ConnectionArgs, params?: Record<string, unknown>): Promise<QueryResult> {
    const { data } = await this.request("query.execute", { query: groq, params, connection });
    return data as QueryResult;
  }

  async testConnection(projectId: string, dataset: string): Promise<{ success: boolean; error?: string }> {
    const { data } = await this.request("connection.test", { projectId, dataset });
    return data as { success: boolean; error?: string };
  }

  async fetchSchema(connection: ConnectionArgs): Promise<SchemaType[]> {
    const { data } = await this.request("schema.fetch", { connection });
    return data as SchemaType[];
  }

  async autocomplete(before: string, types?: SchemaType[]): Promise<CompletionResult> {
    const { data } = await this.request("autocomplete.trigger", { before, types });
    return data as CompletionResult;
  }
}
