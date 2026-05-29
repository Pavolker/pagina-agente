// ──────────────────────────────────────────────
// Netlify Function — Chat Proxy para OpenClaw
// netlify/functions/chat-proxy.mjs
//
// Recebe mensagens do frontend via HTTP POST,
// autentica com o Gateway OpenClaw via WebSocket
// usando o token mestre (env var), e retorna a
// resposta completa.
//
// Variáveis de ambiente (Netlify):
//   OPENCLAW_GATEWAY_URL    — wss:// do Gateway
//   OPENCLAW_GATEWAY_TOKEN  — token de autenticação
// ──────────────────────────────────────────────

import WebSocket from "ws";

// ── Constantes ────────────────────────────────

const RESPONSE_TIMEOUT_MS = 30_000; // timeout total por request

// ── Handler principal ─────────────────────────

export const handler = async (event) => {
  // ── 1. Validar método ──
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // ── 2. Parsear body ──
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "JSON inválido no body" }),
    };
  }

  const { message, sessionKey = "main" } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Campo 'message' é obrigatório" }),
    };
  }

  // ── 3. Ler configuração do ambiente ──
  const GATEWAY_URL =
    process.env.OPENCLAW_GATEWAY_URL ||
    "wss://agentepv-production.up.railway.app";
  const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;
  const CLIENT_ID = "gabinete-filosofo-proxy";

  if (!GATEWAY_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          "OPENCLAW_GATEWAY_TOKEN não configurado nas variáveis de ambiente do Netlify",
      }),
    };
  }

  // ── 4. Executar a conversa via WebSocket ──
  try {
    const reply = await chatWithGateway({
      gatewayUrl: GATEWAY_URL,
      token: GATEWAY_TOKEN,
      clientId: CLIENT_ID,
      sessionKey,
      message: message.trim(),
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    console.error("[chat-proxy] Erro:", error);
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: "Falha na comunicação com o Gateway",
        detail: error.message || String(error),
      }),
    };
  }
};

// ── Função principal de comunicação ────────────

async function chatWithGateway({
  gatewayUrl,
  token,
  clientId,
  sessionKey,
  message,
}) {
  return new Promise((resolve, reject) => {
    // ── Timeout global ──
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Timeout ao aguardar resposta do Gateway"));
    }, RESPONSE_TIMEOUT_MS);

    // ── Abrir WebSocket ──
    const ws = new WebSocket(gatewayUrl, {
      headers: {
        Origin: "https://agente-pv.netlify.app",
      },
    });

    let currentRunId = null;
    let responseText = "";
    let responseState = null;
    let connected = false;

    // pending: id -> { resolve, reject }
    const pending = new Map();

    function cleanup() {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
    }

    function sendRequest(method, params) {
      return new Promise((resolveReq, rejectReq) => {
        const id = generateId();
        const frame = { type: "req", id, method, params };
        pending.set(id, { resolve: resolveReq, reject: rejectReq });
        try {
          ws.send(JSON.stringify(frame));
        } catch (err) {
          pending.delete(id);
          rejectReq(err);
        }
      });
    }

    async function doConnect() {
      connected = true;
      try {
        await sendRequest("connect", {
          minProtocol: 4,
          maxProtocol: 4,
          client: {
            id: "gateway-client",
            displayName: "Gabinete Filosófico (Proxy)",
            version: "1.0.0",
            platform: "server",
            mode: "webchat",
          },
          caps: ["tool-events"],
          role: "operator",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          auth: { token },
          locale: "pt-BR",
          userAgent: "Netlify-Function/1.0",
        });
        console.log("[chat-proxy] Conectado ao Gateway");

        // Agora envia a mensagem
        const result = await sendRequest("chat.send", {
          sessionKey,
          message,
          idempotencyKey: generateId(),
        });
        console.log("[chat-proxy] Mensagem enviada");
      } catch (err) {
        cleanup();
        reject(err);
      }
    }

    ws.on("open", () => {
      // Fallback: se challenge não chegar, conecta após 3s
      setTimeout(() => {
        if (!connected) doConnect();
      }, 3000);
    });

    ws.on("message", (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // ── connect.challenge ──
      if (frame.type === "event" && frame.event === "connect.challenge") {
        if (!connected) doConnect();
        return;
      }

      // ── Resposta a request (por id) ──
      if (frame.type === "res" && typeof frame.id === "string") {
        const pendingReq = pending.get(frame.id);
        if (!pendingReq) return;
        pending.delete(frame.id);
        if (frame.ok) {
          pendingReq.resolve(frame.payload);
        } else {
          const errMsg =
            (frame.error && frame.error.message) ||
            (frame.error && frame.error.code) ||
            "Erro do Gateway";
          pendingReq.reject(new Error(errMsg));
        }
        return;
      }

      // ── Evento de chat (streaming) ──
      if (frame.type === "event" && frame.event === "chat" && frame.payload) {
        const p = frame.payload;
        const state = p.state || p.status;
        const runId = p.runId;

        if (!runId) return;
        if (!currentRunId) currentRunId = runId;

        if (state === "delta" && typeof p.deltaText === "string") {
          responseText += p.deltaText;
        }

        if (state === "final") {
          responseState = "final";
          const finalText = extractText(p.message) || responseText;
          if (runId === currentRunId) {
            cleanup();
            resolve(finalText);
          }
        }

        if (state === "aborted" || state === "error") {
          responseState = state;
          const errText =
            p.errorMessage ||
            p.deltaText ||
            responseText ||
            "Resposta interrompida";
          cleanup();
          reject(new Error(errText));
        }
      }
    });

    ws.on("error", (err) => {
      cleanup();
      reject(new Error(`Erro no WebSocket: ${err.message}`));
    });

    ws.on("close", (code, reason) => {
      if (!responseState) {
        cleanup();
        reject(
          new Error(`Conexão fechada (${code}): ${reason || "sem motivo"}`)
        );
      }
    });
  });
}

// ── Utilitários ───────────────────────────────

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractText(value) {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object") return null;

  if (typeof value.deltaText === "string")
    return value.deltaText.trim() || null;
  if (typeof value.text === "string") return value.text.trim() || null;
  if (typeof value.content === "string") return value.content.trim() || null;

  if (Array.isArray(value.content)) {
    const parts = value.content
      .filter(
        (p) =>
          p &&
          typeof p === "object" &&
          p.type === "text" &&
          typeof p.text === "string"
      )
      .map((p) => p.text.trim());
    return parts.length ? parts.join("\n") : null;
  }

  return null;
}
