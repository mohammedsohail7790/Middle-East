/** Auto-extracted from the landing-page SPA blog content (index.html). */
import type { BlogArticle } from "./types";

export const emergencyCallsArticle: BlogArticle = {
  slug: "emergency-calls",
  title: `How to Handle Emergency Calls with an AI Receptionist`,
  date: `Published March 1, 2025 · 5 min read`,
  subtitle: `Emergency calls require speed, accuracy, and empathy. Here's how to configure your AI to handle them flawlessly.`,
  bodyHtml: `
<section class="section">
    <div class="container" style="max-width: 720px;">

      <p style="font-size: 1.1rem; color: var(--gray-700); line-height: 1.8; margin-bottom: 24px;">
        <strong>Picture this:</strong> It's 2:00 AM. A customer's pipe just burst. Water is flooding their basement. 
        They call your number, panicked. Who answers?
      </p>

      <p style="color: var(--gray-600); line-height: 1.8; margin-bottom: 24px;">
        If you have Call IQ, your AI receptionist answers immediately — not with a robotic script, but with a calm, 
        empathetic voice that collects critical details and dispatches help instantly.
      </p>

      <div style="background: var(--gray-50); border-left: 3px solid var(--accent); padding: 16px 20px; border-radius: var(--radius); margin-bottom: 32px;">
        <p style="font-size: 0.9rem; color: var(--gray-600); margin-bottom: 0;">
          <strong>The difference between an answered emergency call and a missed one:</strong><br>
          A missed emergency call can mean thousands of dollars in lost revenue, a damaged reputation, and a customer who never calls again. An answered emergency call means you dispatch a technician, save the customer's property, and earn their loyalty for life.
        </p>
      </div>

      <h2 style="margin-bottom: 16px;">Step 1: Define What "Emergency" Means for Your Business</h2>
      <p style="color: var(--gray-600); line-height: 1.8; margin-bottom: 24px;">
        Not every after-hours call is an emergency. Before you configure your AI, define exactly what constitutes an emergency:
      </p>
      <ul style="margin-left: 20px; color: var(--gray-600); line-height: 2; margin-bottom: 24px;">
        <li><strong>For plumbers:</strong> Burst pipes, active flooding, gas smells, no hot water</li>
        <li><strong>For electricians:</strong> Sparking outlets, burning smells, complete power outage, shock hazards</li>
        <li><strong>For HVAC:</strong> No heat in freezing weather, no AC in extreme heat, gas smells</li>
        <li><strong>For veterinarians:</strong> Bleeding, seizures, breathing difficulty, toxin ingestion</li>
      </ul>

      <div class="card" style="margin-bottom: 32px;">
        <p style="font-size: 0.9rem; color: var(--gray-600); margin-bottom: 0;">
          <strong>Pro Tip:</strong> Create a list of "red flag" keywords for your industry. The AI will use these to automatically escalate calls. 
          For example: <em>"flooding," "smoke," "bleeding," "seizure," "gas leak"</em>.
        </p>
      </div>

      <h2 style="margin-bottom: 16px;">Step 2: Configure Your AI's Emergency Call Flow</h2>
      <p style="color: var(--gray-600); line-height: 1.8; margin-bottom: 24px;">
        During onboarding, you'll set up your emergency call flow. Here's what a typical emergency flow looks like:
      </p>

      <div style="background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 32px;">
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
          <div style="background: var(--red); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0;">1</div>
          <div><strong>Answer with urgency:</strong> "I'm Call IQ, the AI dispatcher for [Your Business]. Are you reporting an emergency?"</div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
          <div style="background: var(--accent); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0;">2</div>
          <div><strong>Collect critical details:</strong> "What's the problem? Where are you? Is there immediate danger?"</div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
          <div style="background: var(--orange); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0;">3</div>
          <div><strong>Flag and escalate:</strong> "I'm dispatching this as an emergency. Your on-call technician will contact you within 5 minutes."</div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="background: var(--green); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0;">4</div>
          <div><strong>Notify your team:</strong> The AI emails your on-call technician the full job summary — address, problem description, customer name, and phone number.</div>
        </div>
      </div>

      <h2 style="margin-bottom: 16px;">Step 3: Set Up Your On-Call Notification System</h2>
      <p style="color: var(--gray-600); line-height: 1.8; margin-bottom: 24px;">
        The AI is only as good as its notification system. Here's how to set up your emergency notifications:
      </p>
      <ul style="margin-left: 20px; color: var(--gray-600); line-height: 2; margin-bottom: 24px;">
        <li><strong>Primary contact:</strong> Your on-call technician's email and phone number</li>
        <li><strong>Backup contact:</strong> A secondary number if the primary doesn't respond within 3 minutes</li>
        <li><strong>Email summary:</strong> A detailed email with the full transcript sent to your dispatch team</li>
        <li><strong>Slack notification:</strong> Send a message to your #emergencies channel (via Zapier)</li>
      </ul>

      <div class="alert alert-info" style="margin-bottom: 32px;">
        <span>📱</span>
        <span class="alert-text">
          <strong>Example alert:</strong> "🚨 EMERGENCY: Burst pipe at 1428 Oak Street. Customer reports active flooding in basement. On-call plumber: Please call (555) 847-2931 immediately. Status: Dispatching now."
        </span>
      </div>

      <h2 style="margin-bottom: 16px;">Step 4: Test Your Emergency Flow</h2>
      <p style="color: var(--gray-600); line-height: 1.8; margin-bottom: 24px;">
        Before you go live, test your emergency flow with a few mock calls. Here's what to test:
      </p>
      <ul style="margin-left: 20px; color: var(--gray-600); line-height: 2; margin-bottom: 32px;">
        <li>Does the AI recognize your emergency keywords?</li>
        <li>Does the AI capture the address and problem description correctly?</li>
        <li>Does the notification email arrive within seconds of the call ending?</li>
        <li>Does the backup contact work if the primary doesn't respond?</li>
      </ul>

      <div class="card" style="margin-bottom: 32px;">
        <p style="font-size: 0.9rem; color: var(--gray-600); margin-bottom: 0;">
          <strong>⚠️ Common mistake:</strong> Many businesses forget to test their emergency flow with a real simulated call. 
          Don't wait for a real emergency to find out your notifications aren't working. Test it now.
        </p>
      </div>

      <h2 style="margin-bottom: 16px;">The Bottom Line</h2>
      <p style="color: var(--gray-600); line-height: 1.8; margin-bottom: 24px;">
        Emergency calls are the most important calls your business receives. A single missed emergency call can mean a lost customer, 
        a bad review, or worse — property damage or even injury. With Call IQ, you never miss an emergency call again.
      </p>

      <div style="text-align: center; padding: 32px; background: var(--gray-50); border-radius: var(--radius-lg); margin-bottom: 32px;">
        <h3 style="margin-bottom: 12px;">Ready to never miss an emergency call?</h3>
        <p style="color: var(--gray-500); margin-bottom: 20px;">Start your free 14-day trial. No credit card required.</p>
        <a class="btn btn-primary btn-lg" href="/signup">Start Free Trial →</a>
      </div>

    </div>
  </section>
`,
};
