# WhatsApp service: Meta onboarding and message templates

For the AI Receptionist WhatsApp service (AED 150/month, clinics and salons first). The client brings their own WhatsApp number.

## 1. Meta Tech Provider (needed to onboard clients without them pasting tokens)

Today a client pastes a Phone Number ID and token (INTEGRATIONS_SETUP.md, section 18). A sold service needs "Embedded Signup": the client clicks Connect, logs in to Facebook, picks their business and number, and Halla receives access automatically. That requires Halla to be a Meta Tech Provider.

Owner action items (these need the business owner's Meta login; Claude does not sign in or submit):

1. A verified Meta Business portfolio for Halla AI (legal name, address, website `hallaai.com`, business email on the domain). Business verification takes a few days and needs company documents.
2. A Meta developer app of type "Business", with the WhatsApp product added.
3. App Review for `whatsapp_business_management` and `whatsapp_business_messaging` (advanced access). Meta asks for a screencast of the real flow, a privacy policy URL and a terms URL. Use `hallaai.com` Privacy and Terms (live).
4. Apply as Tech Provider, then enable Embedded Signup and create the configuration.
5. Add the production webhook: `https://gateway.hallaai.com/api/v1/channels/whatsapp/webhook` with the verify token (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`) and the app secret (`WHATSAPP_APP_SECRET`).
6. Until approval, onboard the test number and early pilots the manual way (client's Phone Number ID plus a system-user token).

Hk is arranging the first test number. It must be a number that is not already registered on the regular WhatsApp or WhatsApp Business app (or it must be migrated first).

## 2. Message templates (Meta approval, per WhatsApp Business account)

WhatsApp only allows free text within 24 hours of the customer's last message. Reminders and confirmations sent outside that window must be approved templates. The code expects these names (override with `WHATSAPP_TEMPLATE_CONFIRM` / `WHATSAPP_TEMPLATE_REMINDER`) and fills four body parameters in this order: `{{1}}` customer name, `{{2}}` business name, `{{3}}` date, `{{4}}` time.

Category for both: **Utility**. Languages: English (`en`) and Arabic (`ar`), same template name.

### appointment_confirmation

English body:

> Hi {{1}}, your appointment at {{2}} is confirmed for {{3}} at {{4}}.

Arabic body:

> مرحباً {{1}}، تم تأكيد موعدك في {{2}} يوم {{3}} الساعة {{4}}.

No buttons.

### appointment_reminder

English body:

> Hi {{1}}, a reminder of your appointment at {{2}} on {{3}} at {{4}}. Does it still work for you?

Arabic body:

> مرحباً {{1}}، تذكير بموعدك في {{2}} يوم {{3}} الساعة {{4}}. هل ما زال مناسباً؟

Three quick-reply buttons, in this order. The button payloads are set by the code (`confirm:<id>`, `reschedule:<id>`, `cancel:<id>`):

| Order | English | Arabic |
|---|---|---|
| 1 | Confirm | تأكيد |
| 2 | Reschedule | تغيير الموعد |
| 3 | Cancel | إلغاء |

Notes for the Meta form:
- Sample values for review: `{{1}}` Sara, `{{2}}` Glow Clinic, `{{3}}` Sunday 8 November, `{{4}}` 4:30 PM.
- Utility templates must be transactional (about an appointment the customer already made). Do not add offers or promotion, or Meta will reclassify the template as Marketing.
- Each client's own WhatsApp Business account needs these templates approved, unless Halla creates them through the API during Embedded Signup. Plan for that in the onboarding step.

## 3. What is not covered here

- Broadcast and marketing templates (next phase, needs opt-in tracking).
- Payment link messages (see the WhatsApp service build notes).
- Meta's own per-conversation fees: Meta bills conversation charges on the client's account. State this in the offer so AED 150 is understood as Halla's fee only.
