// Cloudflare Workers 型定義
export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
  PLAYER_DATA: KVNamespace;
  ENVIRONMENT: string;
  CORS_ORIGIN: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export interface DurableObject {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
  id: DurableObjectId;
  waitUntil(promise: Promise<any>): void;
}

export interface DurableObjectStorage {
  get<T = any>(key: string): Promise<T | undefined>;
  put<T = any>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T = any>(options?: {
    start?: string;
    end?: string;
    prefix?: string;
    reverse?: boolean;
    limit?: number;
  }): Promise<Map<string, T>>;
}

export interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
}

export interface DurableObjectNamespace {
  get(id: DurableObjectId): DurableObjectStub;
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
  id: DurableObjectId;
}

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: { name: string; expiration?: number; metadata?: any }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

// WebSocket関連
export interface CloudflareWebSocket extends WebSocket {
  accept(): void;
  serializeAttachment(attachment: any): void;
  deserializeAttachment(): any;
}

export interface WebSocketPair {
  0: CloudflareWebSocket;
  1: CloudflareWebSocket;
}

declare global {
  const WebSocketPair: {
    new (): WebSocketPair;
  };
}

// Response拡張
export interface ResponseInit {
  webSocket?: CloudflareWebSocket;
}