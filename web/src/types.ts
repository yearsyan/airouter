export interface MonitorEvent {
  kind: string;
  timestamp: string;
  request_id: string;
  data: Record<string, unknown>;
}

export interface RequestRecord {
  id: string;
  timestamp: string;
  model?: string;
  stream?: boolean;
  status: "pending" | "streaming" | "completed" | "error";
  durationMs?: number;
  usage?: { input_tokens: number; output_tokens: number };
  requestData?: Record<string, unknown>;
  responseData?: Record<string, unknown>;
  events: MonitorEvent[];
}
