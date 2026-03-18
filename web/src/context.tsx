import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { MonitorEvent, RequestRecord } from "./types";

interface EventContextType {
  requests: RequestRecord[];
  connected: boolean;
  getRequest: (id: string) => RequestRecord | undefined;
  clear: () => void;
}

const EventContext = createContext<EventContextType>({
  requests: [],
  connected: false,
  getRequest: () => undefined,
  clear: () => {},
});

export function useEvents() {
  return useContext(EventContext);
}

export function EventProvider({ children }: { children: ReactNode }) {
  const [requestMap, setRequestMap] = useState<Map<string, RequestRecord>>(
    new Map(),
  );
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number>(0);

  const processEvent = useCallback((event: MonitorEvent) => {
    setRequestMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(event.request_id);

      switch (event.kind) {
        case "request.received":
          next.set(event.request_id, {
            id: event.request_id,
            timestamp: event.timestamp,
            inputModel: event.data?.input_model as string,
            outputModel: event.data?.output_model as string,
            stream: (event.data?.body as Record<string, unknown>)
              ?.stream as boolean,
            status: "pending",
            requestData: event.data,
            events: [event],
          });
          break;

        case "response.chunk":
          if (existing) {
            next.set(event.request_id, {
              ...existing,
              status: "streaming",
              events: [...existing.events, event],
            });
          }
          break;

        case "response.completed":
          if (existing) {
            next.set(event.request_id, {
              ...existing,
              status: "completed",
              durationMs: event.data?.duration_ms as number,
              usage: event.data?.usage as {
                input_tokens: number;
                output_tokens: number;
              },
              responseData: event.data,
              events: [...existing.events, event],
            });
          }
          break;

        case "response.error":
          if (existing) {
            next.set(event.request_id, {
              ...existing,
              status: "error",
              durationMs: event.data?.duration_ms as number,
              responseData: event.data,
              events: [...existing.events, event],
            });
          }
          break;
      }

      return next;
    });
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = window.setTimeout(connect, 2000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as MonitorEvent;
        if (event.request_id) {
          processEvent(event);
        }
      } catch {
        // ignore non-JSON messages (e.g. hello)
      }
    };

    wsRef.current = ws;
  }, [processEvent]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const requests = Array.from(requestMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const getRequest = useCallback(
    (id: string) => requestMap.get(id),
    [requestMap],
  );

  const clear = useCallback(() => setRequestMap(new Map()), []);

  return (
    <EventContext.Provider value={{ requests, connected, getRequest, clear }}>
      {children}
    </EventContext.Provider>
  );
}
