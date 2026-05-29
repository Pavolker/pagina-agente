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

async function chatWithGateway({ gatewayUrl, token, clientId, sessionKey, message }) {
  return new Promise((resolve, reject) => {
    // ── Timeout global ──
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Timeout ao aguardar resposta do Gateway"));
    }, RESPONSE_TIMEOUT_MS);

    // ── Abrir WebSocket ──
    const ws = new WebSocket(gatewayUrl);
    let connected = false;
    let challengeNonce = null;
    let currentRunId = null;
    let responseText = "";
    let responseState = null;
    let pongTimeout = null;

    function cleanup() {
      if (pongTimeout) clearTimeout(pongTimeout);
      clearTimeout(timer);
      try { ws.close(); } catch {}
    }

    function pong() {
      if (pongTimeout) clearTimeout(pongTimeout);
      pongTimeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timeout sem resposta do Gateway"));
      }, 20000);
    }

    function doConnect() {
      if (connected) return;
      connected = true;
      const nonce = challengeNonce || "";
      const payload = {
        type: "req",
        id: generateId(),
        method: "connect",
        params: {
          minProtocol: 4,
          maxProtocol: 4,
          client: {
            id: clientId,
            displayName: "Gabinete Filosófico (Proxy)",
            version: "1.0.0",
            platform: "server",
            mode: "webchat",
          },
          caps: ["tool-events"],
          role: "operator",
          scopes: [
            "operator.admin",
            "operator.read",
            "operator.write",
          ],
          device: {
            id: clientId,
            nonce,
          },
          auth: {
            token,
          },
          locale: "pt-BR",
          userAgent: "Netlify-Function/1.0",
        },
      };
      ws.send(JSON.stringify(payload));
    }

    ws.on("open", () => {
      pong();
      // Se nenhum challenge chegar em 1s, tenta conectar mesmo assim
      setTimeout(() => {
        if (!connected) doConnect();
      }, 1000);
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
        challengeNonce = frame.payload?.nonce || null;
        if (!connected) doConnect();
        return;
      }

      // ── hello-ok: conexão estabelecida ──
      if (
        frame.type === "res" &&
        frame.method === "connect" &&
        frame.ok === true
      ) {
        pong();
        console.log("[chat-proxy] Conectado ao Gateway, enviando mensagem...");
        // Enviar mensagem
        const chatPayload = {
          type: "req",
          id: generateId(),
          method: "chat.send",
          params: {
            sessionKey,
            message,
            idempotencyKey: generateId(),
          },
        };
        ws.send(JSON.stringify(chatPayload));
        return;
      }

      // ── Resposta com erro ──
      if (frame.type === "res" && frame.id) {
        pong();
        if (frame.ok === false || frame.error) {
          cleanup();
          reject(
            new Error(
              (frame.error && frame.error.message) ||
                frame.error?.code ||
                "Erro do Gateway"
            )
          );
          return;
        }
        // Confirmação de chat.send — pegar runId
        if (frame.method === "chat.send" && frame.payload?.runId) {
          currentRunId = frame.payload.runId;
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
          pong();
          responseText += p.deltaText;
        }

        if (state === "final") {
          responseState = "final";
          const finalText =
            extractText(p.message) || responseText;
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
          new Error(
            `Conexão fechada (${code}): ${reason || "sem motivo"}`
          )
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

  if (typeof value.deltaText === "string") return value.deltaText.trim() || null;
  if (typeof value.text === "string") return value.text.trim() || null;
  if (typeof value.content === "string") return value.content.trim() || null;

  if (Array.isArray(value.content)) {
    const parts = value.content
      .filter((p) => p && typeof p === "object" && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text.trim());
    return parts.length ? parts.join("\n") : null;
  }

  return null;
}
