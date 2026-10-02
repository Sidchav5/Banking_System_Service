import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import './AiChat.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Citation {
  docName: string;
  fileName: string;
  page: number;
  sectionHeading: string;
  excerpt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  abstained?: boolean;
  queryType?: string;
  latencyMs?: number;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatApiResponse {
  conversationId: string;
  queryId: string;
  queryType: string;
  answer: string;
  citations: Citation[];
  abstained: boolean;
  abstentionReason?: string;
  debug?: {
    rewrittenQueries: string[];
    chunksRetrieved: number;
    chunksAfterRerank: number;
    topScore: number;
    promptTokens: number;
    latencyMs: number;
  };
}

const API_BASE = 'http://localhost:3000/api/v1/ai';

const SUGGESTED_QUESTIONS = [
  'What is the difference between NEFT, RTGS and IMPS?',
  'What does CREDIT_PENDING status mean?',
  'How does the Payment Saga pattern work?',
  'Why might a payment be stuck in DISPATCHED state?',
  'What is double-entry accounting?',
  'How does BankFlow handle failed transactions?',
];

// ─── Component ────────────────────────────────────────────────────────────────

export const AiChat: React.FC = () => {
  const { user, accessToken } = useAuth();
  const [messages, setMessages]             = useState<Message[]>([]);
  const [input, setInput]                   = useState('');
  const [isLoading, setIsLoading]           = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showDebug, setShowDebug]           = useState(false);
  const [debugData, setDebugData]           = useState<ChatApiResponse['debug'] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  const userId = user?.id ?? 'guest';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  const sendMessage = useCallback(async (query: string) => {
    if (!query.trim() || isLoading) return;

    const userMsg: Message = {
      id:        crypto.randomUUID(),
      role:      'user',
      content:   query.trim(),
      timestamp: new Date(),
    };

    const thinkingMsg: Message = {
      id:          crypto.randomUUID(),
      role:        'assistant',
      content:     '',
      timestamp:   new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setInput('');
    setIsLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          query:          query.trim(),
          userId,
          conversationId: conversationId ?? undefined,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

      const data: ChatApiResponse = await res.json();

      if (!conversationId) setConversationId(data.conversationId);
      if (data.debug) setDebugData(data.debug);

      const assistantMsg: Message = {
        id:          thinkingMsg.id,
        role:        'assistant',
        content:     data.answer,
        citations:   data.citations,
        abstained:   data.abstained,
        queryType:   data.queryType,
        latencyMs:   data.debug?.latencyMs,
        timestamp:   new Date(),
        isStreaming: false,
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === thinkingMsg.id ? assistantMsg : m)),
      );
    } catch (err: any) {
      const errorMsg: Message = {
        id:          thinkingMsg.id,
        role:        'assistant',
        content:     `Sorry, I couldn't connect to the AI service. Make sure the AI Assistant service is running on port 3012.\n\nError: ${err.message}`,
        timestamp:   new Date(),
        isStreaming: false,
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === thinkingMsg.id ? errorMsg : m)),
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isLoading, conversationId, accessToken, userId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearConversation = async () => {
    if (conversationId) {
      try {
        await fetch(`${API_BASE}/conversations/${conversationId}`, { method: 'DELETE' });
      } catch {}
    }
    setMessages([]);
    setConversationId(null);
    setDebugData(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const queryTypeLabel = (qt?: string) => {
    const labels: Record<string, { text: string; cls: string }> = {
      GENERAL_BANKING:        { text: 'General Banking',   cls: 'badge-banking' },
      BANKFLOW_DOCUMENTATION: { text: 'BankFlow Docs',     cls: 'badge-docs' },
      LIVE_ACCOUNT_DATA:      { text: 'Live Account',      cls: 'badge-live' },
      LIVE_TRANSACTION_DATA:  { text: 'Live Transaction',  cls: 'badge-live' },
      HYBRID:                 { text: 'Hybrid',            cls: 'badge-hybrid' },
      FINANCIAL_ACTION:       { text: 'Action Blocked',    cls: 'badge-blocked' },
      UNSUPPORTED:            { text: 'Out of Scope',      cls: 'badge-blocked' },
    };
    return qt ? labels[qt] : null;
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ai-chat-page">
      <div className="ai-chat-container">
        {/* Hero header */}
        <header className="ai-chat-header">
          <div className="ai-chat-header__left">
            <div className="ai-avatar-ring">
              <span className="ai-avatar-icon">✦</span>
            </div>
            <div>
              <span className="ai-chat-eyebrow">AI Operations</span>
              <h1 className="ai-chat-title">BankFlow AI Assistant</h1>
              <p className="ai-chat-subtitle">
                Powered by Gemini · RAG Knowledge Base
              </p>
            </div>
          </div>
          <div className="ai-chat-header__actions">
            <button
              type="button"
              className={`ai-btn-icon ${showDebug ? 'is-active' : ''}`}
              onClick={() => setShowDebug(!showDebug)}
              title="Toggle debug info"
              aria-label="Toggle debug info"
            >
              <i className="bi bi-sliders"></i>
            </button>
            <button
              type="button"
              className="ai-btn-icon"
              onClick={clearConversation}
              title="New conversation"
              aria-label="New conversation"
            >
              <i className="bi bi-arrow-clockwise"></i>
            </button>
          </div>
        </header>

        {/* Debug panel */}
        {showDebug && debugData && (
          <div className="ai-debug-panel">
            <div className="ai-debug-grid">
              <div className="ai-debug-item">
                <span className="ai-debug-label">Chunks Retrieved</span>
                <span className="ai-debug-val">{debugData.chunksRetrieved}</span>
              </div>
              <div className="ai-debug-item">
                <span className="ai-debug-label">After Rerank</span>
                <span className="ai-debug-val">{debugData.chunksAfterRerank}</span>
              </div>
              <div className="ai-debug-item">
                <span className="ai-debug-label">Top Score</span>
                <span className="ai-debug-val">{debugData.topScore.toFixed(3)}</span>
              </div>
              <div className="ai-debug-item">
                <span className="ai-debug-label">Latency</span>
                <span className="ai-debug-val">{debugData.latencyMs}ms</span>
              </div>
            </div>
            {debugData.rewrittenQueries.length > 1 && (
              <div className="ai-debug-rewrites">
                <span className="ai-debug-label">Query rewrites:</span>
                {debugData.rewrittenQueries.map((q, i) => (
                  <span key={i} className="ai-rewrite-chip">{q}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="ai-messages">
          {messages.length === 0 && (
            <div className="ai-welcome">
              <div className="ai-welcome-icon">✦</div>
              <h3 className="ai-welcome-title">How can I help you today?</h3>
              <p className="ai-welcome-sub">
                Ask me about banking concepts, payment statuses, BankFlow features, or your transactions.
              </p>
              <div className="ai-suggestions">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    className="ai-suggestion-chip"
                    onClick={() => sendMessage(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`ai-message ai-message-${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="ai-msg-avatar">
                  <span>✦</span>
                </div>
              )}

              <div className="ai-msg-body">
                {msg.role === 'assistant' && msg.queryType && !msg.isStreaming && (() => {
                  const label = queryTypeLabel(msg.queryType);
                  return label ? (
                    <div className={`ai-query-badge ${label.cls}`}>{label.text}</div>
                  ) : null;
                })()}

                {msg.isStreaming ? (
                  <div className="ai-thinking">
                    <span className="ai-thinking-dot"></span>
                    <span className="ai-thinking-dot"></span>
                    <span className="ai-thinking-dot"></span>
                    <span className="ai-thinking-label">Searching knowledge base…</span>
                  </div>
                ) : (
                  <div className="ai-msg-text">{formatMessage(msg.content)}</div>
                )}

                {msg.citations && msg.citations.length > 0 && (
                  <div className="ai-citations">
                    <div className="ai-citations-label">
                      <i className="bi bi-book-half"></i>
                      Sources
                    </div>
                    {msg.citations.map((c, i) => (
                      <div key={i} className="ai-citation-card">
                        <div className="ai-citation-header">
                          <span className="ai-citation-num">[{i + 1}]</span>
                          <span className="ai-citation-doc">{c.docName}</span>
                          <span className="ai-citation-page">p.{c.page}</span>
                        </div>
                        {c.sectionHeading && (
                          <div className="ai-citation-section">§ {c.sectionHeading}</div>
                        )}
                        {c.excerpt && (
                          <div className="ai-citation-excerpt">"{c.excerpt}"</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!msg.isStreaming && (
                  <div className="ai-msg-meta">
                    <span>
                      <i className="bi bi-clock"></i>
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                    {msg.latencyMs && (
                      <span>
                        <i className="bi bi-lightning-charge-fill"></i>
                        {msg.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="ai-user-avatar">
                  {user?.email?.[0]?.toUpperCase() ?? 'U'}
                </div>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form className="ai-input-form" onSubmit={handleSubmit}>
          <div className="ai-input-wrapper">
            <textarea
              ref={inputRef}
              className="ai-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about banking, payment status, or BankFlow features…"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="ai-send-btn"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              {isLoading ? (
                <span className="ai-spinner"></span>
              ) : (
                <i className="bi bi-arrow-up"></i>
              )}
            </button>
          </div>
          <div className="ai-input-hint">
            <span><kbd>Enter</kbd> to send</span>
            <span className="ai-input-hint__dot">•</span>
            <span><kbd>Shift</kbd> + <kbd>Enter</kbd> for new line</span>
            <span className="ai-input-hint__dot">•</span>
            <span>AI cannot execute financial transactions</span>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMessage(text: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="ai-msg-bold">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return <li key={i} className="ai-msg-li">{formatInline(line.slice(2))}</li>;
        }
        if (line.trim() === '') return <br key={i} />;
        return <p key={i} className="ai-msg-p">{formatInline(line)}</p>;
      })}
    </>
  );
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\[SOURCE \d+\])/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\[SOURCE \d+\]$/.test(part) ? (
          <span key={i} className="ai-source-ref">{part}</span>
        ) : (
          part.split(/(\*\*[^*]+\*\*)/).map((p, j) =>
            /^\*\*[^*]+\*\*$/.test(p) ? (
              <strong key={j}>{p.slice(2, -2)}</strong>
            ) : (
              <React.Fragment key={j}>{p}</React.Fragment>
            ),
          )
        ),
      )}
    </>
  );
}

export default AiChat;