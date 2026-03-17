import { useState } from "react";
import { useEvents } from "../context";
import DetailPanel from "../components/DetailPanel";

export default function Dashboard() {
  const { requests, connected, clear } = useEvents();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId
    ? requests.find((r) => r.id === selectedId)
    : undefined;

  return (
    <div className="app">
      <header className="header">
        <h1>airouter</h1>
        <div className="header-actions">
          <span
            className={`status ${connected ? "connected" : "disconnected"}`}
          >
            {connected ? "Connected" : "Disconnected"}
          </span>
          {requests.length > 0 && (
            <button onClick={clear} className="btn-clear">
              Clear
            </button>
          )}
        </div>
      </header>

      <div className="layout">
        <div className="panel-left">
          {requests.length === 0 ? (
            <div className="empty">
              <p>No requests yet. Waiting for traffic...</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Request ID</th>
                  <th>Model</th>
                  <th>Stream</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Tokens</th>
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
                    <td className="cell-mono cell-id">{req.id.slice(0, 8)}</td>
                    <td>{req.model || "-"}</td>
                    <td>{req.stream ? "yes" : "no"}</td>
                    <td>
                      <span className={`badge badge-${req.status}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="cell-mono">
                      {req.durationMs != null ? `${req.durationMs}ms` : "-"}
                    </td>
                    <td className="cell-mono">
                      {req.usage
                        ? `${req.usage.input_tokens} / ${req.usage.output_tokens}`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <DetailPanel
            request={selected}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
