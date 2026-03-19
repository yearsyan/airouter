export interface MonitorEvent {
  kind: string;
  timestamp: string;
  request_id: string;
  data: Record<string, unknown>;
}

export interface RequestRecord {
  id: string;
  timestamp: string;
  inputModel?: string;
  outputModel?: string;
  stream?: boolean;
  status: "pending" | "streaming" | "completed" | "error";
  durationMs?: number;
  ttftMs?: number;
  usage?: { input_tokens: number; output_tokens: number };
  requestData?: Record<string, unknown>;
  responseData?: Record<string, unknown>;
  events: MonitorEvent[];
}

export interface Provider {
  name: string;
  upstream_url: string;
  auth_header: string;
  has_api_key: boolean;
  models: string[];
}

export interface DefaultModel {
  provider: string;
  model: string;
}

export interface ModelRoute {
  input_model: string;
  provider: string;
  model: string;
}
