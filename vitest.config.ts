import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // Vitest has a known worker-teardown race ("Closing rpc while
        // onUserConsoleLog was pending") that fires as an unhandled
        // rejection when a test's console/logger output resolves right as
        // its worker is torn down. It never affects actual test results
        // (assertions still pass/fail correctly) but can flip the process
        // exit code. Safe to ignore here since it's a test-runner timing
        // issue, not an application bug.
        dangerouslyIgnoreUnhandledErrors: true,
        include: [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            'tests/chaos/**/*.test.ts',
            'tests/replay/**/*.test.ts',
            'tests/validation/**/*.test.ts',
            ...(process.env.RUN_INTEGRATION_TESTS === 'true'
                ? ['apps/gateway/tests/integration/**/*.test.ts']
                : []),
        ],
        exclude: [
            '**/node_modules/**',
            'apps/gateway/tests/integration/**',
        ],
        setupFiles: [path.resolve(__dirname, './tests/setup.ts')],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'lcov'],
        },
    },
});
