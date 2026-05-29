import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bot,
  CircleOff,
  Clock3,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  Send,
  Square,
  Terminal as TerminalIcon,
} from 'lucide-react';
import {
  extractVisibleText,
  normalizeChatMessage,
  OpenClawChatClient,
  type OpenClawConnectionStatus,
  type OpenClawEventFrame,
  type OpenClawHelloOk,
} from '../lib/openclaw';

const CHAT_PROXY_URL = import.meta.env.VITE_OPENCLAW_CHAT_PROXY || '/.netlify/functions/chat-proxy';
const USE_PROXY = String(import.meta.env.VITE_OPENCLAW_USE_PROXY ?? 'false') === 'true';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  status?: 'pending' | 'streaming' | 'final' | 'aborted' | 'error';
  runId?: string;
};

type ConnectionForm = {
  gatewayUrl: string;
  sessionKey: string;
  token: string;
  password: string;
  autoConnect: boolean;
};

const STORAGE_KEY = 'gabinete-filosofo.openclaw.settings';
const HISTORY_LIMIT = 100;
const HISTORY_MAX_CHARS = 4000;
const DEFAULT_GATEWAY_URL = import.meta.env.VITE_OPENCLAW_GATEWAY_URL || 'wss://agentepv-production.up.railway.app';
const DEFAULT_SESSION_KEY = import.meta.env.VITE_OPENCLAW_SESSION_KEY || 'main';
const DEFAULT_AUTO_CONNECT = String(import.meta.env.VITE_OPENCLAW_AUTO_CONNECT ?? 'true') !== 'false';
const QUICK_PROMPTS = [
  'Explique o assunto principal do agente',
  'Resuma os pontos centrais',
  'Quais são os próximos passos?',
  'Conecte este tema ao Sistema Centauro',
];

function readStoredSettings(): ConnectionForm {
  if (typeof window === 'undefined') {
    return {
      gatewayUrl: DEFAULT_GATEWAY_URL,
      sessionKey: DEFAULT_SESSION_KEY,
      token: '',
      password: '',
      autoConnect: DEFAULT_AUTO_CONNECT,
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        gatewayUrl: DEFAULT_GATEWAY_URL,
        sessionKey: DEFAULT_SESSION_KEY,
        token: '',
        password: '',
        autoConnect: DEFAULT_AUTO_CONNECT,
      };
    }
    const parsed = JSON.parse(raw) as Partial<ConnectionForm>;
    return {
      gatewayUrl: parsed.gatewayUrl?.trim() || DEFAULT_GATEWAY_URL,
      sessionKey: parsed.sessionKey?.trim() || DEFAULT_SESSION_KEY,
      token: '',
      password: '',
      autoConnect: parsed.autoConnect ?? DEFAULT_AUTO_CONNECT,
    };
  } catch {
    return {
      gatewayUrl: DEFAULT_GATEWAY_URL,
      sessionKey: DEFAULT_SESSION_KEY,
      token: '',
      password: '',
      autoConnect: DEFAULT_AUTO_CONNECT,
    };
  }
}

function persistSettings(settings: ConnectionForm) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      gatewayUrl: settings.gatewayUrl,
      sessionKey: settings.sessionKey,
      autoConnect: settings.autoConnect,
    }),
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildFallbackText(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  return text || '[sem texto]';
}

function normalizeHistoryMessage(message: unknown, index: number): UiMessage | null {
  const normalized = normalizeChatMessage(message);
  if (!normalized) {
    return null;
  }
  return {
    id: `history-${index}-${normalized.timestamp}`,
    role: normalized.role,
    text: buildFallbackText(normalized.text),
    timestamp: normalized.timestamp,
    status: 'final',
  };
}

function createPlaceholderMessage(runId: string, timestamp: number): UiMessage {
  return {
    id: `run-${runId}`,
    role: 'assistant',
    text: 'Processando resposta do OpenClaw...',
    timestamp,
    status: 'pending',
    runId,
  };
}

function isGatewayChatEvent(evt: OpenClawEventFrame | null): boolean {
  return Boolean(evt && evt.event === 'chat' && evt.payload && typeof evt.payload === 'object');
}

function ensureString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function useAutoResizeTextArea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);
  return ref;
}

export const Terminal: React.FC = () => {
  const initialSettings = useMemo(() => readStoredSettings(), []);
  const [form, setForm] = useState<ConnectionForm>(initialSettings);
  const [activeSessionKey, setActiveSessionKey] = useState(initialSettings.sessionKey);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'OpenClaw ainda não conectado. Informe a URL do gateway e conecte para iniciar a conversa.',
      timestamp: Date.now(),
      status: 'final',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<OpenClawConnectionStatus>('idle');
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [serverConnectionId, setServerConnectionId] = useState<string | null>(null);
  const [serverRole, setServerRole] = useState<string | null>(null);
  const [serverScopes, setServerScopes] = useState<string[] | null>(null);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const clientRef = useRef<OpenClawChatClient | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useAutoResizeTextArea(draft);
  const activeSessionKeyRef = useRef(activeSessionKey);
  const activeRunIdRef = useRef<string | null>(activeRunId);

  useEffect(() => {
    activeSessionKeyRef.current = activeSessionKey;
  }, [activeSessionKey]);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  const statusLabel = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return 'conectado';
      case 'connecting':
        return 'conectando';
      case 'reconnecting':
        return 'reconectando';
      case 'disconnected':
        return 'desconectado';
      default:
        return 'pronto';
    }
  }, [connectionStatus, lastError]);

  useEffect(() => {
    persistSettings(form);
  }, [form]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, activeRunId, isHistoryLoading]);

  useEffect(() => {
    if (!form.autoConnect) {
      return;
    }
    void connectToGateway();
    // Only auto-connect once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.stop();
      clientRef.current = null;
    };
  }, []);

  async function loadHistory(client: OpenClawChatClient, sessionKey: string) {
    setIsHistoryLoading(true);
    setLastError(null);
    try {
      const res = await client.request<{
        messages?: unknown[];
        sessionId?: string;
        thinkingLevel?: string;
      }>('chat.history', {
        sessionKey,
        limit: HISTORY_LIMIT,
        maxChars: HISTORY_MAX_CHARS,
      });
      const historyMessages = Array.isArray(res.messages)
        ? res.messages
            .map((message, index) => normalizeHistoryMessage(message, index))
            .filter((message): message is UiMessage => message !== null)
        : [];
      setMessages(
        historyMessages.length > 0
          ? historyMessages
          : [
              {
                id: 'history-empty',
                role: 'assistant',
                text: 'Esta sessão ainda não tem histórico.',
                timestamp: Date.now(),
                status: 'final',
              },
            ],
      );
      setHistorySessionId(typeof res.sessionId === 'string' && res.sessionId.trim() ? res.sessionId : null);
      setThinkingLevel(typeof res.thinkingLevel === 'string' && res.thinkingLevel.trim() ? res.thinkingLevel : null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      setMessages((current) =>
        current.length > 0
          ? current
          : [
              {
                id: 'history-error',
                role: 'assistant',
                text: 'Não foi possível carregar o histórico desta sessão.',
                timestamp: Date.now(),
                status: 'error',
              },
            ],
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }

  function handleHello(hello: OpenClawHelloOk) {
    setServerVersion(typeof hello.server?.version === 'string' ? hello.server.version : null);
    setServerConnectionId(typeof hello.server?.connId === 'string' ? hello.server.connId : null);
    setServerRole(typeof hello.auth?.role === 'string' ? hello.auth.role : null);
    setServerScopes(Array.isArray(hello.auth?.scopes) ? hello.auth.scopes ?? null : null);
  }

  function handleClose(info: { code: number; reason: string; error?: { code: string; message: string; details?: unknown } }) {
    setConnectionStatus('disconnected');
    const friendlyReason = info.error?.message || info.reason || 'Conexão encerrada';
    setLastError(`${friendlyReason} (${info.code})`);
    setIsSending(false);
    const currentRunId = activeRunIdRef.current;
    if (!currentRunId) {
      return;
    }
    setMessages((current) =>
      current.map((message) =>
        message.runId === currentRunId
          ? {
              ...message,
              text: 'A conexão com o gateway foi interrompida.',
              status: 'error',
            }
          : message,
      ),
    );
    setActiveRunId(null);
  }

  function handleGatewayEvent(evt: OpenClawEventFrame) {
    if (!isGatewayChatEvent(evt)) {
      return;
    }
    const payload = evt.payload as {
      runId?: unknown;
      sessionKey?: unknown;
      state?: unknown;
      deltaText?: unknown;
      replace?: unknown;
      message?: unknown;
      errorMessage?: unknown;
    };
    const payloadSession = ensureString(payload.sessionKey);
    const currentSession = activeSessionKeyRef.current;
    const currentRunId = activeRunIdRef.current;
    if (payloadSession && payloadSession !== currentSession && payload.runId !== currentRunId) {
      return;
    }
    const runId = ensureString(payload.runId);
    const state = ensureString(payload.state);
    if (!runId) {
      return;
    }

    const deltaText = ensureString(payload.deltaText);
    const finalText = extractVisibleText(payload.message);
    const replace = payload.replace === true;

    setMessages((current) => {
      const next = [...current];
      let index = next.findIndex((message) => message.runId === runId || message.id === `run-${runId}`);
      if (index < 0) {
        next.push(createPlaceholderMessage(runId, Date.now()));
        index = next.length - 1;
      }
      const target = next[index];
      if (state === 'delta') {
        const baseText = target.status === 'pending' ? '' : target.text;
        const incoming = replace ? deltaText : `${baseText}${deltaText}`;
        next[index] = {
          ...target,
          text: buildFallbackText(incoming),
          status: 'streaming',
          runId,
        };
        return next;
      }
      if (state === 'final') {
        next[index] = {
          ...target,
          text: buildFallbackText(finalText || target.text),
          status: 'final',
          runId,
        };
        return next;
      }
      if (state === 'aborted') {
        next[index] = {
          ...target,
          text: buildFallbackText(finalText || target.text || 'Resposta interrompida.'),
          status: 'aborted',
          runId,
        };
        return next;
      }
      if (state === 'error') {
        next[index] = {
          ...target,
          text: buildFallbackText(ensureString(payload.errorMessage) || finalText || 'Erro ao processar a resposta.'),
          status: 'error',
          runId,
        };
        return next;
      }
      return current;
    });

    if (state === 'final' || state === 'aborted' || state === 'error') {
      setActiveRunId((current) => (current === runId ? null : current));
      setIsSending(false);
    }
  }

  async function connectToGateway() {
    clientRef.current?.stop();
    clientRef.current = null;
    setConnectionStatus('connecting');
    setLastError(null);
    setServerVersion(null);
    setServerConnectionId(null);
    setServerRole(null);
    setServerScopes(null);
    setHistorySessionId(null);
    setThinkingLevel(null);
    setActiveRunId(null);
    setIsSending(false);

    const client = new OpenClawChatClient({
      url: form.gatewayUrl.trim(),
      token: form.token.trim() || undefined,
      password: form.password.trim() || undefined,
      clientId: 'gabinete-filosofo',
      displayName: 'Gabinete Filosófico',
      clientVersion: '1.0.0',
      platform: navigator.platform || 'web',
      onHello: (hello) => {
        handleHello(hello);
        void loadHistory(client, activeSessionKeyRef.current);
      },
      onEvent: handleGatewayEvent,
      onClose: handleClose,
      onStatus: setConnectionStatus,
    });
    clientRef.current = client;
    client.start();
  }

  async function disconnectGateway() {
    clientRef.current?.stop();
    clientRef.current = null;
    setConnectionStatus('disconnected');
    setLastError('Conexão encerrada manualmente.');
    setActiveRunId(null);
    setIsSending(false);
  }

  async function applySessionKey() {
    const nextSession = form.sessionKey.trim() || DEFAULT_SESSION_KEY;
    setActiveSessionKey(nextSession);
    const client = clientRef.current;
    if (client?.connected) {
      await loadHistory(client, nextSession);
    }
  }

  async function sendMessage() {
    const text = draft.trim();

    if (USE_PROXY) {
      // ── Modo proxy HTTP (Netlify Function) ──
      if (!text || isSending) return;
      setDraft('');
      const timestamp = Date.now();
      const msgId = `proxy-${timestamp}`;
      const userMessage: UiMessage = {
        id: `local-user-${timestamp}`,
        role: 'user',
        text,
        timestamp,
        status: 'final',
      };
      setMessages((current) => [...current, userMessage, {
        id: msgId,
        role: 'assistant',
        text: 'Processando...',
        timestamp: timestamp + 1,
        status: 'pending',
      }]);
      setIsSending(true);
      setLastError(null);

      try {
        const res = await fetch(CHAT_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionKey: activeSessionKeyRef.current }),
        });
        if (!res.ok) {
          throw new Error(`Proxy retornou ${res.status}: ${await res.text()}`);
        }
        const data = await res.json() as { reply?: string };
        setMessages((current) =>
          current.map((message) =>
            message.id === msgId
              ? { ...message, text: data.reply ?? '[resposta vazia]', status: 'final' as const }
              : message,
          ),
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        setLastError(errorMsg);
        setMessages((current) =>
          current.map((message) =>
            message.id === msgId
              ? { ...message, text: `Erro: ${errorMsg}`, status: 'error' as const }
              : message,
          ),
        );
      } finally {
        setIsSending(false);
      }
      return;
    }

    // ── Modo WebSocket direto (original) ──
    const client = clientRef.current;
    if (!client?.connected || !text || isSending || activeRunIdRef.current) {
      return;
    }
    setDraft('');
    const timestamp = Date.now();
    const runId = `gabinete-${timestamp}-${Math.random().toString(36).slice(2)}`;
    const userMessage: UiMessage = {
      id: `local-user-${timestamp}`,
      role: 'user',
      text,
      timestamp,
      status: 'final',
    };
    setMessages((current) => [...current, userMessage, createPlaceholderMessage(runId, timestamp + 1)]);
    setActiveRunId(runId);
    setLastError(null);
    setIsSending(true);

    try {
      const response = await client.request<{
        runId?: string;
        status?: string;
      }>('chat.send', {
        sessionKey: activeSessionKeyRef.current,
        ...(historySessionId ? { sessionId: historySessionId } : {}),
        message: text,
        deliver: false,
        idempotencyKey: runId,
      });
      const resolvedRunId =
        typeof response.runId === 'string' && response.runId.trim() ? response.runId : runId;
      if (resolvedRunId !== runId) {
        setMessages((current) =>
          current.map((message) =>
            message.runId === runId || message.id === `run-${runId}`
              ? {
                  ...message,
                  id: `run-${resolvedRunId}`,
                  runId: resolvedRunId,
                }
              : message,
          ),
        );
        setActiveRunId(resolvedRunId);
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      setMessages((current) =>
        current.map((message) =>
          message.runId === runId || message.id === `run-${runId}`
            ? {
                ...message,
                text: 'Não foi possível enviar a mensagem ao OpenClaw.',
                status: 'error',
              }
            : message,
        ),
      );
      setActiveRunId(null);
    } finally {
      setIsSending(false);
    }
  }

  async function abortActiveRun() {
    const client = clientRef.current;
    if (!client?.connected) {
      return;
    }
    try {
      await client.request('chat.abort', {
        sessionKey: activeSessionKeyRef.current,
        ...(activeRunIdRef.current ? { runId: activeRunIdRef.current } : {}),
      });
      const currentRunId = activeRunIdRef.current;
      if (currentRunId) {
        setMessages((current) =>
          current.map((message) =>
            message.runId === currentRunId
              ? {
                  ...message,
                  text: 'Resposta interrompida.',
                  status: 'aborted',
                }
              : message,
          ),
        );
      }
      setActiveRunId(null);
      setIsSending(false);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }

  const terminalStatusPill =
    connectionStatus === 'connected'
      ? 'text-green-300 border-green-400/20 bg-green-400/10'
      : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
        ? 'text-gold border-gold/20 bg-gold/10'
        : 'text-ivory/50 border-ivory/10 bg-ivory/5';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gold/15 bg-charcoal/70 shadow-[0_0_40px_rgba(233,193,118,0.08)] backdrop-blur-xl">
      <div className="border-b border-gold/15 bg-gold/5 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-gold/15 bg-charcoal/80 p-2 text-gold">
              <TerminalIcon size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg text-ivory">OpenClaw Chat</h2>
                {USE_PROXY ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.28em] text-emerald-300">
                    PROXY
                  </span>
                ) : (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.28em] ${terminalStatusPill}`}>
                    {statusLabel}
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-ivory/35">
                {USE_PROXY ? 'HTTP proxy via Netlify Function' : 'Gateway WS + chat.history + chat.send + chat.abort'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-ivory/35">
            {USE_PROXY ? <span>proxy mode</span> : null}
            {!USE_PROXY && serverVersion ? <span>v{serverVersion}</span> : null}
            {!USE_PROXY && serverConnectionId ? <span>#{serverConnectionId.slice(0, 6)}</span> : null}
          </div>
        </div>
      </div>

      <div className="border-b border-gold/10 bg-void/35 px-4 py-3">
        {USE_PROXY ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-ivory/40">Session key</span>
              <input
                value={form.sessionKey}
                onChange={(event) => setForm((current) => ({ ...current, sessionKey: event.target.value }))}
                className="rounded-lg border border-gold/15 bg-ivory/5 px-3 py-2 font-mono text-sm text-gold outline-none transition focus:border-gold/40"
                placeholder="main"
              />
            </label>
            <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-300/80">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              Modo proxy ativo — token seguro no servidor
            </div>
          </div>
        ) : (
        <>
          <div className="grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-ivory/40">Gateway URL</span>
            <input
              value={form.gatewayUrl}
              onChange={(event) => setForm((current) => ({ ...current, gatewayUrl: event.target.value }))}
              className="rounded-lg border border-gold/15 bg-ivory/5 px-3 py-2 font-mono text-sm text-gold outline-none transition focus:border-gold/40"
              placeholder="wss://agentepv-production.up.railway.app"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-ivory/40">Session key</span>
            <input
              value={form.sessionKey}
              onChange={(event) => setForm((current) => ({ ...current, sessionKey: event.target.value }))}
              className="rounded-lg border border-gold/15 bg-ivory/5 px-3 py-2 font-mono text-sm text-gold outline-none transition focus:border-gold/40"
              placeholder="main"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-ivory/40">Token</span>
            <input
              value={form.token}
              onChange={(event) => setForm((current) => ({ ...current, token: event.target.value }))}
              className="rounded-lg border border-gold/15 bg-ivory/5 px-3 py-2 font-mono text-sm text-gold outline-none transition focus:border-gold/40"
              placeholder="opcional"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-ivory/40">Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              className="rounded-lg border border-gold/15 bg-ivory/5 px-3 py-2 font-mono text-sm text-gold outline-none transition focus:border-gold/40"
              placeholder="opcional"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void connectToGateway()}
            className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.22em] text-gold transition hover:bg-gold/15"
          >
            <PlugZap size={14} />
            Conectar
          </button>
          <button
            type="button"
            onClick={() => void disconnectGateway()}
            className="inline-flex items-center gap-2 rounded-full border border-ivory/10 bg-ivory/5 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.22em] text-ivory/70 transition hover:border-gold/20 hover:text-gold"
          >
            <CircleOff size={14} />
            Desconectar
          </button>
          <button
            type="button"
            onClick={() => {
              const client = clientRef.current;
              if (!client?.connected) {
                return;
              }
              void loadHistory(client, activeSessionKeyRef.current);
            }}
            disabled={!clientRef.current?.connected || isHistoryLoading}
            className="inline-flex items-center gap-2 rounded-full border border-ivory/10 bg-ivory/5 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.22em] text-ivory/70 transition hover:border-gold/20 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isHistoryLoading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Histórico
          </button>
          <button
            type="button"
            onClick={() => void applySessionKey()}
            disabled={Boolean(activeRunId) || isHistoryLoading}
            className="inline-flex items-center gap-2 rounded-full border border-ivory/10 bg-ivory/5 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.22em] text-ivory/70 transition hover:border-gold/20 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowRight size={14} />
            Aplicar sessão
          </button>
          <button
            type="button"
            onClick={() => void abortActiveRun()}
            disabled={!activeRunId}
            className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-400/10 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.22em] text-red-200 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square size={14} />
            Abortar
          </button>
          <label className="ml-auto flex items-center gap-2 rounded-full border border-ivory/10 bg-ivory/5 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.18em] text-ivory/55">
            <input
              type="checkbox"
              checked={form.autoConnect}
              onChange={(event) => setForm((current) => ({ ...current, autoConnect: event.target.checked }))}
              className="h-3 w-3 accent-gold"
            />
            Auto connect
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-ivory/35">
          <span className="rounded-full border border-ivory/10 bg-ivory/5 px-2 py-1">Ativo: {activeSessionKey}</span>
          {historySessionId ? <span className="rounded-full border border-ivory/10 bg-ivory/5 px-2 py-1">sessionId: {historySessionId.slice(0, 8)}</span> : null}
          {thinkingLevel ? <span className="rounded-full border border-ivory/10 bg-ivory/5 px-2 py-1">thinking: {thinkingLevel}</span> : null}
          {serverRole ? <span className="rounded-full border border-ivory/10 bg-ivory/5 px-2 py-1">role: {serverRole}</span> : null}
          {serverScopes?.length ? <span className="rounded-full border border-ivory/10 bg-ivory/5 px-2 py-1">scopes: {serverScopes.length}</span> : null}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-ivory/30">
          Se o gateway recusar a conexão por origem, adicione o domínio publicado do Netlify em <span className="text-gold">gateway.controlUi.allowedOrigins</span> no OpenClaw.
        </p>
        </>
      )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl border px-4 py-3 shadow-lg ${
                  message.role === 'user'
                    ? 'border-gold/20 bg-gold/10 text-ivory'
                    : 'border-ivory/10 bg-ivory/5 text-ivory/90'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/70">
                    {message.role === 'user' ? 'Visitante' : 'OpenClaw'}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-ivory/35">
                    <span>{formatTime(message.timestamp)}</span>
                    {message.status && message.status !== 'final' ? (
                      <span
                        className={
                          message.status === 'error'
                            ? 'text-red-300'
                            : message.status === 'aborted'
                              ? 'text-amber-300'
                              : 'text-gold'
                        }
                      >
                        {message.status}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-inherit">{message.text}</div>
              </div>
            </motion.div>
          ))}
          {isHistoryLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-gold/10 bg-gold/5 px-4 py-3 text-gold/70">
              <LoaderCircle size={16} className="animate-spin" />
              <span className="font-mono text-[11px] uppercase tracking-[0.22em]">Carregando histórico...</span>
            </div>
          ) : null}
          {activeRunId ? (
            <div className="flex items-center gap-3 rounded-2xl border border-ivory/10 bg-ivory/5 px-4 py-3 text-ivory/50">
              <Bot size={16} className="text-gold" />
              <span className="font-mono text-[11px] uppercase tracking-[0.22em]">
                Aguardando resposta do run {activeRunId.slice(0, 8)}...
              </span>
            </div>
          ) : null}
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <div className="border-t border-gold/10 bg-void/35 px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setDraft(prompt)}
              className="rounded-full border border-gold/15 bg-gold/5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-gold/75 transition hover:bg-gold/10 hover:text-gold"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={USE_PROXY ? 'Digite sua pergunta...' : clientRef.current?.connected ? 'Digite sua pergunta...' : 'Conecte o gateway para conversar...'}
            className="min-h-[52px] flex-1 resize-none rounded-2xl border border-ivory/10 bg-ivory/5 px-4 py-3 font-mono text-sm text-ivory outline-none transition placeholder:text-ivory/25 focus:border-gold/35"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={USE_PROXY ? (!draft.trim() || isSending) : (!clientRef.current?.connected || !draft.trim() || isSending || Boolean(activeRunId))}
            className="inline-flex h-[52px] min-w-[52px] items-center justify-center rounded-2xl border border-gold/20 bg-gold/10 text-gold transition hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-[0.18em] text-ivory/35">
          <span className="inline-flex items-center gap-1 rounded-full border border-ivory/10 bg-ivory/5 px-2 py-1">
            <Clock3 size={12} />
            {connectionStatus}
          </span>
          {lastError ? (
            <span className="rounded-full border border-red-400/20 bg-red-400/10 px-2 py-1 text-red-200">{lastError}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
