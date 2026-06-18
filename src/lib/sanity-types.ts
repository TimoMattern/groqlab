export interface ConnectionConfig {
  id: string;
  name: string;
  projectId: string;
  dataset: string;
  createdAt: string;
}

export type ConnectionStatusValue = "unknown" | "checking" | "online" | "error";

export interface ConnectionStatus {
  status: ConnectionStatusValue;
  error?: string;
  lastChecked?: string;
}

export interface QueryResult {
  data: unknown;
  durationMs: number;
  documentCount: number;
}

export interface SchemaType {
  name: string;
  title?: string;
  fields: SchemaField[];
}

export interface SchemaField {
  name: string;
  type: string;
  isArray: boolean;
  isReference: boolean;
  fields?: SchemaField[];
}

export interface HistoryEntry {
  id: string;
  query: string;
  connectionId: string;
  connectionName: string;
  executedAt: string;
  durationMs: number;
  documentCount: number;
  success: boolean;
  error?: string;
  resultPreview?: string;
}
