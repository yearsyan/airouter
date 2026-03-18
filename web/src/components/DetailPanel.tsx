import React, { useState } from "react";
import type { RequestRecord } from "../types";
import JsonView from "./JsonView";
import ResponseView, { type ContentBlock } from "./ResponseView";

interface Props {
  request: RequestRecord;
  onClose: () => void;
  width: number;
}

type Tab = "overview" | "content" | "request" | "response" | "events";

function getContentBlocks(request: RequestRecord): unknown[] {
  // Streaming: content_blocks parsed by backend
  const fromStream = request.responseData?.content_blocks;
  if (Array.isArray(fromStream) && fromStream.length > 0) return fromStream;

  // Non-streaming: body.content from API response
  const body = request.responseData?.body;
  if (body && typeof body === "object") {
    const content = (body as Record<string, unknown>).content;
    if (Array.isArray(content) && content.length > 0) return content;
  }

  return [];
}

export default function DetailPanel({ request, onClose, width }: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  const reqHeaders = request.requestData?.headers as
    | Record<string, string>
    | undefined;
  const reqBody = request.requestData?.body;

  const respStatus = request.responseData?.status as number | undefined;
  const respHeaders = request.responseData?.headers as
    | Record<string, string>
    | undefined;
  const respBody = request.responseData?.body;
  const respText = request.responseData?.text;

  const contentBlocks = getContentBlocks(request);
  const hasContent = contentBlocks.length > 0;

  const tabs: Tab[] = hasContent
    ? ["overview", "content", "request", "response", "events"]
    : ["overview", "request", "response", "events"];

  return (
    <div className="panel-right" style={{ width }}>
      <div className="panel-right-header">
        <span className="panel-right-title">
          {request.id.slice(0, 8)}
          <span className={`badge badge-${request.status}`}>
            {request.status}
          </span>
        </span>
        <button className="btn-close" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "events" ? `events (${request.events.length})` : t}
          </button>
        ))}
      </div>

      <div className="panel-right-body">
        {tab === "overview" && (
          <div className="detail-meta">
            <Row label="ID" value={request.id} mono />
            <Row
              label="Time"
              value={new Date(request.timestamp).toLocaleString()}
            />
            {request.inputModel && (
              <Row label="Input Model" value={request.inputModel} />
            )}
            {request.outputModel && (
              <Row label="Output Model" value={request.outputModel} />
            )}
            {request.stream != null && (
              <Row label="Stream" value={request.stream ? "yes" : "no"} />
            )}
            {respStatus != null && (
              <Row label="HTTP Status" value={String(respStatus)} mono />
            )}
            {request.durationMs != null && (
              <Row label="Duration" value={`${request.durationMs}ms`} mono />
            )}
            {request.usage && (
              <>
                <Row
                  label="Input Tokens"
                  value={String(request.usage.input_tokens)}
                  mono
                />
                <Row
                  label="Output Tokens"
                  value={String(request.usage.output_tokens)}
                  mono
                />
              </>
            )}
          </div>
        )}

        {tab === "content" && (
          <ResponseView blocks={contentBlocks as ContentBlock[]} />
        )}

        {tab === "request" && (
          <>
            {reqHeaders && (
              <Section title="Headers">
                <HeadersTable headers={reqHeaders} />
              </Section>
            )}
            <Section title="Body">
              <JsonView data={reqBody} />
            </Section>
          </>
        )}

        {tab === "response" && (
          <>
            {respStatus != null && (
              <div className="detail-meta" style={{ marginBottom: 12 }}>
                <Row label="Status" value={String(respStatus)} mono />
              </div>
            )}
            {respHeaders && (
              <Section title="Headers">
                <HeadersTable headers={respHeaders} />
              </Section>
            )}
            {respText && (
              <Section title="Text">
                <pre className="code-block">{String(respText)}</pre>
              </Section>
            )}
            {respBody && (
              <Section title="Body">
                <JsonView data={respBody} />
              </Section>
            )}
            {!respStatus && !respHeaders && !respBody && !respText && (
              <div className="empty-sm">No response data yet.</div>
            )}
          </>
        )}

        {tab === "events" && (
          <div className="event-timeline">
            {request.events.map((event, i) => (
              <div key={i} className="event-item">
                <div className="event-item-header">
                  <span className="event-kind">{event.kind}</span>
                  <span className="event-time">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <JsonView data={event.data} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className={mono ? "cell-mono" : ""}>{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="detail-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <div className="empty-sm">No headers</div>;

  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    key: string;
    value: string;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, key: string, value: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, key, value });
  };

  const closeMenu = () => setCtxMenu(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    closeMenu();
  };

  React.useEffect(() => {
    if (!ctxMenu) return;
    const onClick = () => closeMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  return (
    <>
      <table className="headers-table">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} onContextMenu={(e) => handleContextMenu(e, k, v)}>
              <td className="header-name">{k}</td>
              <td className="header-value">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => copyToClipboard(ctxMenu.key)}>
            Copy Name
          </button>
          <button onClick={() => copyToClipboard(ctxMenu.value)}>
            Copy Value
          </button>
          <button onClick={() => copyToClipboard(`${ctxMenu.key}: ${ctxMenu.value}`)}>
            Copy Entry
          </button>
        </div>
      )}
    </>
  );
}
