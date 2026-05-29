// ──────────────────────────────────────────────
// Netlify Function — Chat Proxy para OpenClaw
// netlify/functions/chat-proxy.mjs
//
// Recebe mensagens do frontend via HTTP POST,
// encaminha para o Gateway via HTTP API (/v1/responses)
// usando o token mestre (env var), e retorna a
// resposta completa.
//
// Variáveis de ambiente (Netlify):
//   OPENCLAW_GATEWAY_URL    — URL do Gateway (ex: https://agentepv-production.up.railway.app)
//   OPENCLAW_GATEWAY_TOKEN  — token de autenticação
// ──────────────────────────────────────────────

// ── Constantes ────────────────────────────────

const RESPONSE_TIMEOUT_MS = 25_000; // timeout total

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
    "https://agentepv-production.up.railway.app";
  const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

  if (!GATEWAY_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          "OPENCLAW_GATEWAY_TOKEN não configurado nas variáveis de ambiente do Netlify",
      }),
    };
  }

  // ── 4. Enviar via HTTP API do Gateway ──

  // Extrair base URL (remover wss:// caso tenha sido configurado assim)
  const baseUrl = GATEWAY_URL
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/+$/, "");

  const apiUrl = `${baseUrl}/v1/responses`;

  try {
    const reply = await sendViaHttpApi({
      apiUrl,
      token: GATEWAY_TOKEN,
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

// ── Envio via HTTP API (OpenResponses) ─────────

async function sendViaHttpApi({ apiUrl, token, sessionKey, message }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESPONSE_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-openclaw-session-key": sessionKey,
      },
      body: JSON.stringify({
        model: "openclaw/main",
        input: message,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Gateway HTTP ${response.status}: ${errorBody.slice(0, 500)}`
      );
    }

    const data = await response.json();

    // Extrair texto da resposta no formato OpenResponses
    const replyText = extractResponseText(data);

    if (!replyText) {
      throw new Error("Gateway retornou resposta vazia");
    }

    return replyText;
  } finally {
    clearTimeout(timer);
  }
}

// ── Extrair texto da resposta OpenResponses ────

function extractResponseText(data) {
  // Formato: { output: [ { role: "assistant", content: [ { type: "text", text: "..." } ] } ] }
  if (data?.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.role === "assistant" && Array.isArray(item.content)) {
        const parts = item.content
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text.trim());
        if (parts.length) return parts.join("\n");
      }
    }
  }

  // Fallback: se tiver output_text
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  return null;
}
