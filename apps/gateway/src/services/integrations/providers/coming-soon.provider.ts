/** Shared adapter for "Coming soon" integrations — credentials are encrypted and stored,
 *  but verify/sync return a friendly placeholder until the provider is activated. */
export class ComingSoonProvider {
    async verifyConnection(): Promise<{ success: boolean; message: string }> {
        return { success: true, message: "Saved! We'll let you know as soon as this integration is ready." };
    }

    async sendTest(): Promise<{ success: boolean; message: string }> {
        return { success: false, message: "This integration is coming soon — we'll email you when it's ready to use." };
    }
}
