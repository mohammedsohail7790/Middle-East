/**
 * Gravity Memory Engine
 * Implements Intelligent Summarization and Prompt Caching strategies.
 * Uses a lazy dynamic import for @anthropic-ai/sdk so this file compiles
 * cleanly inside any TypeScript project that includes it (e.g. the gateway
 * monorepo tsconfig) without requiring the SDK to be resolvable at build time.
 */
export class GravityMemory {
    private anthropic: any = null;
    private readonly apiKey: string;
    private readonly CACHE_STALE_THRESHOLD = 1024 * 4; // 4k tokens

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private async getClient(): Promise<any> {
        if (!this.anthropic) {
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            this.anthropic = new Anthropic({ apiKey: this.apiKey });
        }
        return this.anthropic;
    }

    async getEffectiveContext(history: any[], systemPrompt: string) {
        const system = [
            {
                type: 'text',
                text: systemPrompt,
                cache_control: { type: 'ephemeral' },
            },
        ];

        const tokenCount = this.estimateTokens(history);

        if (tokenCount > 20000) {
            const summary = await this.summarize(history.slice(0, -10));
            const recentMessages = history.slice(-10);
            return {
                system,
                messages: [
                    { role: 'user', content: `[COMPACTED HISTORY SUMMARY]: ${summary}` },
                    ...recentMessages,
                ],
            };
        }

        const messages = history.map((m, i) => {
            if (i === history.length - 1) return m;
            if (i < history.length - 5) {
                return { ...m, cache_control: { type: 'ephemeral' } };
            }
            return m;
        });

        return { system, messages };
    }

    private async summarize(history: any[]): Promise<string> {
        const client = await this.getClient();
        const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            messages: history,
        });
        const block = response.content[0] as any;
        return block?.type === 'text' ? (block.text ?? '') : '';
    }

    private estimateTokens(history: any[]): number {
        return JSON.stringify(history).length / 4;
    }
}
