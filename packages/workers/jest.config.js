module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  testPathIgnorePatterns: [
    'src/__tests__/gameRoom.pbt.test.ts',
    'src/__tests__/setup.ts'
  ],
  // setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'], // 一時的に無効化
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020', 'WebWorker'],
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        types: ['jest', 'node']
      }
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!.*)'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  // setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'], // 一時的に無効化
  testTimeout: 10000
};