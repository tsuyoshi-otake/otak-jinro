// Jest setup file for Workers tests

// Mock Cloudflare Workers environment
global.fetch = jest.fn();

// Mock WebSocket
(global as any).WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 1, // OPEN
}));

// Mock WebSocketPair for Cloudflare Workers
(global as any).WebSocketPair = jest.fn(() => {
  const client = {
    accept: jest.fn(),
    addEventListener: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1
  };
  const server = {
    accept: jest.fn(),
    addEventListener: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1
  };
  
  const pair = [client, server];
  // Make it work with Object.values()
  (pair as any)[0] = client;
  (pair as any)[1] = server;
  
  return pair;
});

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Headers class
(global as any).Headers = class MockHeaders {
  private headersMap = new Map<string, string>();

  constructor(init?: Record<string, string> | Map<string, string> | Headers) {
    if (init) {
      if (init instanceof Map) {
        init.forEach((value, key) => {
          this.headersMap.set(key.toLowerCase(), value);
        });
      } else if (typeof init === 'object') {
        Object.entries(init).forEach(([key, value]) => {
          this.headersMap.set(key.toLowerCase(), value);
        });
      }
    }
  }

  get(key: string): string | null {
    return this.headersMap.get(key.toLowerCase()) || null;
  }

  set(key: string, value: string): void {
    this.headersMap.set(key.toLowerCase(), value);
  }

  has(key: string): boolean {
    return this.headersMap.has(key.toLowerCase());
  }

  delete(key: string): boolean {
    return this.headersMap.delete(key.toLowerCase());
  }

  forEach(callback: (value: string, key: string) => void): void {
    this.headersMap.forEach(callback);
  }

  entries() {
    return this.headersMap.entries();
  }

  keys() {
    return this.headersMap.keys();
  }

  values() {
    return this.headersMap.values();
  }
};

// Mock Cloudflare Workers APIs
(global as any).Response = class MockResponse {
  public status: number;
  public statusText: string;
  public headers: any;

  constructor(public body: any, public init?: ResponseInit & { webSocket?: any }) {
    this.status = init?.status || 200;
    this.statusText = init?.statusText || 'OK';
    this.headers = new (global as any).Headers(init?.headers);
    
    // WebSocket support for Cloudflare Workers
    if (init?.webSocket) {
      (this as any).webSocket = init.webSocket;
    }
  }
  
  static json(object: any, init?: ResponseInit) {
    return new MockResponse(JSON.stringify(object), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  }
  
  json() {
    try {
      return Promise.resolve(JSON.parse(this.body));
    } catch {
      return Promise.resolve({});
    }
  }
  
  text() {
    return Promise.resolve(this.body || '');
  }
};

(global as any).Request = class MockRequest {
  public method: string;
  public url: string;
  public headers: any;

  constructor(public input: string, public init?: RequestInit) {
    this.url = input;
    this.method = init?.method || 'GET';
    this.headers = new (global as any).Headers(init?.headers);
  }
  
  json() {
    try {
      return Promise.resolve(JSON.parse(this.init?.body as string || '{}'));
    } catch {
      return Promise.resolve({});
    }
  }
  
  text() {
    return Promise.resolve(this.init?.body as string || '');
  }
};

// Mock Durable Object storage
const mockStorage = new Map();

(global as any).DurableObjectStorage = class MockDurableObjectStorage {
  get(key: string) {
    return Promise.resolve(mockStorage.get(key));
  }
  
  put(key: string, value: any) {
    mockStorage.set(key, value);
    return Promise.resolve();
  }
  
  delete(key: string) {
    mockStorage.delete(key);
    return Promise.resolve();
  }
  
  list() {
    return Promise.resolve(mockStorage);
  }
};

// Mock crypto for UUID generation
(global as any).crypto = {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
  getRandomValues: (array: any) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
});

// Dummy test to satisfy Jest requirement
describe('Setup', () => {
  it('should initialize test environment', () => {
    expect(true).toBe(true);
  });

  it('should have mocked WebSocket', () => {
    expect((global as any).WebSocket).toBeDefined();
  });

  it('should have mocked WebSocketPair', () => {
    expect((global as any).WebSocketPair).toBeDefined();
  });

  it('should have mocked Response', () => {
    const response = new (global as any).Response('test', { status: 200 });
    expect(response.status).toBe(200);
  });

  it('should have mocked Request', () => {
    const request = new (global as any).Request('http://test.com', { method: 'POST' });
    expect(request.method).toBe('POST');
  });

  it('should have mocked DurableObjectStorage', () => {
    const storage = new (global as any).DurableObjectStorage();
    expect(storage.get).toBeDefined();
    expect(storage.put).toBeDefined();
  });

  it('should have mocked Headers', () => {
    const headers = new (global as any).Headers({ 'Content-Type': 'application/json' });
    expect(headers.get('content-type')).toBe('application/json');
  });
});