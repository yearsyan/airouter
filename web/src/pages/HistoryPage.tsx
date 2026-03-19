import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "../App";
import DetailPanel from "../components/DetailPanel";
import type { RequestRecord } from "../types";

const MIN_PANEL = 320;
const MAX_PANEL = 960;
const DEFAULT_PANEL = 520;

interface HistoryEntry {
  time: string;
  request_id: string;
  key_name: string;
  input_model: string;
  output_model: string;
  ttft_ms: string;
  tps: string;
  input_tokens: string;
  output_tokens: string;
  user_agent: string;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL);
  const dragging = useRef(false);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/history");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setError(null);
    } catch (e) {
      setError(`Failed to load history: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const res = await fetch(`/api/history/${id}`);
      if (!res.ok) {
        setDetail(null);
        return;
      }
      const log = await res.json();
      setDetail(logToRecord(log));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, fetchDetail]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = panelWidth;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const w = startW - (ev.clientX - startX);
        setPanelWidth(Math.max(MIN_PANEL, Math.min(MAX_PANEL, w)));
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panelWidth],
  );

  return (
    <div className="app">
      <Header>
        <button onClick={fetchHistory} className="btn-clear">
          Refresh
        </button>
      </Header>

      <div className="layout">
        <div className="panel-left">
          {error && <div className="routes-error">{error}</div>}
          {loading ? (
            <div className="empty">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="empty">
              <p>No history yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Key</th>
                  <th>Input Model</th>
                  <th>Output Model</th>
                  <th>TTFT</th>
                  <th>Tokens</th>
                  <th>TPS</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.request_id}
                    className={
                      selectedId === entry.request_id ? "selected" : ""
                    }
                    onClick={() =>
                      setSelectedId(
                        selectedId === entry.request_id
                          ? null
                          : entry.request_id,
                      )
                    }
                  >
                    <td className="cell-mono">{formatTime(entry.time)}</td>
                    <td>{entry.key_name || "-"}</td>
                    <td>{entry.input_model || "-"}</td>
                    <td>
                      {entry.output_model &&
                      entry.output_model !== entry.input_model ? (
                        <span className="model-redirected">
                          {entry.output_model}
                        </span>
                      ) : (
                        entry.output_model || "-"
                      )}
                    </td>
                    <td className="cell-mono">
                      {entry.ttft_ms && Number(entry.ttft_ms) > 0
                        ? `${entry.ttft_ms}ms`
                        : "-"}
                    </td>
                    <td className="cell-mono">
                      {entry.input_tokens && entry.output_tokens
                        ? `${entry.input_tokens} / ${entry.output_tokens}`
                        : "-"}
                    </td>
                    <td className="cell-mono">
                      {entry.tps && Number(entry.tps) > 0
                        ? Number(entry.tps).toFixed(1)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedId && (
          <>
            <div className="resize-handle" onMouseDown={onMouseDown} />
            {detailLoading ? (
              <div className="panel-right" style={{ width: panelWidth }}>
                <div className="empty">Loading...</div>
              </div>
            ) : detail ? (
              <DetailPanel
                request={detail}
                onClose={() => setSelectedId(null)}
                width={panelWidth}
              />
            ) : (
              <div className="panel-right" style={{ width: panelWidth }}>
                <div className="panel-right-header">
                  <span className="panel-right-title">
                    {selectedId.slice(0, 8)}
                  </span>
                  <button
                    className="btn-close"
                    onClick={() => setSelectedId(null)}
                  >
                    &times;
                  </button>
                </div>
                <div className="panel-right-body">
                  <div className="empty-sm">
                    Detail log not available for this request.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function logToRecord(log: Record<string, unknown>): RequestRecord {
  const responseData = log.response_data as
    | Record<string, unknown>
    | undefined;
  const usage = responseData?.usage as
    | { input_tokens: number; output_tokens: number }
    | undefined;
  return {
    id: (log.id as string) ?? "",
    timestamp: (log.timestamp as string) ?? "",
    inputModel: log.input_model as string | undefined,
    outputModel: log.output_model as string | undefined,
    stream: log.stream as boolean | undefined,
    status: responseData?.error ? "error" : "completed",
    durationMs: responseData?.duration_ms as number | undefined,
    ttftMs: responseData?.ttft_ms as number | undefined,
    usage,
    requestData: log.request_data as Record<string, unknown> | undefined,
    responseData,
    events: [],
  };
}

function formatTime(time: string): string {
  try {
    return new Date(time).toLocaleString();
  } catch {
    return time;
  }
}
