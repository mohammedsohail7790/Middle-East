import { logger } from '../logger.js';
import { RealtimeSession } from './realtime.types.js';
import { appointmentService } from '../appointments/appointment.service.js';
import { getTenantAvailabilitySlots } from '../appointments/tenant-availability.service.js';
import { integrationService } from '../integrations/integration.service.js';
import { knowledgeService } from '../knowledge/knowledge.service.js';
import { transferService } from '../voice/transfer.service.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { storeLead, resolveCallIdForLead } from '../voice/voice.controller.js';
import twilio from 'twilio';
import { isP1RuntimeSessionEnabled } from './realtime-session.js';
import { shouldExecuteTool } from './session-idempotency.js';
import { aiGovernanceService } from '../ai-governance/ai-governance.service.js';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

export class RealtimeToolsManager {
  async executeTool(
    session: RealtimeSession,
    toolName: string,
    parameters: any
  ): Promise<ToolResult> {
    if (process.env.CALLIQ_P3_GOVERNANCE !== 'false') {
      return aiGovernanceService.executeMediatedTool(
        () => this.executeToolDirect(session, toolName, parameters),
        session,
        toolName,
        parameters
      );
    }
    return this.executeToolDirect(session, toolName, parameters);
  }

  /** Direct tool implementation — invoked only through governance mediation in production. */
  async executeToolDirect(
    session: RealtimeSession,
    toolName: string,
    parameters: any
  ): Promise<ToolResult> {
    logger.info('REALTIME_TOOL_EXECUTE_START', {
      sessionId: session.id,
      tenantId: session.tenantId,
      toolName,
      parameters,
    });

    if (isP1RuntimeSessionEnabled()) {
      const idempotencyKey =
        parameters?.idempotency_key ||
        parameters?.idempotencyKey ||
        `${session.callSid}:${toolName}:${parameters?.new_time || parameters?.preferred_time || ''}`;
      if (!shouldExecuteTool(session.id, toolName, idempotencyKey)) {
        logger.warn('REALTIME_TOOL_IDEMPOTENT_SKIP', {
          sessionId: session.id,
          toolName,
          idempotencyKey,
        });
        void import('../../events/event-publisher.js')
          .then(async ({ publishPlatformEvent }) => {
            const { PlatformEventTypes } = await import('../../events/event-types.js');
            publishPlatformEvent(
              PlatformEventTypes.TOOL_SKIPPED_IDEMPOTENT,
              { toolName, idempotencyKey },
              {
                tenantId: session.tenantId,
                callSid: session.callSid,
                sessionId: session.id,
              }
            );
          })
          .catch(() => {});
        return {
          success: true,
          message: 'Tool already executed for this call (idempotent skip)',
        };
      }
    }

    try {
      let result: ToolResult;

      switch (toolName) {
        case 'create_appointment':
        case 'schedule_appointment':
          result = await this.createAppointment(session, parameters);
          break;

        case 'reschedule_appointment':
          result = await this.rescheduleAppointment(session, parameters);
          break;

        case 'cancel_appointment':
          result = await this.cancelAppointment(session, parameters);
          break;

        case 'transfer_call':
          result = await this.transferCall(session, parameters);
          break;

        case 'create_lead':
          result = await this.createLead(session, parameters);
          break;

        case 'search_knowledge_base':
          result = await this.searchKnowledgeBase(session, parameters);
          break;

        case 'send_sms':
          result = await this.sendSMS(session, parameters);
          break;

        case 'check_availability':
          result = await this.checkAvailability(session, parameters);
          break;

        case 'update_customer':
          result = await this.updateCustomer(session, parameters);
          break;

        case 'lookup_customer':
          result = await this.lookupCustomer(session, parameters);
          break;

        case 'switch_language':
          result = await this.switchLanguage(session, parameters);
          break;

        case 'end_call':
          result = await this.endCall(session, parameters);
          break;

        case 'check_service_area':
          result = await this.checkServiceArea(session, parameters);
          break;

        default:
          result = {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }

      logger.info('REALTIME_TOOL_EXECUTE_COMPLETE', {
        sessionId: session.id,
        tenantId: session.tenantId,
        toolName,
        success: result.success,
        error: result.error,
      });

      void import('../../events/event-publisher.js')
        .then(async ({ publishPlatformEvent }) => {
          const { PlatformEventTypes } = await import('../../events/event-types.js');
          publishPlatformEvent(
            PlatformEventTypes.TOOL_EXECUTED,
            { toolName, success: result.success },
            {
              tenantId: session.tenantId,
              callSid: session.callSid,
              sessionId: session.id,
            }
          );
        })
        .catch(() => {});

      return result;

    } catch (error) {
      logger.error('REALTIME_TOOL_EXECUTE_ERROR', {
        sessionId: session.id,
        tenantId: session.tenantId,
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async switchLanguage(
    session: RealtimeSession,
    params: { language?: string }
  ): Promise<ToolResult> {
    const lang = String(params.language || 'en').trim().toLowerCase().slice(0, 2);
    const { billingService } = await import('../billing/billing.service.js');
    const { PLAN_FEATURES, isLanguageAllowed } = await import('../../config/plan-config.js');
    const sub = await billingService.getSubscription(session.tenantId);
    const plan = sub?.status === 'trialing' ? 'trial' : (sub?.plan || 'essential');

    if (!PLAN_FEATURES[plan]?.multiLanguageSwitching) {
      return { success: false, error: 'Mid-call language switching is not currently available on any plan' };
    }
    if (!isLanguageAllowed(plan, lang as 'en' | 'es' | 'fr' | 'ru' | 'zh' | 'hi')) {
      return { success: false, error: `Language "${lang}" is not included on your plan` };
    }

    session.config.language = lang;
    try {
      await voiceDb.query(
        `UPDATE public.calls SET language = $3 WHERE tenant_id = $1 AND call_sid = $2`,
        [session.tenantId, session.callSid, lang]
      );
    } catch {
      /* ignore */
    }

    return {
      success: true,
      message: `Continue the conversation in ${lang}. Match the caller's language naturally.`,
      data: { language: lang },
    };
  }

  /** Default slot when the model omits preferred_time (avoids "past" rejection). */
  private defaultPreferredTime(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  }

  private async createAppointment(
    session: RealtimeSession,
    params: { customer_name: string; phone: string; email?: string; address?: string; issue?: string; preferred_time?: string }
  ): Promise<ToolResult> {
    const preferredTime = params.preferred_time?.trim() || this.defaultPreferredTime();
    const address = params.address?.trim() || undefined;

    logger.info('REALTIME_TOOL_CREATE_APPOINTMENT', {
      sessionId: session.id,
      tenantId: session.tenantId,
      customerName: params.customer_name,
      phone: params.phone,
      hasEmail: Boolean(params.email),
      hasAddress: Boolean(address),
      preferredTime,
    });

    try {
      const result = await appointmentService.createAppointment({
        tenantId: session.tenantId,
        name: params.customer_name,
        phone: params.phone,
        email: params.email?.trim() || undefined,
        service: params.issue || 'General',
        time: preferredTime,
        callSid: session.callSid,
      });

      if (result.success) {
        void (async () => {
          try {
            await storeLead({
              tenantId: session.tenantId,
              callId: (await resolveCallIdForLead(session.tenantId, session.callSid)) ?? undefined,
              name: params.customer_name,
              phone: params.phone,
              email: params.email?.trim() || undefined,
              service: params.issue || 'Appointment',
              notes:
                `Appointment booked for ${result.scheduledTime || params.preferred_time || 'scheduled time'}` +
                (address ? ` — Address: ${address}` : ''),
              preferred_time: result.scheduledTime || params.preferred_time,
            });
          } catch (err) {
            logger.warn('REALTIME_LEAD_AFTER_BOOKING_FAILED', {
              tenantId: session.tenantId,
              error: String(err),
            });
          }
          try {
            const { RealtimeMemoryManager } = await import('./realtime.memory.js');
            const memory = new RealtimeMemoryManager();
            await memory.storeEntity(
              session.id,
              session.tenantId,
              session.callSid,
              'appointment',
              result.scheduledTime || 'booked'
            );
            await memory.storeCustomerInfo(
              session.id,
              session.tenantId,
              session.callSid,
              params.customer_name,
              params.phone
            );
          } catch (memErr) {
            logger.warn('REALTIME_APPOINTMENT_MEMORY_FAILED', {
              tenantId: session.tenantId,
              error: String(memErr),
            });
          }

          integrationService
            .sendRealtime(session.tenantId, {
              callId: session.callSid,
              type: 'appointment',
              appointment: {
                name: params.customer_name,
                phone: params.phone,
                service: params.issue,
                time: result.scheduledTime,
              },
              lead: {
                name: params.customer_name,
                phone: params.phone,
                service: params.issue,
                notes: address ? `Service address: ${address}` : undefined,
              },
            })
            .catch((err) => {
              logger.warn('REALTIME_APPOINTMENT_INTEGRATION_FAILED', {
                tenantId: session.tenantId,
                callSid: session.callSid,
                error: String(err),
              });
            });
        })();

        import('../automation/automation.service.js').then(({ automationService }) => {
          automationService.sendAppointmentConfirmation(
            session.tenantId,
            result.appointmentId || '',
          ).catch(() => {});
        }).catch(() => {});

        return {
          success: true,
          data: {
            appointmentId: result.appointmentId,
            scheduledTime: result.scheduledTime,
          },
          message:
            (result.message || `Appointment confirmed for ${params.customer_name}`) +
            ' Repeat the date and time, ask if that works, then end the call with a short warm goodbye.',
        };
      }

      return {
        success: false,
        data: {
          alternativeTime: result.alternativeTime,
        },
        message: result.message || 'That time is not available. Please suggest an alternative.',
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to create appointment: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async rescheduleAppointment(
    session: RealtimeSession,
    params: { appointment_id?: string; phone?: string; new_time: string }
  ): Promise<ToolResult> {
    try {
      if (!params.appointment_id?.trim() && !params.phone?.trim()) {
        return {
          success: false,
          error: 'Need appointment_id or phone to find the booking to reschedule.',
        };
      }

      const result = await appointmentService.rescheduleAppointment(
        session.tenantId,
        params.new_time,
        {
          appointmentId: params.appointment_id?.trim(),
          phone: params.phone?.trim(),
        }
      );

      return {
        success: result.success,
        data: result,
        message: result.success
          ? (result.message || 'Rescheduled.') +
            ' Repeat the new date and time, confirm it works, then close warmly.'
          : result.message,
      };
    } catch (error) {
      return {
        success: false,
        error: `Reschedule failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async cancelAppointment(
    session: RealtimeSession,
    params: { appointment_id: string; reason?: string }
  ): Promise<ToolResult> {
    try {
      const result = await appointmentService.cancelAppointment(
        session.tenantId,
        params.appointment_id,
        params.reason || 'Cancelled by caller'
      );

      return {
        success: result.success,
        message: result.message || 'Appointment has been cancelled.',
      };
    } catch (error) {
      return {
        success: false,
        error: `Cancellation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async transferCall(
    session: RealtimeSession,
    params: { reason: string; department?: string }
  ): Promise<ToolResult> {
    logger.info('REALTIME_TOOL_TRANSFER_CALL', {
      sessionId: session.id,
      tenantId: session.tenantId,
      reason: params.reason,
      department: params.department,
    });

    try {
      // Look up tenant's transfer number
      const tenant = await voiceDb.query(
        `SELECT transfer_phone_number FROM public.voice_tenants WHERE id = $1`,
        [session.tenantId]
      );

      const targetNumber = tenant.rows[0]?.transfer_phone_number;
      if (!targetNumber) {
        return {
          success: false,
          error: 'No transfer number configured for this tenant.',
        };
      }

      await transferService.transferCall(session.callSid, targetNumber);
      session.callOutcome = 'transferred';

      return {
        success: true,
        data: { target: targetNumber },
        message: `Transferring call to ${params.department || 'an agent'}.`,
      };

    } catch (error) {
      return {
        success: false,
        error: `Transfer failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Ends the call after the model has spoken its goodbye. Delayed rather than
   * immediate so the final audio actually finishes playing over the Twilio
   * stream before the call is torn down — without a tool to do this at all,
   * calls previously only ended when the caller hung up or after a 90s
   * inactivity timeout, which produced long trailing pauses / abrupt cutoffs.
   */
  private async endCall(
    session: RealtimeSession,
    params: { reason?: string }
  ): Promise<ToolResult> {
    logger.info('REALTIME_TOOL_END_CALL', {
      sessionId: session.id,
      tenantId: session.tenantId,
      reason: params.reason,
    });

    session.callOutcome = session.callOutcome ?? 'completed';

    setTimeout(() => {
      transferService.endCall(session.callSid).catch((error) => {
        logger.warn('REALTIME_TOOL_END_CALL_FAILED', {
          sessionId: session.id,
          callSid: session.callSid,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 3000);

    return {
      success: true,
      message: 'Ending the call shortly — finish your goodbye first.',
    };
  }

  /** Verifies a caller's service address against the tenant's configured area (miles or driving minutes). */
  private async checkServiceArea(
    session: RealtimeSession,
    params: { address?: string }
  ): Promise<ToolResult> {
    const address = String(params?.address || '').trim();
    if (!address) {
      return { success: false, error: 'No address provided — ask the caller for their full service address first.' };
    }

    try {
      const row = await voiceDb.query(
        `select metadata->'service_area' as service_area from public.voice_tenants where id = $1 limit 1`,
        [session.tenantId]
      );
      const { parseServiceAreaSettings, checkServiceArea } = await import(
        '../voice/service-area.service.js'
      );
      const area = parseServiceAreaSettings(row.rows[0]?.service_area);
      if (!area) {
        return {
          success: true,
          message: 'No service-area limit is configured — treat the address as serviceable and proceed.',
        };
      }

      const result = await checkServiceArea(area, address);
      logger.info('REALTIME_TOOL_SERVICE_AREA_CHECK', {
        sessionId: session.id,
        tenantId: session.tenantId,
        inArea: result.inArea,
        distanceMiles: result.distanceMiles,
        driveMinutes: result.driveMinutes,
      });
      return {
        success: true,
        data: {
          inArea: result.inArea,
          distanceMiles: result.distanceMiles,
          driveMinutes: result.driveMinutes,
        },
        message: result.message,
      };
    } catch (error) {
      return {
        success: true,
        message:
          'Could not verify the address automatically. Take the full address and let the caller know the team will confirm coverage when following up.',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async createLead(
    session: RealtimeSession,
    params: { name: string; phone: string; email?: string; address?: string; interest?: string }
  ): Promise<ToolResult> {
    logger.info('REALTIME_TOOL_CREATE_LEAD', {
      sessionId: session.id,
      tenantId: session.tenantId,
      name: params.name,
      phone: params.phone,
      hasAddress: Boolean(params.address),
    });

    try {
      const address = params.address?.trim() || undefined;
      const callId = await resolveCallIdForLead(session.tenantId, session.callSid);
      const { leadsService } = await import('../leads/leads.service.js');
      await leadsService.createLead(session.tenantId, params.phone, 'inbound_call', {
        name: params.name,
        email: params.email?.trim() || undefined,
        notes: [params.interest, address ? `Address: ${address}` : '']
          .filter(Boolean)
          .join(' — ') || undefined,
        callId: callId ?? undefined,
        metadata: { interest: params.interest, address },
      });

      const { RealtimeMemoryManager } = await import('./realtime.memory.js');
      const memory = new RealtimeMemoryManager();
      await memory.storeCustomerInfo(
        session.id,
        session.tenantId,
        session.callSid,
        params.name,
        params.phone,
        params.email
      );
      if (params.interest) {
        await memory.storeIntent(session.id, session.tenantId, session.callSid, params.interest, 0.9);
      }

      // Queue CRM integration
      await integrationService.sendRealtime(session.tenantId, {
        callId: session.callSid,
        type: 'lead',
        lead: {
          name: params.name,
          phone: params.phone,
          service: params.interest,
        },
      });

      // Trigger automation: lead created (e.g., send Slack notification, SMS)
      import('../automation/automation.service.js').then(({ automationService }) => {
        automationService.triggerLeadCreated(session.tenantId, {
          name: params.name,
          phone: params.phone,
          interest: params.interest,
        }).catch(() => {});
      }).catch(() => {});

      return {
        success: true,
        message: `Information saved for ${params.name}.`,
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to save lead: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async searchKnowledgeBase(
    session: RealtimeSession,
    params: { query: string; category?: string }
  ): Promise<ToolResult> {
    logger.info('REALTIME_TOOL_SEARCH_KB', {
      sessionId: session.id,
      tenantId: session.tenantId,
      query: params.query,
    });

    try {
      const results = await knowledgeService.searchRelevantKnowledge(params.query, session.tenantId);

      if (results.length === 0) {
        return {
          success: true,
          data: [],
          message: 'No relevant information found.',
        };
      }

      const formatted = results.map(r => ({
        content: r.content,
        category: r.category,
      }));

      return {
        success: true,
        data: formatted,
        message: `Found ${formatted.length} relevant results.`,
      };

    } catch (error) {
      return {
        success: false,
        error: `Knowledge search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async sendSMS(
    session: RealtimeSession,
    params: { phone: string; message: string }
  ): Promise<ToolResult> {
    try {
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const fromNumber = await this.resolveTenantSmsFrom(session.tenantId);

      await client.messages.create({
        body: params.message,
        from: fromNumber,
        to: params.phone,
      });

      return {
        success: true,
        message: `SMS sent to ${params.phone}.`,
      };

    } catch (error) {
      return {
        success: false,
        error: `SMS failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async resolveTenantSmsFrom(tenantId: string): Promise<string> {
    const row = await voiceDb.query(
      `select coalesce(phone_number, metadata->>'twilio_phone_number') as from_number
       from public.voice_tenants where id = $1 limit 1`,
      [tenantId]
    );
    const from = row?.rows?.[0]?.from_number as string | undefined;
    if (from?.trim()) return from.trim();
    const fallback = process.env.TWILIO_PHONE_NUMBER?.trim();
    if (!fallback) {
      throw new Error('No Twilio sender number configured for tenant or platform');
    }
    return fallback;
  }

  private async checkAvailability(
    session: RealtimeSession,
    params: { service?: string; date?: string }
  ): Promise<ToolResult> {
    try {
      const { slots, timezone } = await getTenantAvailabilitySlots(session.tenantId, {
        date: params.date,
        durationMinutes: 60,
        horizonDays: 10,
      });
      const labels = slots.map((s) => s.label);

      return {
        success: true,
        data: { availableSlots: labels, timezone },
        message:
          labels.length > 0
            ? `Available times (${timezone}): ${labels.slice(0, 3).join(', ')}${labels.length > 3 ? ' and more' : ''}`
            : 'No open slots in the next few days — offer to take their preferred time and have someone call back.',
      };
    } catch (error) {
      logger.warn('CHECK_AVAILABILITY_FALLBACK', {
        tenantId: session.tenantId,
        error: String(error),
      });
      return {
        success: true,
        data: { availableSlots: [] },
        message:
          'I can note your preferred time and have the team confirm availability shortly.',
      };
    }
  }

  private async updateCustomer(
    session: RealtimeSession,
    params: { customer_id: string; updates: Record<string, any> }
  ): Promise<ToolResult> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const [key, value] of Object.entries(params.updates)) {
        const column = key === 'name' ? 'name' :
                       key === 'phone' ? 'phone' :
                       key === 'email' ? 'email' :
                       key === 'notes' ? 'notes' : null;
        if (column) {
          setClauses.push(`${column} = $${idx++}`);
          values.push(value);
        }
      }

      if (setClauses.length === 0) {
        return { success: true, message: 'No fields to update.' };
      }

      values.push(params.customer_id, session.tenantId);
      await voiceDb.query(
        `UPDATE public.leads SET ${setClauses.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`,
        values
      );

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(session.tenantId, 'lead.updated', [], {
        leadId: params.customer_id,
      });

      return {
        success: true,
        message: 'Customer information updated.',
      };

    } catch (error) {
      return {
        success: false,
        error: `Customer update failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async lookupCustomer(
    session: RealtimeSession,
    params: { phone?: string; email?: string; name?: string }
  ): Promise<ToolResult> {
    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (params.phone) {
        conditions.push(`phone = $${idx++}`);
        values.push(params.phone);
      }
      if (params.email) {
        conditions.push(`email = $${idx++}`);
        values.push(params.email);
      }
      if (params.name) {
        conditions.push(`name ILIKE $${idx++}`);
        values.push(`%${params.name}%`);
      }

      if (conditions.length === 0) {
        return { success: false, error: 'No search criteria provided.' };
      }

      values.push(session.tenantId);
      const result = await voiceDb.query(
        `SELECT id, name, phone, email, service, notes, created_at
         FROM public.leads
         WHERE (${conditions.join(' OR ')}) AND tenant_id = $${idx}
         ORDER BY created_at DESC LIMIT 5`,
        values
      );

      if (result.rows.length === 0) {
        return {
          success: true,
          data: null,
          message: 'No existing customer found.',
        };
      }

      return {
        success: true,
        data: result.rows,
        message: `Found ${result.rows.length} existing customer record(s).`,
      };

    } catch (error) {
      return {
        success: false,
        error: `Customer lookup failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
