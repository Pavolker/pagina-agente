# Gabinete Filosófico

Interface pública em React/Vite para conversar com um agente OpenClaw.

## Desenvolvimento local

1. Instale as dependências com `npm install`.
2. Execute `npm run dev`.
3. Abra a aplicação e ajuste a URL do gateway no terminal lateral.

## Configuração do chat

A interface usa WebSocket direto com o gateway OpenClaw.

Campos principais:
- `Gateway URL`: endereço `wss://` do gateway.
- `Session key`: sessão ativa usada em `chat.history`, `chat.send` e `chat.abort`.
- `Token` e `Password`: autenticação opcional, se o gateway exigir.

## Netlify Function (chat-proxy)

Para deploy com autenticação segura (token não exposto no navegador),
a página inclui uma **Netlify Function** que faz a ponte entre o
frontend e o Gateway.

### Variáveis de ambiente (Netlify)

Configure no painel do Netlify:

| Variável | Valor |
|----------|-------|
| `OPENCLAW_GATEWAY_URL` | `wss://agentepv-production.up.railway.app` |
| `OPENCLAW_GATEWAY_TOKEN` | token de autenticação do Gateway |

### Endpoint

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/.netlify/functions/chat-proxy` | Envia mensagem e recebe resposta |

**Body:**
```json
{
  "message": "sua pergunta",
  "sessionKey": "main"
}
```

**Response:**
```json
{
  "reply": "resposta do agente"
}
```

### Dependências

```bash
npm install ws
```

---

Observação:
- Se a página estiver hospedada no Netlify e o gateway recusar a origem, adicione o domínio publicado a `gateway.controlUi.allowedOrigins` no OpenClaw.
- A Netlify Function `chat-proxy` resolve esse problema mantendo o token no servidor.
