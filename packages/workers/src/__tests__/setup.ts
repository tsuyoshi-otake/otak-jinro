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

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Cloudflare Workers APIs
(global as any).Response = class MockResponse {
  constructor(public body: any, public init?: ResponseInit) {}
  
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
    return Promise.resolve(JSON.parse(this.body));
  }
  
  text() {
    return Promise.resolve(this.body);
  }
};

(global as any).Request = class MockRequest {
  constructor(public url: string, public init?: RequestInit) {}
  
  json() {
    return Promise.resolve(JSON.parse(this.init?.body as string || '{}'));
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

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
});