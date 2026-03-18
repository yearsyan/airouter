import { useState } from "react";
import JsonView from "./JsonView";
import { useTextModal } from "./TextModal";

interface Props {
  body: Record<string, unknown>;
}

export default function RequestView({ body }: Props) {
  const model = body.model as string | undefined;
  const system = body.system;
  const tools = body.tools as Tool[] | undefined;
  const messages = body.messages as Message[] | undefined;
  const maxTokens = body.max_tokens as number | undefined;
  const temperature = body.temperature as number | undefined;
  const topP = body.top_p as number | undefined;
  const topK = body.top_k as number | undefined;
  const stream = body.stream as boolean | undefined;

  return (
    <div className="rv">
      <div className="rv-params">
        {model && <span className="rv-chip">model: {model}</span>}
        {maxTokens != null && (
          <span className="rv-chip">max_tokens: {maxTokens}</span>
        )}
        {temperature != null && (
          <span className="rv-chip">temperature: {temperature}</span>
        )}
        {topP != null && <span className="rv-chip">top_p: {topP}</span>}
        {topK != null && <span className="rv-chip">top_k: {topK}</span>}
        {stream != null && (
          <span className="rv-chip">stream: {String(stream)}</span>
        )}
      </div>

      {system != null && <SystemSection system={system} />}

      {tools && tools.length > 0 && <ToolsSection tools={tools} />}

      {messages && messages.length > 0 && (
        <MessagesSection messages={messages} />
      )}
    </div>
  );
}

/* ── System prompt ─────────────────────────────────── */

function SystemSection({ system }: { system: unknown }) {
  const [open, setOpen] = useState(true);
  const modal = useTextModal();

  const text =
    typeof system === "string"
      ? system
      : Array.isArray(system)
        ? system
            .filter(
              (b: { type?: string }) =>
                typeof b === "object" && b?.type === "text",
            )
            .map((b: { text?: string }) => b.text ?? "")
            .join("\n")
        : JSON.stringify(system);

  return (
    <div className="rv-section rv-system">
      <div className="rv-section-header" onClick={() => setOpen(!open)}>
        <span className="cb-arrow">{open ? "\u25BC" : "\u25B6"}</span>
        <span className="rv-section-title">System</span>
      </div>
      {open && (
        <div className="rv-section-body">
          <pre className="rv-text">{text}</pre>
          {text.length > 500 && (
            <button
              className="jv-expand-btn cb-expand"
              onClick={() => modal.show("System Prompt", text)}
            >
              show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tools ─────────────────────────────────────────── */

interface Tool {
  name?: string;
  description?: string;
  input_schema?: unknown;
  [key: string]: unknown;
}

function ToolsSection({ tools }: { tools: Tool[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rv-section rv-tools">
      <div className="rv-section-header" onClick={() => setOpen(!open)}>
        <span className="cb-arrow">{open ? "\u25BC" : "\u25B6"}</span>
        <span className="rv-section-title">Tools ({tools.length})</span>
        {!open && (
          <span className="rv-tools-preview">
            {tools.map((t) => t.name).join(", ")}
          </span>
        )}
      </div>
      {open && (
        <div className="rv-section-body">
          {tools.map((tool, i) => (
            <ToolItem key={i} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolItem({ tool }: { tool: Tool }) {
  const [showSchema, setShowSchema] = useState(false);

  return (
    <div className="rv-tool-item">
      <div className="rv-tool-header">
        <span className="rv-tool-name">{tool.name}</span>
        {tool.description && (
          <span className="rv-tool-desc">{tool.description}</span>
        )}
      </div>
      {tool.input_schema != null && (
        <>
          <button
            className="jv-expand-btn"
            onClick={() => setShowSchema(!showSchema)}
          >
            {showSchema ? "hide schema" : "show schema"}
          </button>
          {showSchema && (
            <div className="rv-tool-schema">
              <JsonView data={tool.input_schema} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Messages / conversation ───────────────────────── */

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  id?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  source?: unknown;
  thinking?: string;
  [key: string]: unknown;
}

interface Message {
  role?: string;
  content?: string | ContentBlock[];
  [key: string]: unknown;
}

function MessagesSection({ messages }: { messages: Message[] }) {
  return (
    <div className="rv-section">
      <div className="rv-section-title-static">
        Messages ({messages.length})
      </div>
      <div className="rv-messages">
        {messages.map((msg, i) => (
          <MessageItem key={i} message={msg} />
        ))}
      </div>
    </div>
  );
}

function MessageItem({ message }: { message: Message }) {
  const modal = useTextModal();
  const role = message.role ?? "unknown";
  const isUser = role === "user";

  const blocks: ContentBlock[] =
    typeof message.content === "string"
      ? [{ type: "text", text: message.content }]
      : Array.isArray(message.content)
        ? message.content
        : [];

  return (
    <div className={`rv-msg rv-msg-${isUser ? "user" : "assistant"}`}>
      <div className="rv-msg-role">{role}</div>
      <div className="rv-msg-body">
        {blocks.map((block, i) => (
          <MessageBlock key={i} block={block} modal={modal} />
        ))}
      </div>
    </div>
  );
}

function MessageBlock({
  block,
  modal,
}: {
  block: ContentBlock;
  modal: { show: (title: string, content: string) => void };
}) {
  switch (block.type) {
    case "text": {
      const text = block.text ?? "";
      return (
        <div className="rv-block-text">
          <pre className="rv-text">{text}</pre>
          {text.length > 500 && (
            <button
              className="jv-expand-btn cb-expand"
              onClick={() => modal.show("Message Text", text)}
            >
              show all
            </button>
          )}
        </div>
      );
    }

    case "thinking": {
      const thinking = block.thinking ?? "";
      return (
        <CollapsibleBlock label="Thinking" className="rv-block-thinking">
          <pre className="rv-text">{thinking}</pre>
          {thinking.length > 500 && (
            <button
              className="jv-expand-btn cb-expand"
              onClick={() => modal.show("Thinking", thinking)}
            >
              show all
            </button>
          )}
        </CollapsibleBlock>
      );
    }

    case "tool_use":
      return (
        <div className="rv-block-tool-use">
          <div className="rv-block-tag">
            Tool: <strong>{block.name}</strong>
            {block.id && <span className="cb-secondary">{block.id}</span>}
          </div>
          <JsonView data={block.input} />
        </div>
      );

    case "tool_result":
      return (
        <div className="rv-block-tool-result">
          <div className="rv-block-tag">
            Tool Result
            {block.tool_use_id && (
              <span className="cb-secondary">{block.tool_use_id}</span>
            )}
          </div>
          {typeof block.content === "string" ? (
            <pre className="rv-text">{block.content}</pre>
          ) : (
            <JsonView data={block.content} />
          )}
        </div>
      );

    case "image":
      return (
        <div className="rv-block-image">
          <span className="rv-block-tag">Image</span>
        </div>
      );

    default:
      return <JsonView data={block} />;
  }
}

function CollapsibleBlock({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <div className="rv-collapse-header" onClick={() => setOpen(!open)}>
        <span className="cb-arrow">{open ? "\u25BC" : "\u25B6"}</span>
        <span className="rv-block-tag">{label}</span>
      </div>
      {open && <div className="rv-collapse-body">{children}</div>}
    </div>
  );
}
