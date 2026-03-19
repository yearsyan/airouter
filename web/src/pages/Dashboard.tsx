import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEvents } from "../context";
import { Header } from "../App";
import DetailPanel from "../components/DetailPanel";

const MIN_PANEL = 320;
const MAX_PANEL = 960;
const DEFAULT_PANEL = 520;

export default function Dashboard() {
  const { t } = useTranslation();
  const { requests, connected, clear } = useEvents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL);
  const dragging = useRef(false);

  const selected = selectedId
    ? requests.find((r) => r.id === selectedId)
    : undefined;

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
        <span
          className={`status ${connected ? "connected" : "disconnected"}`}
        >
          {connected ? t("status.connected") : t("status.disconnected")}
        </span>
        {requests.length > 0 && (
          <button onClick={clear} className="btn-clear">
            {t("common.clear")}
          </button>
        )}
      </Header>

      <div className="layout">
        <div className="panel-left">
          {requests.length === 0 ? (
            <div className="empty">
              <p>{t("monitor.noRequests")}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("monitor.time")}</th>
                  <th>{t("monitor.inputModel")}</th>
                  <th>{t("monitor.outputModel")}</th>
                  <th>{t("monitor.stream")}</th>
                  <th>{t("monitor.status")}</th>
                  <th>{t("monitor.duration")}</th>
                  <th>{t("monitor.ttft")}</th>
                  <th>{t("monitor.tokens")}</th>
                  <th>{t("monitor.tps")}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className={selectedId === req.id ? "selected" : ""}
                    onClick={() =>
                      setSelectedId(selectedId === req.id ? null : req.id)
                    }
                  >
                    <td className="cell-mono">
                      {new Date(req.timestamp).toLocaleTimeString()}
                    </td>
                    <td>{req.inputModel || "-"}</td>
                    <td>
                      {req.outputModel && req.outputModel !== req.inputModel ? (
                        <span className="model-redirected">
                          {req.outputModel}
                        </span>
                      ) : (
                        req.outputModel || "-"
                      )}
                    </td>
                    <td>{req.stream ? t("common.yes") : t("common.no")}</td>
                    <td>
                      <span className={`badge badge-${req.status}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="cell-mono">
                      {req.durationMs != null ? `${req.durationMs}ms` : "-"}
                    </td>
                    <td className="cell-mono">
                      {req.ttftMs != null && req.ttftMs > 0 ? `${req.ttftMs}ms` : "-"}
                    </td>
                    <td className="cell-mono">
                      {req.usage
                        ? `${req.usage.input_tokens} / ${req.usage.output_tokens}`
                        : "-"}
                    </td>
                    <td className="cell-mono">
                      {(() => {
                        if (!req.usage || !req.durationMs) return "-";
                        const genMs = req.durationMs - (req.ttftMs ?? 0);
                        if (genMs <= 0) return "-";
                        return (req.usage.output_tokens / (genMs / 1000)).toFixed(1);
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <>
            <div className="resize-handle" onMouseDown={onMouseDown} />
            <DetailPanel
              request={selected}
              onClose={() => setSelectedId(null)}
              width={panelWidth}
            />
          </>
        )}
      </div>
    </div>
  );
}
