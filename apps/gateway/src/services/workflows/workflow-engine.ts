import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../logger.js';
import { eventBus, EventPayload, EventType } from './event-bus.js';

interface WorkflowStep {
    name: string;
    delay?: number;
    maxRetries?: number;
    execute: (event: EventPayload, context: WorkflowContext) => Promise<void>;
}

interface WorkflowDefinition {
    id: string;
    name: string;
    trigger: EventType | EventType[];
    condition?: (event: EventPayload) => boolean;
    steps: WorkflowStep[];
    maxRetries?: number;
}

interface WorkflowContext {
    workflowId: string;
    executionId: string;
    stepResults: Map<string, any>;
    retryCount: number;
    startTime: number;
}

interface ScheduledAction {
    id: string;
    type: string;
    executeAt: number;
    tenantId: string;
    data: any;
    executed: boolean;
}

export class WorkflowEngine {
    private workflows: WorkflowDefinition[] = [];
    private scheduledActions: ScheduledAction[] = [];
    private queue: Queue | null = null;
    private worker: Worker | null = null;
    private checkInterval: NodeJS.Timeout | null = null;
    private unsubscribers: Array<() => void> = [];
    private degraded = false;

    async initialize(redisUrl?: string): Promise<void> {
        logger.warn('SCHEDULED_ACTIONS_IN_MEMORY', {
            message: 'Scheduled actions are stored in memory and will be lost on restart. Migrate to BullMQ delayed jobs for production durability.',
        });

        const url = redisUrl || process.env.REDIS_URL;
        if (!url) {
            this.degraded = true;
            logger.warn('WORKFLOW_ENGINE_NO_REDIS', { message: 'Redis required for workflow engine' });
            return;
        }

        this.queue = new Queue('calliq-workflows', {
            connection: { url },
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 100,
                removeOnFail: 50,
            },
        });

        this.worker = new Worker('calliq-workflows', async (job) => {
            await this.executeWorkflowJob(job);
        }, {
            connection: { url },
            concurrency: 5,
            drainDelay: 5000,
        });

        this.worker.on('failed', (job, err) => {
            logger.error('WORKFLOW_JOB_FAILED', {
                jobId: job?.id,
                workflow: job?.name,
                error: String(err),
            });
        });

        this.startScheduler();
        this.registerBuiltinWorkflows();

        logger.info('WORKFLOW_ENGINE_INITIALIZED');
    }

    registerWorkflow(workflow: WorkflowDefinition): void {
        this.workflows.push(workflow);

        const eventTypes = Array.isArray(workflow.trigger) ? workflow.trigger : [workflow.trigger];

        const unsub = eventBus.subscribeToMany(
            eventTypes,
            async (event) => {
                if (workflow.condition && !workflow.condition(event)) return;
                await this.scheduleWorkflow(workflow, event);
            },
            `Workflow: ${workflow.name}`
        );

        this.unsubscribers.push(unsub);

        logger.info('WORKFLOW_REGISTERED', {
            id: workflow.id,
            name: workflow.name,
            trigger: workflow.trigger,
            steps: workflow.steps.length,
        });
    }

    private async scheduleWorkflow(workflow: WorkflowDefinition, event: EventPayload): Promise<void> {
        if (!this.queue) return;

        const jobId = `wf_${workflow.id}_${event.tenantId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        await this.queue.add(workflow.id, {
            workflow,
            event,
            context: {
                workflowId: workflow.id,
                executionId: jobId,
                stepResults: new Map(),
                retryCount: 0,
                startTime: Date.now(),
            },
        }, {
            jobId,
            attempts: (workflow.maxRetries ?? 1) + 1,
        });

        logger.debug('WORKFLOW_SCHEDULED', {
            workflowId: workflow.id,
            jobId,
            eventType: event.type,
        });
    }

    private async executeWorkflowJob(job: Job): Promise<void> {
        const { workflow, event, context } = job.data as {
            workflow: WorkflowDefinition;
            event: EventPayload;
            context: WorkflowContext;
        };

        logger.info('WORKFLOW_EXECUTING', {
            workflowId: workflow.id,
            executionId: context.executionId,
            eventType: event.type,
            stepCount: workflow.steps.length,
        });

        for (let i = 0; i < workflow.steps.length; i++) {
            const step = workflow.steps[i];
            const stepStart = Date.now();

            try {
                if (step.delay) {
                    await new Promise(resolve => setTimeout(resolve, step.delay));
                }

                await step.execute(event, context);

                logger.debug('WORKFLOW_STEP_COMPLETED', {
                    workflowId: workflow.id,
                    step: step.name,
                    durationMs: Date.now() - stepStart,
                });
            } catch (err) {
                logger.error('WORKFLOW_STEP_FAILED', {
                    workflowId: workflow.id,
                    step: step.name,
                    error: String(err),
                    attempt: (job.attemptsMade || 0) + 1,
                });

                if ((job.attemptsMade || 0) >= (workflow.maxRetries ?? 1)) {
                    logger.error('WORKFLOW_STEP_EXHAUSTED', {
                        workflowId: workflow.id,
                        step: step.name,
                        maxRetries: workflow.maxRetries,
                    });
                }

                throw err;
            }
        }

        logger.info('WORKFLOW_COMPLETED', {
            workflowId: workflow.id,
            executionId: context.executionId,
            durationMs: Date.now() - context.startTime,
        });
    }

    scheduleAction(action: ScheduledAction): void {
        this.scheduledActions.push(action);
        logger.debug('WORKFLOW_ACTION_SCHEDULED', {
            id: action.id,
            type: action.type,
            executeAt: new Date(action.executeAt).toISOString(),
        });
    }

    cancelScheduledAction(id: string): boolean {
        const idx = this.scheduledActions.findIndex(a => a.id === id);
        if (idx >= 0) {
            this.scheduledActions.splice(idx, 1);
            return true;
        }
        return false;
    }

    private startScheduler(): void {
        this.checkInterval = setInterval(() => {
            const now = Date.now();
            const toExecute = this.scheduledActions.filter(
                a => !a.executed && a.executeAt <= now
            );

            for (const action of toExecute) {
                action.executed = true;
                eventBus.publish({
                    type: 'FOLLOWUP_SCHEDULED' as EventType,
                    tenantId: action.tenantId,
                    timestamp: now,
                    data: action.data,
                }).catch(err => {
                    logger.error('WORKFLOW_SCHEDULED_ACTION_FAILED', {
                        actionId: action.id,
                        error: String(err),
                    });
                });
            }

            this.scheduledActions = this.scheduledActions.filter(a => !a.executed);
        }, 5000);

        this.checkInterval.unref();
    }

    private registerBuiltinWorkflows(): void {
        this.registerWorkflow({
            id: 'missed-call-recovery',
            name: 'Missed Call Follow-up',
            trigger: 'MISSED_CALL',
            steps: [
                {
                    name: 'wait-before-followup',
                    delay: 300000,
                    execute: async () => {},
                },
                {
                    name: 'send-followup-sms',
                    execute: async (event) => {
                        logger.info('WORKFLOW_MISSED_CALL_SMS', {
                            tenantId: event.tenantId,
                            callerPhone: event.data.callerPhone,
                        });
                    },
                },
            ],
        });

        this.registerWorkflow({
            id: 'appointment-reminder',
            name: 'Appointment Reminder',
            trigger: 'BOOKING_CREATED',
            condition: (event) => {
                const appointmentTime = new Date(event.data.appointmentTime).getTime();
                const now = Date.now();
                return (appointmentTime - now) > 3600000;
            },
            steps: [
                {
                    name: 'schedule-24h-reminder',
                    delay: 0,
                    execute: async (event) => {
                        const appointmentTime = new Date(event.data.appointmentTime).getTime();
                        const reminderTime = appointmentTime - 86400000;

                        if (reminderTime > Date.now()) {
                            this.scheduleAction({
                                id: `reminder_24h_${event.data.appointmentId}`,
                                type: 'appointment_reminder_24h',
                                executeAt: reminderTime,
                                tenantId: event.tenantId,
                                data: { ...event.data, reminderType: '24h' },
                                executed: false,
                            });
                        }

                        const reminder1hTime = appointmentTime - 3600000;
                        if (reminder1hTime > Date.now()) {
                            this.scheduleAction({
                                id: `reminder_1h_${event.data.appointmentId}`,
                                type: 'appointment_reminder_1h',
                                executeAt: reminder1hTime,
                                tenantId: event.tenantId,
                                data: { ...event.data, reminderType: '1h' },
                                executed: false,
                            });
                        }
                    },
                },
            ],
        });

        this.registerWorkflow({
            id: 'lead-nurturing',
            name: 'Lead Nurturing Sequence',
            trigger: 'LEAD_CAPTURED',
            steps: [
                {
                    name: 'schedule-followups',
                    execute: async (event) => {
                        const delays = [3600000, 86400000, 604800000];
                        for (let i = 0; i < delays.length; i++) {
                            this.scheduleAction({
                                id: `nurture_${i}_${event.data.leadId}`,
                                type: 'lead_nurture',
                                executeAt: Date.now() + delays[i],
                                tenantId: event.tenantId,
                                data: { ...event.data, sequenceStep: i + 1, totalSteps: delays.length },
                                executed: false,
                            });
                        }
                    },
                },
            ],
        });
    }

    async shutdown(): Promise<void> {
        this.unsubscribers.forEach(u => u());

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.worker) {
            await this.worker.close();
        }
        if (this.queue) {
            await this.queue.close();
        }

        logger.info('WORKFLOW_ENGINE_SHUTDOWN');
    }

    getStats(): { workflows: number; pendingJobs: number; scheduledActions: number } {
        return {
            workflows: this.workflows.length,
            pendingJobs: this.scheduledActions.filter(a => !a.executed).length,
            scheduledActions: this.scheduledActions.length,
        };
    }
}

export const workflowEngine = new WorkflowEngine();
