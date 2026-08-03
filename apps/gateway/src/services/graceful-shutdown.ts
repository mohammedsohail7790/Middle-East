import { Server as HttpServer } from 'http';
import { logger } from './logger.js';

interface DrainingService {
    name: string;
    shutdown: () => Promise<void>;
    // 'critical' = call-record persistence that MUST finish before exit (Phase 2).
    // 'noncritical' (default) = post-call evals, Slack, analytics (Phase 3, best-effort).
    phase?: 'critical' | 'noncritical';
}

// Services that own active call-record DB persistence default to the critical phase
// even if a caller did not set `phase` explicitly.
const CRITICAL_SERVICE_NAMES = new Set(['realtime-gateway', 'postgres-pool', 'integration-worker']);

const PHASE_1_BUDGET_MS = 5000;
const PHASE_2_BUDGET_MS = 15000;

function isCritical(svc: DrainingService): boolean {
    if (svc.phase) return svc.phase === 'critical';
    return CRITICAL_SERVICE_NAMES.has(svc.name);
}

const services: DrainingService[] = [];
let isShuttingDown = false;
let shutdownTimeout: NodeJS.Timeout | null = null;

export function registerService(service: DrainingService): void {
    services.push(service);
    logger.debug('Registered service for graceful shutdown', { service: service.name });
}

export async function shutdown(signal: string, server: HttpServer): Promise<void> {
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring duplicate signal');
        return;
    }
    isShuttingDown = true;

    logger.info(`Received ${signal}, initiating graceful shutdown`, {
        signal,
        serviceCount: services.length,
        uptimeSeconds: Math.round(process.uptime()),
    });

    const forceExit = setTimeout(() => {
        logger.error('Forced shutdown after timeout — services did not drain in time', {
            remainingServices: services.map(s => s.name),
        });
        process.exit(1);
    }, 30000);

    shutdownTimeout = forceExit;

    try {
        // Phase 1: stop accepting new connections (call server.close first).
        await withDeadline(closeServer(server), PHASE_1_BUDGET_MS, 'phase1_close_server');

        // Phase 2: drain critical call-record persistence — these MUST complete.
        const critical = services.filter(isCritical);
        await drainPhase(critical, PHASE_2_BUDGET_MS, 'critical');

        // Phase 3: best-effort non-critical cleanup with whatever time remains.
        const noncritical = services.filter(s => !isCritical(s));
        await drainPhase(noncritical, undefined, 'noncritical');

        logger.info('Graceful shutdown complete');
        clearTimeout(forceExit);
        process.exit(0);
    } catch (err) {
        logger.error('Error during graceful shutdown', { error: String(err) });
        clearTimeout(forceExit);
        process.exit(1);
    }
}

// Race a promise against a deadline; resolves on timeout so shutdown keeps moving.
function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            logger.warn('Shutdown phase exceeded deadline', { label, deadlineMs: ms });
            resolve();
        }, ms);
        p.then(() => { clearTimeout(timer); resolve(); })
         .catch((err) => {
            clearTimeout(timer);
            logger.error('Shutdown phase errored', { label, error: String(err) });
            resolve();
         });
    });
}

async function drainPhase(
    phaseServices: DrainingService[],
    budgetMs: number | undefined,
    label: string
): Promise<void> {
    if (phaseServices.length === 0) return;

    const drainAll = Promise.allSettled(
        phaseServices.map(async (svc) => {
            const start = Date.now();
            try {
                await svc.shutdown();
                logger.debug(`Service drained successfully`, {
                    service: svc.name,
                    phase: label,
                    durationMs: Date.now() - start,
                });
            } catch (err) {
                logger.error(`Service drain failed`, {
                    service: svc.name,
                    phase: label,
                    error: String(err),
                    durationMs: Date.now() - start,
                });
            }
        })
    );

    if (budgetMs === undefined) {
        await drainAll;
    } else {
        await withDeadline(drainAll, budgetMs, `drain_${label}`);
    }
}

function closeServer(server: HttpServer): Promise<void> {
    return new Promise((resolve) => {
        server.close((err) => {
            if (err) {
                logger.error('Error closing HTTP server', { error: String(err) });
            } else {
                logger.info('HTTP server closed');
            }
            resolve();
        });
    });
}

export function isShuttingDownFlag(): boolean {
    return isShuttingDown;
}

export function resetShutdownState(): void {
    isShuttingDown = false;
    if (shutdownTimeout) {
        clearTimeout(shutdownTimeout);
        shutdownTimeout = null;
    }
}
