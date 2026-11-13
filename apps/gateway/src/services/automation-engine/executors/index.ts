// One executor per kind of step registers itself here (see registry.ts). Importing this file registers them all; calling registerAllExecutors again is harmless.
import { getExecutor, registerExecutor } from '../registry.js';
import { crmPushLead } from './crm-push-lead.js';
import { dataTransform } from './data-transform.js';
import { registerDocumentExtractExecutor } from './document-extract.js';
import { emailSend } from './email-send.js';
import { messageSend } from './message-send.js';
import { notifyTeam } from './notify-team.js';
import { webhookPost } from './webhook-post.js';

export function registerAllExecutors(): void {
  registerExecutor('crm.push_lead', crmPushLead);
  registerExecutor('email.send', emailSend);
  registerExecutor('message.send', messageSend);
  registerExecutor('notify.team', notifyTeam);
  registerExecutor('webhook.post', webhookPost);
  registerExecutor('data.transform', dataTransform);
  // document.extract is written by the document helper (document-extract.ts); no placeholder of our own.
  if (!getExecutor('document.extract')) registerDocumentExtractExecutor();
}

registerAllExecutors();
