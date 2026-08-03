/** Auto-extracted from the landing-page SPA blog content (index.html). */
import type { BlogArticle } from "./types";

export const forwardingGuideArticle: BlogArticle = {
  slug: "forwarding-guide",
  title: `Call Forwarding Guides for Every Carrier`,
  date: `Published · 4 min read`,
  subtitle: `Step-by-step for RingCentral, Nextiva, Vonage, Verizon, AT&T, and more.`,
  bodyHtml: `
<section class="section">
    <div class="container" style="max-width: 720px;">

      <div style="background: var(--gray-50); border-left: 3px solid var(--accent); padding: 16px 20px; border-radius: var(--radius); margin-bottom: 32px;">
        <p style="font-size: 0.9rem; color: var(--gray-600); margin-bottom: 0;">
          <strong>Quick Answer:</strong> Forwarding your calls to Call IQ takes 5–15 minutes. Here are the exact steps for every major carrier. No technical expertise required.
        </p>
      </div>

      <p style="color: var(--gray-600); line-height: 1.8; margin-bottom: 32px;">
        To use Call IQ, you have three options: <strong>port your number</strong> (free, takes 5–10 days), <strong>get a new number</strong> (instant), or <strong>forward calls</strong> from your existing carrier (5–15 minutes). This guide covers the third option.
      </p>

      <h2 style="margin-bottom: 16px;">RingCentral</h2>
      <div class="card" style="margin-bottom: 24px;">
        <ol style="color: var(--gray-600); font-size: 0.9rem; line-height: 2.2; padding-left: 20px; margin-bottom: 0;">
          <li>Log in to your RingCentral admin portal</li>
          <li>Go to <span class="chip">Phone System → Extensions</span> → select your user</li>
          <li>Click <span class="chip">Call Handling & Forwarding</span></li>
          <li>Add a new forwarding number: <strong>+1 (YOUR_CALL_IQ_NUMBER)</strong></li>
          <li>Set sequence: Ring your desk phone first, then forward to Call IQ after 15 seconds</li>
          <li>Save changes</li>
          <li>Test by calling your RingCentral number</li>
        </ol>
      </div>

      <h2 style="margin-bottom: 16px;">Nextiva</h2>
      <div class="card" style="margin-bottom: 24px;">
        <ol style="color: var(--gray-600); font-size: 0.9rem; line-height: 2.2; padding-left: 20px; margin-bottom: 0;">
          <li>Log in to Nextiva admin portal</li>
          <li>Go to <span class="chip">Users → select your extension</span></li>
          <li>Click <span class="chip">Call Forwarding</span></li>
          <li>Enable "Always forward" or "Forward when unanswered"</li>
          <li>Enter your Call IQ number</li>
          <li>Set ring time before forward (recommended: 15–20 seconds)</li>
          <li>Save</li>
        </ol>
      </div>

      <h2 style="margin-bottom: 16px;">Vonage Business</h2>
      <div class="card" style="margin-bottom: 24px;">
        <ol style="color: var(--gray-600); font-size: 0.9rem; line-height: 2.2; padding-left: 20px; margin-bottom: 0;">
          <li>Log in to Vonage admin portal</li>
          <li>Go to <span class="chip">Extensions → select your number</span></li>
          <li>Click <span class="chip">Call Forwarding</span> tab</li>
          <li>Enable "Forward calls to another number"</li>
          <li>Enter your Call IQ number</li>
          <li>Choose forward condition: Always or When unanswered</li>
          <li>Save</li>
        </ol>
      </div>

      <h2 style="margin-bottom: 16px;">Regular Cell Phone (Verizon, AT&T, T-Mobile)</h2>
      <div class="alert alert-warn" style="margin-bottom: 16px;">
        <span>⚠️</span>
        <span class="alert-text"><strong>Note:</strong> This forwards all calls. Consider using a separate business line or porting your number to Call IQ for more control.</span>
      </div>

      <div class="grid-3" style="gap: 16px; margin-bottom: 32px;">
        <div class="card" style="text-align: center;">
          <h4 style="margin-bottom: 8px;">Verizon</h4>
          <div><strong>Activate:</strong> Dial <span class="chip">*72</span> + Call IQ number</div>
          <div style="margin: 8px 0;"><span class="chip">Example: *72-1-888-123-4567</span></div>
          <div><strong>Cancel:</strong> Dial <span class="chip">*73</span></div>
        </div>
        <div class="card" style="text-align: center;">
          <h4 style="margin-bottom: 8px;">AT&T</h4>
          <div><strong>Activate:</strong> Dial <span class="chip">*21*</span> + Call IQ number + <span class="chip">#</span></div>
          <div style="margin: 8px 0;"><span class="chip">Example: *21*18881234567#</span></div>
          <div><strong>Cancel:</strong> Dial <span class="chip">#21#</span></div>
        </div>
        <div class="card" style="text-align: center;">
          <h4 style="margin-bottom: 8px;">T-Mobile</h4>
          <div><strong>Activate:</strong> Dial <span class="chip">**21*</span> + Call IQ number + <span class="chip">#</span></div>
          <div style="margin: 8px 0;"><span class="chip">Example: **21*18881234567#</span></div>
          <div><strong>Cancel:</strong> Dial <span class="chip">##21#</span></div>
        </div>
      </div>

      <h2 style="margin-bottom: 16px;">Google Voice</h2>
      <div class="card" style="margin-bottom: 32px;">
        <ol style="color: var(--gray-600); font-size: 0.9rem; line-height: 2.2; padding-left: 20px; margin-bottom: 0;">
          <li>Open Google Voice settings</li>
          <li>Go to <span class="chip">Calls → Incoming calls</span></li>
          <li>Add your Call IQ number as a forwarding phone</li>
          <li>Enable forwarding for "All calls" or "Unanswered calls"</li>
          <li>Save</li>
        </ol>
      </div>

      <div style="text-align: center; padding: 32px; background: var(--gray-50); border-radius: var(--radius-lg); margin-bottom: 32px;">
        <h3 style="margin-bottom: 12px;">Still stuck? We can help.</h3>
        <p style="color: var(--gray-500); margin-bottom: 20px;">Our support team can walk you through setup for any carrier. Free.</p>
        <a class="btn btn-primary btn-lg" href="/contact">Contact Support →</a>
      </div>

    </div>
  </section>
`,
};
