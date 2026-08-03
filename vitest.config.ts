import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
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
