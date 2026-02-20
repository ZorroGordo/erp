import type { Config } from 'jest';

const config: Config = {
  preset:         'ts-jest',
  testEnvironment:'node',
  rootDir:        '.',
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/types/**',
    '!**/*.d.ts',
  ],
  coverageThresholds: {
    global: {
      branches:   60,
      functions:  70,
      lines:      70,
      statements: 70,
    },
  },
  coverageDirectory: 'coverage',
  setupFilesAfterFramework: [],
  testTimeout: 30000,
};

export default config;
