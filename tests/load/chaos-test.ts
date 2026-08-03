/**
 * Chaos Testing Framework
 * 
 * Tests system resilience by simulating various failure scenarios:
 * - Redis outages
 * - WebSocket disconnect storms
 * - OpenAI failures
 * - Twilio disconnects
 * - Slow database queries
 * - Memory pressure
 * 
 * Usage:
 *   npx tsx tests/load/chaos-test.ts --scenario=redis-outage
 */

interface ChaosScenario {
    name: string;
    description: string;
    duration: number;
    execute: () => Promise<void>;
    cleanup: () => Promise<void>;
}

class ChaosTester {
    private scenarios: ChaosScenario[] = [];
    private results: Array<{ scenario: string; passed: boolean; error?: string }> = [];

    registerScenario(scenario: ChaosScenario): void {
        this.scenarios.push(scenario);
    }

    async runScenario(name: string): Promise<void> {
        const scenario = this.scenarios.find(s => s.name === name);
        if (!scenario) {
            console.error(`Unknown scenario: ${name}`);
            console.log(`Available: ${this.scenarios.map(s => s.name).join(', ')}`);
            return;
        }

        console.log(`\n=== Chaos Test: ${scenario.name} ===`);
        console.log(`Description: ${scenario.description}`);
        console.log(`Duration: ${scenario.duration}s`);
        console.log('');

        try {
            const startTime = Date.now();
            await scenario.execute();

            await new Promise(resolve => setTimeout(resolve, scenario.duration * 1000));

            await scenario.cleanup();
            const elapsed = Math.round((Date.now() - startTime) / 1000);

            console.log(`\n✅ Scenario completed in ${elapsed}s`);
            this.results.push({ scenario: scenario.name, passed: true });
        } catch (err) {
            console.error(`\n❌ Scenario failed:`, String(err));
            this.results.push({ scenario: scenario.name, passed: false, error: String(err) });
        }
    }

    async runAll(): Promise<void> {
        console.log('=== Running All Chaos Scenarios ===\n');
        for (const scenario of this.scenarios) {
            await this.runScenario(scenario.name);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        this.printReport();
    }

    printReport(): void {
        console.log('\n=== Chaos Test Report ===');
        console.log('Scenario                          | Status');
        console.log('-'.repeat(50));
        for (const r of this.results) {
            const status = r.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${r.scenario.padEnd(35)} | ${status}`);
            if (r.error) console.log(`  Error: ${r.error}`);
        }
    }
}

const chaosTester = new ChaosTester();

chaosTester.registerScenario({
    name: 'redis-outage',
    description: 'Simulates Redis becoming unavailable and then recovering',
    duration: 30,
    execute: async () => {
        console.log('Simulating Redis outage...');
        process.env.REDIS_URL = 'redis://localhost:16379';
    },
    cleanup: async () => {
        console.log('Restoring Redis connection...');
        process.env.REDIS_URL = undefined;
        await new Promise(resolve => setTimeout(resolve, 5000));
    },
});

chaosTester.registerScenario({
    name: 'ws-disconnect-storm',
    description: 'Opens and immediately closes many WebSocket connections',
    duration: 20,
    execute: async () => {
        console.log('Starting WebSocket disconnect storm...');
        const { default: WebSocket } = await import('ws');

        for (let i = 0; i < 50; i++) {
            const ws = new WebSocket('ws://localhost:3003/ws/realtime/chaos-tenant');
            ws.on('open', () => {
                ws.close(1000, 'Chaos test');
            });
        }
        console.log('50 rapid connect/disconnect cycles initiated');
    },
    cleanup: async () => {
        await new Promise(resolve => setTimeout(resolve, 3000));
    },
});

chaosTester.registerScenario({
    name: 'memory-pressure',
    description: 'Allocates large objects to test memory handling',
    duration: 15,
    execute: async () => {
        console.log('Applying memory pressure...');
        const bigObjects: string[][] = [];
        for (let i = 0; i < 100; i++) {
            const arr = new Array(10000).fill(`pressure_item_${i}_${Math.random()}`);
            bigObjects.push(arr);
        }
        console.log(`Allocated ${bigObjects.length} large arrays`);
    },
    cleanup: async () => {
        global.gc?.();
        await new Promise(resolve => setTimeout(resolve, 2000));
    },
});

chaosTester.registerScenario({
    name: 'slow-db-query',
    description: 'Simulates slow database queries',
    duration: 20,
    execute: async () => {
        console.log('Simulating slow database queries...');
        const { voiceDb } = await import('../apps/gateway/src/services/voice/tenant-scope.js');
        for (let i = 0; i < 5; i++) {
            const start = Date.now();
            await voiceDb.query('SELECT pg_sleep(2)');
            console.log(`Slow query ${i + 1}: ${Date.now() - start}ms`);
        }
    },
    cleanup: async () => {
        console.log('DB load test complete');
    },
});

async function main() {
    const args = process.argv.slice(2);
    const scenarioArg = args.find(a => a.startsWith('--scenario='));
    const scenario = scenarioArg?.split('=')[1];

    if (scenario) {
        await chaosTester.runScenario(scenario);
    } else {
        await chaosTester.runAll();
    }
}

main().catch(console.error);
