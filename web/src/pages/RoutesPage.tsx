import { useState, useEffect, useCallback } from "react";
import { Header } from "../App";
import type { ModelRoute } from "../types";

export default function RoutesPage() {
  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await fetch("/api/routes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRoutes(data.routes ?? []);
      setError(null);
    } catch (e) {
      setError(`Failed to load routes: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  return (
    <div className="app">
      <Header />

      <div className="routes-page">
        <div className="routes-header">
          <h2>Model Routes</h2>
          <span className="routes-readonly">Configured via config.yml</span>
        </div>

        {error && <div className="routes-error">{error}</div>}

        {loading ? (
          <div className="empty">Loading...</div>
        ) : (
          <table className="routes-table">
            <thead>
              <tr>
                <th>Input Model</th>
                <th>Output Model</th>
                <th>Upstream URL</th>
                <th>API Key</th>
                <th>Auth</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route, i) => (
                <tr key={i}>
                  <td className="cell-mono">{route.input_model}</td>
                  <td className="cell-mono">{route.output_model}</td>
                  <td className="cell-mono cell-url">{route.upstream_url}</td>
                  <td className="cell-mono">
                    {route.api_key ? "****" : "-"}
                  </td>
                  <td className="cell-mono">
                    {route.auth_header || "authorization"}
                  </td>
                </tr>
              ))}
              {routes.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-sm">
                    No routes configured. All requests go to the default
                    upstream.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
