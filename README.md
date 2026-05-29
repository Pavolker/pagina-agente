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

Observação:
- Se a página estiver hospedada no Netlify e o gateway recusar a origem, adicione o domínio publicado a `gateway.controlUi.allowedOrigins` no OpenClaw.
