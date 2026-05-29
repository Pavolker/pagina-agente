import {
  buildDeviceAuthPayloadV3,
  clearDeviceAuthToken,
  loadDeviceAuthToken,
  loadOrCreateDeviceIdentity,
  signDevicePayload,
  storeDeviceAuthToken,
} from "./browser-device";

export const OPENCLAW_PROTOCOL_VERSION = 4 as const;
export const OPENCLAW_MIN_PROTOCOL_VERSION = 4 as const;

export const OPENCLAW_CONTROL_SCOPES = [
  "operator.admin",
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.pairing",
] as const;

export type OpenClawClientMode = "webchat";

export type OpenClawHelloOk = {
  type: "hello-ok";
  protocol: number;
  server?: {
    version?: string;
    connId?: string;
  };
  features?: {
    methods?: string[];
    events?: string[];
  };
  snapshot?: unknown;
  auth?: {
    role?: string;
    scopes?: string[];
    deviceToken?: string;
    issuedAtMs?: number;
  };
};

export type OpenClawEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type OpenClawRequestErrorInfo = {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
};

export type OpenClawConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type OpenClawClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientId?: string;
  displayName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: OpenClawClientMode;
  onHello?: (hello: OpenClawHelloOk) => void;
  onEvent?: (evt: OpenClawEventFrame) => void;
  onClose?: (info: { code: number; reason: string; error?: OpenClawRequestErrorInfo }) => void;
  onStatus?: (status: OpenClawConnectionStatus) => void;
};

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type WebSocketFrame = {
  type?: unknown;
  id?: unknown;
  ok?: unknown;
  method?: unknown;
  payload?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    retryable?: unknown;
    retryAfterMs?: unknown;
  };
  event?: unknown;
  seq?: unknown;
};

type ConnectParams = {
  minProtocol: typeof OPENCLAW_MIN_PROTOCOL_VERSION;
  maxProtocol: typeof OPENCLAW_PROTOCOL_VERSION;
  client: {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    mode: OpenClawClientMode;
  };
  caps: string[];
  role: string;
  scopes: string[];
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce: string;
  };
  auth?: {
    token?: string;
    deviceToken?: string;
    password?: string;
  };
  locale: string;
  userAgent: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return "";
  }
  if (typeof value.deltaText === "string") {
    return value.deltaText;
  }
  if (typeof value.text === "string") {
    return value.text;
  }
  if (typeof value.content === "string") {
    return value.content;
  }
  if (Array.isArray(value.content)) {
    const parts: string[] = [];
    for (const part of value.content) {
      if (!isRecord(part)) {
        continue;
      }
      if (part.type === "text" && typeof part.text === "string") {
        parts.push(part.text);
        continue;
      }
      if (part.type === "thinking") {
        continue;
      }
      if (part.type === "attachment") {
        const attachment = isRecord(part.attachment) ? part.attachment : null;
        const label = attachment && typeof attachment.label === "string" ? attachment.label : "anexo";
        parts.push(`[anexo: ${label}]`);
        continue;
      }
      if (part.type === "image") {
        parts.push("[imagem]");
      }
    }
    return parts.join("\n");
  }
  return "";
}

function isHiddenText(text: string): boolean {
  const normalized = text.trim();
  return normalized === "NO_REPLY" || normalized === "no_reply" || normalized === "HEARTBEAT_OK";
}

export function extractVisibleText(message: unknown): string {
  const text = toText(message).trim();
  return isHiddenText(text) ? "" : text;
}

export function normalizeChatMessage(
  message: unknown,
): { role: "user" | "assistant"; text: string; timestamp: number } | null {
  if (!isRecord(message)) {
    return null;
  }
  const role = typeof message.role === "string" ? message.role.toLowerCase() : "";
  if (role !== "user" && role !== "assistant") {
    return null;
  }
  const text = extractVisibleText(message) || "[sem texto]";
  const timestamp = typeof message.timestamp === "number" ? message.timestamp : Date.now();
  return { role, text, timestamp };
}

function formatConstructorError(err: unknown, url: string): OpenClawRequestErrorInfo {
  const message = err instanceof Error ? err.message : String(err);
  const securePage = typeof location !== "undefined" && location.protocol === "https:";
  const insecureWs = securePage && url.trim().toLowerCase().startsWith("ws://");
  return {
    code: insecureWs ? "BROWSER_WEBSOCKET_SECURITY_ERROR" : "BROWSER_WEBSOCKET_CONSTRUCTOR_ERROR",
    message: insecureWs
      ? "O navegador bloqueou `ws://` em uma página HTTPS. Use `wss://` no Netlify ou abra o gateway localmente."
      : `Não foi possível abrir o WebSocket do OpenClaw: ${message}`,
    details: {
      browserMessage: message,
      url,
    },
  };
}

function toRequestErrorInfo(err: unknown): OpenClawRequestErrorInfo {
  if (err instanceof Error) {
    const gatewayCode = (err as Error & { gatewayCode?: string }).gatewayCode;
    const details = (err as Error & { details?: unknown }).details;
    return {
      code: gatewayCode || "REQUEST_ERROR",
      message: err.message || "OpenClaw request failed",
      details,
    };
  }
  return {
    code: "REQUEST_ERROR",
    message: String(err),
  };
}

function isPermanentConnectError(error?: OpenClawRequestErrorInfo): boolean {
  const code = (error?.code ?? "").toUpperCase();
  return (
    code.includes("AUTH_") ||
    code.includes("PAIRING") ||
    code.includes("DEVICE_IDENTITY_REQUIRED") ||
    code.includes("ORIGIN_NOT_ALLOWED") ||
    code.includes("SECURITY")
  );
}

export class OpenClawChatClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private connectNonce: string | null = null;
  private connectTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private connectSent = false;
  private generation = 0;
  private closed = false;
  private reconnectDelayMs = 800;
  private pendingConnectError: OpenClawRequestErrorInfo | undefined;

  constructor(private readonly options: OpenClawClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    this.clearTimers();
    this.pendingConnectError = undefined;
    if (this.ws) {
      this.ws.close(1000, "client closed");
    }
    this.ws = null;
    this.flushPending(new Error("OpenClaw connection closed"));
    this.options.onStatus?.("disconnected");
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("OpenClaw connection is not open"));
    }
    return this.requestOnSocket<T>(this.ws, method, params);
  }

  private connect() {
    if (this.closed) {
      return;
    }
    this.options.onStatus?.(this.reconnectTimer ? "reconnecting" : "connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch (err) {
      const error = formatConstructorError(err, this.options.url);
      this.pendingConnectError = error;
      this.options.onClose?.({ code: 1006, reason: "websocket error", error });
      this.options.onStatus?.("disconnected");
      return;
    }

    const generation = ++this.generation;
    this.ws = socket;
    this.connectSent = false;
    this.connectNonce = null;

    socket.addEventListener("open", () => {
      if (!this.isActiveSocket(socket, generation)) {
        return;
      }
      this.scheduleConnect(socket, generation);
    });

    socket.addEventListener("message", (event) => {
      if (!this.isActiveSocket(socket, generation)) {
        return;
      }
      this.handleMessage(socket, generation, String(event.data ?? ""));
    });

    socket.addEventListener("close", (event) => {
      if (this.ws !== socket) {
        return;
      }
      const reason = event.reason || "";
      const connectError = this.pendingConnectError;
      this.pendingConnectError = undefined;
      this.ws = null;
      this.flushPending(new Error(`OpenClaw closed (${event.code}): ${reason}`));

      if (this.closed) {
        this.options.onStatus?.("disconnected");
        return;
      }

      this.options.onClose?.({ code: event.code, reason, error: connectError });
      if (isPermanentConnectError(connectError)) {
        this.options.onStatus?.("disconnected");
        return;
      }

      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      // close handler handles state transitions
    });
  }

  private scheduleConnect(socket: WebSocket, generation: number) {
    if (!this.isActiveSocket(socket, generation)) {
      return;
    }
    this.clearConnectTimer();
    this.connectTimer = window.setTimeout(() => {
      this.connectTimer = null;
      void this.sendConnect(socket, generation);
    }, 750);
  }

  private scheduleReconnect() {
    if (this.closed) {
      return;
    }
    this.clearTimers();
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 1.7, 15_000);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.options.onStatus?.("reconnecting");
  }

  private clearTimers() {
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectTimer() {
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private async sendConnect(socket: WebSocket, generation: number) {
    if (!this.isActiveSocket(socket, generation) || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    this.clearConnectTimer();

    const deviceIdentity = await loadOrCreateDeviceIdentity();
    const storedDeviceAuth = loadDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role: "operator" });
    const explicitToken = this.options.token?.trim() || undefined;
    const explicitPassword = this.options.password?.trim() || undefined;
    const resolvedToken = explicitToken ?? (!explicitToken && !explicitPassword ? storedDeviceAuth?.token : undefined);
    const signedAtMs = Date.now();
    const nonce = this.connectNonce ?? "";
    const payload = buildDeviceAuthPayloadV3({
      deviceId: deviceIdentity.deviceId,
      clientId: this.options.clientId?.trim() || "gabinete-filosofo",
      clientMode: this.options.mode ?? "webchat",
      role: "operator",
      scopes: [...OPENCLAW_CONTROL_SCOPES],
      signedAtMs,
      token: resolvedToken ?? null,
      nonce,
      platform: this.options.platform?.trim() || navigator.platform || "web",
    });
    const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
    const connectParams: ConnectParams = {
      minProtocol: OPENCLAW_MIN_PROTOCOL_VERSION,
      maxProtocol: OPENCLAW_PROTOCOL_VERSION,
      client: {
        id: this.options.clientId?.trim() || "gabinete-filosofo",
        displayName: this.options.displayName?.trim() || "Gabinete Filosófico",
        version: this.options.clientVersion?.trim() || "1.0.0",
        platform: this.options.platform?.trim() || navigator.platform || "web",
        mode: this.options.mode ?? "webchat",
      },
      caps: ["tool-events"],
      role: "operator",
      scopes: [...OPENCLAW_CONTROL_SCOPES],
      device: {
        id: deviceIdentity.deviceId,
        publicKey: deviceIdentity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      },
      locale: navigator.language,
      userAgent: navigator.userAgent,
    };

    const token = explicitToken ?? "";
    const password = explicitPassword ?? "";
    if (token || password || storedDeviceAuth?.token) {
      connectParams.auth = {};
      if (token) {
        connectParams.auth.token = token;
      }
      if (!token && !password && storedDeviceAuth?.token) {
        connectParams.auth.deviceToken = storedDeviceAuth.token;
      }
      if (password) {
        connectParams.auth.password = password;
      }
    }

    try {
      const hello = await this.requestOnSocket<OpenClawHelloOk>(socket, "connect", connectParams);
      if (!this.isActiveSocket(socket, generation)) {
        return;
      }
      this.pendingConnectError = undefined;
      this.reconnectDelayMs = 800;
      if (typeof hello.auth?.deviceToken === "string" && hello.auth.deviceToken.trim()) {
        storeDeviceAuthToken({
          deviceId: deviceIdentity.deviceId,
          role: hello.auth.role || "operator",
          token: hello.auth.deviceToken,
          scopes: Array.isArray(hello.auth.scopes) ? hello.auth.scopes : [],
        });
      }
      this.options.onHello?.(hello);
      this.options.onStatus?.("connected");
    } catch (err) {
      this.pendingConnectError = toRequestErrorInfo(err);
      if (this.pendingConnectError.code === "AUTH_DEVICE_TOKEN_MISMATCH") {
        clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role: "operator" });
      }
      this.options.onStatus?.("disconnected");
      socket.close(1008, "connect failed");
    }
  }

  private handleMessage(socket: WebSocket, generation: number, raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const frame = parsed as WebSocketFrame;
    if (frame.type === "event") {
      if (frame.event === "connect.challenge") {
        const payload = isRecord(frame.payload) ? frame.payload : null;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        this.connectNonce = nonce;
        void this.sendConnect(socket, generation);
        return;
      }
      this.options.onEvent?.(parsed as OpenClawEventFrame);
      return;
    }
    if (frame.type !== "res") {
      return;
    }
    const pendingId = typeof frame.id === "string" ? frame.id : "";
    if (!pendingId) {
      return;
    }
    const pending = this.pending.get(pendingId);
    if (!pending) {
      return;
    }
    this.pending.delete(pendingId);
    if (frame.ok) {
      pending.resolve(frame.payload);
      return;
    }
    const error = new Error(
      typeof frame.error?.message === "string" ? frame.error.message : "OpenClaw request failed",
    );
    (error as Error & { gatewayCode?: string; details?: unknown }).gatewayCode =
      typeof frame.error?.code === "string" ? frame.error.code : undefined;
    (error as Error & { gatewayCode?: string; details?: unknown }).details = frame.error?.details;
    pending.reject(error);
  }

  private requestOnSocket<T = unknown>(
    socket: WebSocket,
    method: string,
    params?: unknown,
  ): Promise<T> {
    if (this.ws !== socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("OpenClaw connection is not open"));
    }
    const id = generateRequestId();
    const payload = { type: "req", id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
      this.pending.delete(id);
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    return promise;
  }

  private flushPending(err: Error) {
    for (const [id, pending] of this.pending) {
      pending.reject(err);
      this.pending.delete(id);
    }
  }

  private isActiveSocket(socket: WebSocket, generation: number) {
    return !this.closed && this.ws === socket && this.generation === generation;
  }
}
