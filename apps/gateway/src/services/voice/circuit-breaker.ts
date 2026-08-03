/**
 * Circuit Breaker
 * Prevents cascading failures by failing fast when a service is down.
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
 */

export class CircuitBreaker {
    private failures = 0;
    private successCount = 0;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private lastFailureTime = 0;
    private readonly threshold: number;
    private readonly recoveryTimeoutMs: number;
    private readonly halfOpenSuccesses: number;
    private readonly timeoutMs: number;

    constructor(options: { threshold?: number; recoveryTimeoutMs?: number; halfOpenSuccesses?: number; timeout?: number } = {}) {
        this.threshold = options.threshold || 3;
        this.recoveryTimeoutMs = options.recoveryTimeoutMs || 30000;
        this.halfOpenSuccesses = options.halfOpenSuccesses || 2;
        this.timeoutMs = options.timeout ?? 10000;
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.recoveryTimeoutMs) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                throw new Error(`Circuit breaker OPEN — service unavailable`);
            }
        }

        try {
            // Race fn() against a timeout so a hung socket trips the breaker
            // instead of hanging the turn. A timeout falls through to onFailure().
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`Circuit breaker timeout after ${this.timeoutMs}ms`)),
                    this.timeoutMs
                );
            });
            try {
                const result = await Promise.race([fn(), timeoutPromise]);
                this.onSuccess();
                return result;
            } finally {
                if (timer) clearTimeout(timer);
            }
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.halfOpenSuccesses) {
                this.state = 'CLOSED';
                this.failures = 0;
            }
        } else {
            this.failures = 0;
        }
    }

    private onFailure(): void {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
        }
    }

    getState(): string {
        return this.state;
    }

    reset(): void {
        this.state = 'CLOSED';
        this.failures = 0;
        this.successCount = 0;
    }
}

export const aiCircuitBreaker = new CircuitBreaker({ threshold: 3, recoveryTimeoutMs: 15000 });
export const ttsCircuitBreaker = new CircuitBreaker({ threshold: 2, recoveryTimeoutMs: 10000 });
export const sttCircuitBreaker = new CircuitBreaker({ threshold: 3, recoveryTimeoutMs: 20000 });
