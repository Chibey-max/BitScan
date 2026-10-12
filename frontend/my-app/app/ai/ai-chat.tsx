"use client";

import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import { API_BASE, AiChatResponse } from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  resources?: AiChatResponse["resources"];
};

const modes = [
  { value: "beginner", label: "Beginner" },
  { value: "technical", label: "Technical" },
  { value: "developer", label: "Developer" },
  { value: "eli5", label: "ELI5" },
];

const suggestions = [
  "Explain UTXOs like I am new to Bitcoin",
  "What does block weight mean?",
  "Why do transactions have inputs and outputs?",
  "What is witness_v0_keyhash?",
  "How do confirmations work?",
  "Why can a transaction fee be pending?",
];

export default function AiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ask me anything about Bitcoin blocks, transactions, fees, scripts, mining, wallets, or what you are seeing inside BitScan.",
    },
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("beginner");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(
    () =>
      "The user is on BitScan AI Mode, a Bitcoin explorer assistant. Use BitScan terms when useful: block height, hash, txid, inputs, outputs, fees, weight, confirmations, script type, mempool status.",
    [],
  );

  async function send(question: string) {
    const message = question.trim();
    if (!message || pending) return;

    setError(null);
    setInput("");
    setPending(true);
    setMessages((items) => [...items, { role: "user", content: message }]);

    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ message, mode, context }),
      });

      if (!response.ok) {
        let detail = "The AI assistant could not answer right now.";
        try {
          const payload = await response.json();
          if (typeof payload?.error === "string") detail = payload.error;
        } catch {
          detail = response.statusText || detail;
        }
        throw new Error(detail);
      }

      const payload = (await response.json()) as AiChatResponse;
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          content: payload.answer,
          resources: payload.resources,
        },
      ]);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "The AI assistant could not answer right now.";
      setError(message);
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          content:
            "I could not reach the AI provider. Check that the Rust API has Groq keys configured, then try again.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void send(input);
  }

  function clearChat() {
    setError(null);
    setInput("");
    setMessages([
      {
        role: "assistant",
        content:
          "Chat cleared. Ask me anything about Bitcoin blocks, transactions, fees, scripts, mining, wallets, or what you are seeing inside BitScan.",
      },
    ]);
  }

  return (
    <div className="ai-console">
      <aside className="ai-side-panel">
        <div className="ai-orb" aria-hidden="true">
          <MaterialIcon name="psychology" />
        </div>
        <h2>Bitcoin teacher</h2>
        <p>
          Groq-powered explanations with BitScan context, designed for learning protocol details
          without exposing API keys in the browser.
        </p>
        <div className="ai-mode-list" aria-label="Answer style">
          {modes.map((item) => (
            <button
              key={item.value}
              type="button"
              className={mode === item.value ? "ai-mode-active" : undefined}
              onClick={() => setMode(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ai-suggestion-list">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </aside>

      <section className="ai-chat-panel" aria-label="BitScan AI chat">
        <div className="ai-chat-toolbar">
          <div>
            <span className="ai-live-dot" />
            <span>Assistant ready</span>
          </div>
        </div>
        <div className="ai-thread">
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`ai-message ai-message-${message.role}`}>
              <div className="ai-message-label">
                <span>{message.role === "user" ? "You" : "BitScan AI"}</span>
              </div>
              <div className="ai-message-body">
                {message.role === "assistant" ? renderMarkdown(message.content) : message.content}
              </div>
              {message.resources?.length ? (
                <div className="ai-resource-row">
                  {message.resources.slice(0, 3).map((resource) => (
                    <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer">
                      {resource.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {pending ? (
            <article className="ai-message ai-message-assistant ai-message-loading">
              <div className="ai-message-label">
                <span>BitScan AI</span>
              </div>
              <div className="ai-thinking">
                <span />
                <span />
                <span />
              </div>
            </article>
          ) : null}
        </div>

        {error ? (
          <div className="ai-error">
            <MaterialIcon name="warning" />
            <span>{error}</span>
          </div>
        ) : null}

        <form className="ai-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="ai-question">
            Ask a Bitcoin question
          </label>
          <textarea
            id="ai-question"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask about a block, transaction, script type, fee, wallet, or Bitcoin concept..."
            rows={3}
          />
          <div className="ai-composer-meta">
            <span className="ai-enter-hint">Enter to send · Shift+Enter for new line</span>
            <button
              type="button"
              className="ai-clear-button"
              onClick={clearChat}
              disabled={pending || messages.length <= 1}
            >
              <MaterialIcon name="delete_sweep" />
              Clear chat
            </button>
          </div>
          <button className="ai-submit-button" type="submit" disabled={pending || !input.trim()}>
            <MaterialIcon name="send" />
            Ask
          </button>
        </form>
      </section>
    </div>
  );
}

function renderMarkdown(content: string) {
  const blocks = normalizeMarkdown(content)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    if (/^-{3,}$/.test(block)) {
      return <hr key={index} />;
    }

    const heading = block.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2]);
      if (level === 2) return <h2 key={index}>{text}</h2>;
      if (level === 3) return <h3 key={index}>{text}</h3>;
      return <h4 key={index}>{text}</h4>;
    }

    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (looksLikeMarkdownTable(lines)) {
      return <MarkdownTable key={index} lines={lines} />;
    }

    const isList = lines.every((line) => /^[-*]\s+/.test(line));
    if (isList) {
      return (
        <ul key={index}>
          {lines.map((line, itemIndex) => (
            <li key={itemIndex}>{renderInline(cleanListItem(line.replace(/^[-*]\s+/, "")))}</li>
          ))}
        </ul>
      );
    }

    const isNumberedList = lines.every((line) => /^\d+[.)]\s+/.test(line));
    if (isNumberedList) {
      return (
        <ol key={index}>
          {lines.map((line, itemIndex) => (
            <li key={itemIndex}>{renderInline(cleanListItem(line.replace(/^\d+[.)]\s+/, "")))}</li>
          ))}
        </ol>
      );
    }

    return <p key={index}>{renderInline(block.replace(/\n/g, " "))}</p>;
  });
}

function renderInline(text: string) {
  const parts = text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/, "")
    .split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function normalizeMarkdown(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\n\s*---+\s*\n/g, "\n\n---\n\n")
    .replace(/\n(#{2,4}\s+)/g, "\n\n$1")
    .replace(/\n(\|.+\|)\n/g, "\n\n$1\n")
    .trim();
}

function cleanListItem(value: string) {
  return value
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s+→\s+/g, " -> ")
    .trim();
}

function looksLikeMarkdownTable(lines: string[]) {
  return (
    lines.length >= 2 &&
    lines.every((line) => line.includes("|")) &&
    lines.some((line) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
  );
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((row) => row.some(Boolean));

  const [head, ...body] = rows;
  if (!head) return null;

  return (
    <div className="ai-table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index}>{renderInline(cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {head.map((_, cellIndex) => (
                <td key={cellIndex}>{renderInline(row[cellIndex] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
