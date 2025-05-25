// Jest setup file for Workers tests

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock WebSocket class
class MockWebSocket {
  send = jest.fn();
  close = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  readyState = 1; // OPEN
  accept = jest.fn();
  
  constructor() {
    // WebSocket is ready immediately in tests
    setTimeout(() => {
      if (this.addEventListener.mock.calls.length > 0) {
        this.addEventListener.mock.calls.forEach(([event, handler]) => {
          if (event === 'open') {
            handler({ type: 'open' });
          }
        });
      }
    }, 0);
  }
}

// Mock WebSocketPair that returns two connected WebSocket instances
class MockWebSocketPair {
  constructor() {
    const client = new MockWebSocket();
    const server = new MockWebSocket();
    
    // Link the sockets so they can communicate
    client.send = jest.fn((data) => {
      // Simulate message being received by server
      setTimeout(() => {
        server.addEventListener.mock.calls.forEach(([event, handler]) => {
          if (event === 'message') {
            handler({ type: 'message', data });
          }
        });
      }, 0);
    });
    
    server.send = jest.fn((data) => {
      // Simulate message being received by client
      setTimeout(() => {
        client.addEventListener.mock.calls.forEach(([event, handler]) => {
          if (event === 'message') {
            handler({ type: 'message', data });
          }
        });
      }, 0);
    });
    
    // Return array-like object that Object.values() can work with
    const pair = Object.assign([client, server], {
      0: client,
      1: server,
      length: 2
    });
    
    return pair;
  }
}

// Set up global mocks
(global as any).WebSocket = MockWebSocket;
(global as any).WebSocketPair = MockWebSocketPair;

// Mock fetch
global.fetch = jest.fn();

// Mock Headers class
(global as any).Headers = class MockHeaders {
  private headersMap = new Map<string, string>();

  constructor(init?: any) {
    if (init) {
      if (init instanceof MockHeaders) {
        init.forEach((value: string, key: string) => {
          this.headersMap.set(key.toLowerCase(), value);
        });
      } else if (typeof init === 'object') {
        Object.entries(init).forEach(([key, value]) => {
          this.headersMap.set(key.toLowerCase(), value as string);
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

// Mock Response class
(global as any).Response = class MockResponse {
  public status: number;
  public statusText: string;
  public headers: any;
  public webSocket?: any;

  constructor(public body: any, public init?: any) {
    this.status = init?.status || 200;
    this.statusText = init?.statusText || 'OK';
    this.headers = new (global as any).Headers(init?.headers);
    
    // WebSocket support for Cloudflare Workers
    if (init?.webSocket) {
      this.webSocket = init.webSocket;
    }
  }
  
  static json(object: any, init?: any) {
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

// Mock Request class
(global as any).Request = class MockRequest {
  public method: string;
  public url: string;
  public headers: any;

  constructor(public input: string, public init?: any) {
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
  
  deleteAll() {
    mockStorage.clear();
    return Promise.resolve();
  }
  
  transaction(fn: any) {
    return Promise.resolve(fn(this));
  }
  
  getAlarm() {
    return Promise.resolve(null);
  }
  
  setAlarm() {
    return Promise.resolve();
  }
  
  deleteAlarm() {
    return Promise.resolve();
  }
  
  sync() {
    return Promise.resolve();
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
    const ws = new (global as any).WebSocket();
    expect(ws.send).toBeDefined();
    expect(ws.close).toBeDefined();
    expect(ws.addEventListener).toBeDefined();
  });

  it('should have mocked WebSocketPair', () => {
    const pair = new (global as any).WebSocketPair();
    expect(pair).toHaveLength(2);
    expect(pair[0]).toBeDefined();
    expect(pair[1]).toBeDefined();
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