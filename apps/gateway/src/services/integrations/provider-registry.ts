import { IntegrationPayload } from './integration.service.js';
import { ZohoProvider } from './providers/zoho.provider.js';
import { CopperProvider } from './providers/copper.provider.js';
import { FollowUpBossProvider } from './providers/followupboss.provider.js';
import { AcuityProvider } from './providers/acuity.provider.js';
import { SetmoreProvider } from './providers/setmore.provider.js';
import { SquareAppointmentsProvider } from './providers/square-appointments.provider.js';
import { BuildiumProvider } from './providers/buildium.provider.js';
import { ClioProvider } from './providers/clio.provider.js';
import { MyCaseProvider } from './providers/mycase.provider.js';
import { MindbodyProvider } from './providers/mindbody.provider.js';
import { VagaroProvider } from './providers/vagaro.provider.js';
import { AppFolioProvider } from './providers/appfolio.provider.js';
import { YardiProvider } from './providers/yardi.provider.js';

/** Common shape used by integration.controller.ts for the generic connect/verify/test path. */
export interface ProviderAdapter {
    verifyConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }>;
    sendTest(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string; recordUrl?: string }>;
    /** Only present for providers that participate in generic lead-sync dispatch. */
    sendLead?(credentials: Record<string, unknown>, payload: IntegrationPayload): Promise<void>;
}

const zoho = new ZohoProvider();
const copper = new CopperProvider();
const followupboss = new FollowUpBossProvider();
const acuity = new AcuityProvider();
const setmore = new SetmoreProvider();
const squareAppointments = new SquareAppointmentsProvider();
const buildium = new BuildiumProvider();
const clio = new ClioProvider();
const mycase = new MyCaseProvider();
const mindbody = new MindbodyProvider();
const vagaro = new VagaroProvider();
const appfolio = new AppFolioProvider();
const yardi = new YardiProvider();

/** Maps `providerKey` (from integration-catalog.ts) to a generic provider adapter. */
export const PROVIDER_REGISTRY: Record<string, ProviderAdapter> = {
    zoho: {
        verifyConnection: (c) => zoho.verifyConnection(c as any),
        sendTest: (c) => zoho.sendTestLead(c as any),
        sendLead: (c, p) => zoho.sendLead(c as any, p),
    },
    copper: {
        verifyConnection: (c) => copper.verifyConnection(c as any),
        sendTest: (c) => copper.sendTestLead(c as any),
        sendLead: (c, p) => copper.sendLead(c as any, p),
    },
    followupboss: {
        verifyConnection: (c) => followupboss.verifyConnection(c as any),
        sendTest: (c) => followupboss.sendTestLead(c as any),
        sendLead: (c, p) => followupboss.sendLead(c as any, p),
    },
    acuity: {
        verifyConnection: (c) => acuity.verifyConnection(c as any),
        sendTest: (c) => acuity.sendTest(c as any),
    },
    setmore: {
        verifyConnection: (c) => setmore.verifyConnection(c as any),
        sendTest: (c) => setmore.sendTest(c as any),
    },
    'square-appointments': {
        verifyConnection: (c) => squareAppointments.verifyConnection(c as any),
        sendTest: (c) => squareAppointments.sendTest(c as any),
    },
    buildium: {
        verifyConnection: (c) => buildium.verifyConnection(c as any),
        sendTest: (c) => buildium.sendTest(c as any),
    },
    clio: {
        verifyConnection: (c) => clio.verifyConnection(c as any),
        sendTest: (c) => clio.sendTestLead(c as any),
        sendLead: (c, p) => clio.sendLead(c as any, p),
    },
    mycase: {
        verifyConnection: (c) => mycase.verifyConnection(c as any),
        sendTest: (c) => mycase.sendTestLead(c as any),
        sendLead: (c, p) => mycase.sendLead(c as any, p),
    },
    mindbody: {
        verifyConnection: (c) => mindbody.verifyConnection(c as any),
        sendTest: (c) => mindbody.sendTest(c as any),
        sendLead: (c, p) => mindbody.sendLead(c as any, p),
    },
    vagaro: {
        verifyConnection: (c) => vagaro.verifyConnection(c as any),
        sendTest: (c) => vagaro.sendTest(c as any),
        sendLead: (c, p) => vagaro.sendLead(c as any, p),
    },
    appfolio: {
        verifyConnection: (c) => appfolio.verifyConnection(c as any),
        sendTest: (c) => appfolio.sendTest(c as any),
        sendLead: (c, p) => appfolio.sendLead(c as any, p),
    },
    yardi: {
        verifyConnection: (c) => yardi.verifyConnection(c as any),
        sendTest: (c) => yardi.sendTest(c as any),
        sendLead: (c, p) => yardi.sendLead(c as any, p),
    },
};

export function getProviderAdapter(providerKey: string): ProviderAdapter | undefined {
    return PROVIDER_REGISTRY[providerKey];
}

/** Provider keys that participate in generic lead-sync dispatch. */
export const SYNC_CAPABLE_PROVIDER_KEYS = Object.entries(PROVIDER_REGISTRY)
    .filter(([, adapter]) => typeof adapter.sendLead === 'function')
    .map(([key]) => key);
