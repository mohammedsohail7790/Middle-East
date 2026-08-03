import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { CallIqLogo } from "../components/CallIqLogo";
import { fontFamily } from "../lib/fonts";
import { PhoneDevice3D } from "../three/PhoneDevice3D";
import { IntegrationOrbit3D } from "../three/IntegrationOrbit3D";
import { VignetteOverlay } from "../components/EnterpriseOverlay";
import { t } from "./timing";
import {
  AIThinkingGraph,
  AnimatedCounter,
  BusinessSilhouette,
  CinematicCamera,
  EnergyBurst,
  GrowthBar,
  IndustryIcon,
  LogoEnergyRing,
  PhoneRingPulse,
  SpeechRecognitionViz,
} from "./effects";
import { HolographicDashboard } from "./HolographicDashboard";
import { ThinkingPulse, VoiceWaveform } from "./VoiceWaveform";
import {
  CINEMATIC,
  CinematicShell,
  CinematicTitle,
  GlassCard,
  cFade,
  cScale,
  cSlide,
  easeCinematic,
} from "./shared";

/* ── SCENE 1: THE PROBLEM (0:00–0:12) ── */
export const ProblemScene = () => {
  const frame = useCurrentFrame();
  const revenue = Math.round(
    interpolate(frame, [t(20), t(65)], [47200, 38100], { extrapolateRight: "clamp", easing: easeCinematic }),
  );
  const notifications = [
    { text: "Missed call — Sarah M.", at: t(12) },
    { text: "Voicemail — Unknown caller", at: t(22) },
    { text: "Lead lost — No answer", at: t(32) },
    { text: "Appointment missed — 2:00 PM", at: t(42) },
    { text: "Customer hung up", at: t(52) },
  ];

  return (
    <CinematicShell variant="dramatic" show3D={false} rays={false}>
      <BusinessSilhouette />
      <CinematicCamera intensity={0.6}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 120px",
          }}
        >
          <div style={{ position: "absolute", top: 100, right: 100, textAlign: "right" }}>
            {notifications.map((n) => (
              <GlassCard
                key={n.text}
                delay={n.at}
                glow={false}
                style={{
                  marginBottom: 10,
                  padding: "14px 22px",
                  borderColor: `${CINEMATIC.red}55`,
                  background: "rgba(20,8,8,0.85)",
                }}
              >
                <span style={{ fontFamily, fontSize: 14, color: CINEMATIC.red, fontWeight: 600 }}>
                  {n.text}
                </span>
              </GlassCard>
            ))}
          </div>

          <div style={{ marginBottom: 56, opacity: cFade(frame, t(4), 10) }}>
            <PhoneRingPulse count={3} delay={t(4)} />
          </div>

          <CinematicTitle lines={["EVERY MISSED CALL", "IS LOST REVENUE"]} size={68} delay={t(6)} />

          <div
            style={{
              marginTop: 48,
              display: "flex",
              alignItems: "baseline",
              gap: 16,
              opacity: cFade(frame, t(28), 10),
            }}
          >
            <span style={{ fontFamily, fontSize: 16, color: brand.colors.muted, fontWeight: 500 }}>
              Revenue today
            </span>
            <span
              style={{
                fontFamily,
                fontSize: 36,
                fontWeight: 900,
                color: CINEMATIC.red,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ${revenue.toLocaleString()}
            </span>
            <span
              style={{
                fontFamily,
                fontSize: 15,
                color: CINEMATIC.red,
                fontWeight: 700,
                opacity: 0.8 + Math.sin(frame * 0.15) * 0.2,
              }}
            >
              ↓ 19.3%
            </span>
          </div>
        </AbsoluteFill>
      </CinematicCamera>
    </CinematicShell>
  );
};

/* ── SCENE 2: INTRODUCING CALL IQ (0:12–0:22) ── */
export const IntroScene = () => {
  const frame = useCurrentFrame();
  const logoScale = cScale(frame, t(8), t(22), 0.2, 1);
  const glow = interpolate(frame, [t(12), t(34)], [0, 1], { extrapolateRight: "clamp", easing: easeCinematic });

  return (
    <CinematicShell variant="cta">
      <EnergyBurst active={frame < t(28)} />
      <CinematicCamera intensity={0.4}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LogoEnergyRing size={520} />
            <div
              style={{
                transform: `scale(${logoScale})`,
                filter: `drop-shadow(0 0 ${80 * glow}px ${brand.colors.cyan}) drop-shadow(0 0 ${140 * glow}px ${brand.colors.cyan}44)`,
                zIndex: 2,
              }}
            >
              <CallIqLogo size="lg" animate={false} showTagline={false} />
            </div>
          </div>
          <div style={{ marginTop: 48, textAlign: "center" }}>
            <CinematicTitle
              lines={[CINEMATIC.company, "AI RECEPTIONIST FOR MODERN BUSINESSES"]}
              size={54}
              delay={t(18)}
            />
          </div>
        </AbsoluteFill>
      </CinematicCamera>
    </CinematicShell>
  );
};

/* ── SCENE 3: AI ANSWERS INSTANTLY (0:22–0:35) ── */
export const AIAnswersScene = () => {
  const frame = useCurrentFrame();
  const messages = [
    { who: "Customer", text: "Hi, I need to schedule a service appointment.", at: t(16) },
    { who: "Call IQ AI", text: "I'd be happy to help. What service do you need?", at: t(36) },
    { who: "Customer", text: "HVAC maintenance for my office.", at: t(56) },
    { who: "Call IQ AI", text: "Perfect. I have availability tomorrow at 2 PM.", at: t(76) },
  ];

  return (
    <AbsoluteFill style={{ background: CINEMATIC.dark }}>
      <PhoneDevice3D frame={frame} enterDelay={0} />
      <AbsoluteFill style={{ zIndex: 1 }}>
        <CinematicCamera intensity={0.3}>
          <AbsoluteFill style={{ display: "flex", padding: "100px 100px 150px", gap: 48 }}>
            <div style={{ flex: 1, maxWidth: 520 }}>
              <CinematicTitle
                lines={["ANSWERS EVERY CALL", "24/7 AVAILABILITY"]}
                size={50}
                align="left"
                delay={t(2)}
              />
              <div style={{ marginTop: 36, opacity: cFade(frame, t(10), 10) }}>
                <div style={{ fontFamily, fontSize: 12, color: brand.colors.muted, marginBottom: 8, letterSpacing: "0.1em" }}>
                  LIVE VOICE ANALYSIS
                </div>
                <VoiceWaveform active={frame > t(14)} bars={40} />
              </div>
              <SpeechRecognitionViz active={frame > t(24)} delay={t(24)} />
              <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily, fontSize: 13, color: brand.colors.muted }}>AI processing</span>
                <ThinkingPulse />
              </div>
              <AIThinkingGraph delay={t(40)} />
            </div>

            <GlassCard delay={t(4)} style={{ flex: "0 0 500px", padding: 0, overflow: "hidden", alignSelf: "center" }}>
              <div
                style={{
                  padding: "22px 28px",
                  borderBottom: `1px solid ${brand.colors.grayLight}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "rgba(14,165,233,0.06)",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#22C55E",
                    boxShadow: "0 0 16px #22C55E",
                  }}
                />
                <span style={{ fontFamily, fontSize: 15, fontWeight: 700, color: brand.colors.white }}>
                  Incoming Call
                </span>
                <span style={{ fontFamily, fontSize: 13, color: brand.colors.cyan, marginLeft: "auto" }}>
                  Answered in 0.8s
                </span>
              </div>
              <div style={{ padding: 28, minHeight: 340 }}>
                {messages.map((m) => (
                  <div
                    key={m.text}
                    style={{
                      marginBottom: 18,
                      opacity: cFade(frame, m.at, 14),
                      transform: `translateX(${cSlide(frame, m.at, 16, m.who === "Customer" ? -24 : 24)}px)`,
                      textAlign: m.who === "Customer" ? "left" : "right",
                    }}
                  >
                    <div style={{ fontFamily, fontSize: 11, color: brand.colors.cyan, marginBottom: 6, fontWeight: 600, letterSpacing: "0.08em" }}>
                      {m.who.toUpperCase()}
                    </div>
                    <div
                      style={{
                        fontFamily,
                        fontSize: 15,
                        color: brand.colors.white,
                        background: m.who === "Customer" ? brand.colors.gray : `${brand.colors.cyan}18`,
                        border: `1px solid ${m.who === "Customer" ? brand.colors.grayLight : brand.colors.cyan}44`,
                        padding: "14px 18px",
                        borderRadius: 14,
                        display: "inline-block",
                        maxWidth: "88%",
                        lineHeight: 1.5,
                      }}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </AbsoluteFill>
        </CinematicCamera>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ── SCENE 4: LEAD CAPTURE (0:35–0:47) ── */
export const LeadCaptureScene = () => {
  const frame = useCurrentFrame();
  const fields = [
    { label: "Name", value: "James Rodriguez", at: t(22) },
    { label: "Phone", value: "+1 (555) 847-2901", at: t(30) },
    { label: "Email", value: "j.rodriguez@email.com", at: t(38) },
    { label: "Service", value: "Emergency Plumbing", at: t(46) },
    { label: "Intent Score", value: "High — 94%", at: t(54) },
  ];
  const crmProgress = interpolate(frame, [t(56), t(80)], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeCinematic,
  });

  return (
    <CinematicShell variant="feature">
      <CinematicCamera intensity={0.35}>
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 72,
            padding: "100px 110px",
          }}
        >
          <div style={{ flex: 1 }}>
            <CinematicTitle lines={["AUTOMATIC", "LEAD CAPTURE"]} size={54} align="left" delay={t(2)} />
            <div
              style={{
                marginTop: 36,
                fontFamily,
                fontSize: 16,
                color: brand.colors.muted,
                opacity: cFade(frame, t(16), 10),
                lineHeight: 1.6,
              }}
            >
              AI qualifies every caller and syncs to your CRM in real time.
            </div>
            <div style={{ marginTop: 32, opacity: cFade(frame, t(24), 10) }}>
              <div style={{ fontFamily, fontSize: 12, color: brand.colors.muted, marginBottom: 8 }}>CRM SYNC</div>
              <div style={{ height: 8, borderRadius: 4, background: brand.colors.gray, overflow: "hidden", width: 320 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${crmProgress}%`,
                    background: `linear-gradient(90deg, ${brand.colors.cyan}, #38bdf8)`,
                    boxShadow: `0 0 20px ${brand.colors.cyan}`,
                  }}
                />
              </div>
              <div style={{ fontFamily, fontSize: 13, color: brand.colors.cyan, marginTop: 8, fontWeight: 600 }}>
                {crmProgress >= 100 ? "✓ HubSpot — Synced" : `Syncing... ${Math.round(crmProgress)}%`}
              </div>
            </div>
          </div>

          <GlassCard delay={t(8)} style={{ width: 440, padding: 32 }}>
            <div style={{ fontFamily, fontSize: 11, color: brand.colors.cyan, letterSpacing: "0.18em", marginBottom: 20, fontWeight: 700 }}>
              NEW LEAD GENERATED
            </div>
            {fields.map((f) => (
              <div
                key={f.label}
                style={{
                  marginBottom: 16,
                  opacity: cFade(frame, f.at, 12),
                  transform: `translateX(${cSlide(frame, f.at, 14, 28)}px)`,
                  paddingBottom: 14,
                  borderBottom: `1px solid ${brand.colors.grayLight}`,
                }}
              >
                <div style={{ fontFamily, fontSize: 11, color: brand.colors.muted, marginBottom: 4, letterSpacing: "0.06em" }}>
                  {f.label.toUpperCase()}
                </div>
                <div style={{ fontFamily, fontSize: 18, fontWeight: 700, color: brand.colors.white }}>{f.value}</div>
              </div>
            ))}
            <div
              style={{
                marginTop: 8,
                padding: "12px 18px",
                borderRadius: 10,
                background: `${brand.colors.cyan}14`,
                border: `1px solid ${brand.colors.cyan}44`,
                fontFamily,
                fontSize: 13,
                color: brand.colors.cyan,
                fontWeight: 600,
                opacity: cFade(frame, t(60), 10),
              }}
            >
              Lead added to pipeline — Priority: High
            </div>
          </GlassCard>
        </AbsoluteFill>
      </CinematicCamera>
    </CinematicShell>
  );
};

/* ── SCENE 5: APPOINTMENT BOOKING (0:47–0:58) ── */
export const AppointmentScene = () => {
  const frame = useCurrentFrame();
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const slots = [9, 10, 11, 14, 15, 16];
  const selectedSlot = { day: 2, hour: 14 };
  const confirmOpacity = cFade(frame, t(48), 12);

  return (
    <CinematicShell variant="feature">
      <CinematicCamera intensity={0.3}>
        <AbsoluteFill style={{ padding: "100px 110px 150px" }}>
          <CinematicTitle lines={["BOOK APPOINTMENTS", "AUTOMATICALLY"]} size={50} delay={t(2)} />

          <div style={{ display: "flex", gap: 48, marginTop: 52, alignItems: "flex-start" }}>
            <GlassCard delay={t(6)} style={{ flex: 1, padding: 32 }}>
              <div style={{ fontFamily, fontSize: 13, color: brand.colors.muted, marginBottom: 24, fontWeight: 600, letterSpacing: "0.08em" }}>
                AVAILABLE SLOTS — THIS WEEK
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${days.length}, 1fr)`, gap: 8 }}>
                <div />
                {days.map((day) => (
                  <div key={day} style={{ fontFamily, fontSize: 12, color: brand.colors.muted, textAlign: "center", fontWeight: 600 }}>
                    {day}
                  </div>
                ))}
                {slots.map((hour) => (
                  <div key={`row-${hour}`} style={{ display: "contents" }}>
                    <div style={{ fontFamily, fontSize: 12, color: brand.colors.muted, display: "flex", alignItems: "center" }}>
                      {hour}:00
                    </div>
                    {days.map((day, di) => {
                      const selected = di === selectedSlot.day && hour === selectedSlot.hour;
                      const highlight = cFade(frame, t(32), 12);
                      return (
                        <div
                          key={`${day}-${hour}`}
                          style={{
                            padding: "12px 4px",
                            borderRadius: 10,
                            textAlign: "center",
                            fontFamily,
                            fontSize: 12,
                            fontWeight: selected ? 700 : 500,
                            background: selected ? brand.colors.cyan : brand.colors.gray,
                            color: selected ? brand.colors.dark : brand.colors.muted,
                            opacity: selected ? highlight : 0.45,
                            boxShadow: selected ? `0 0 24px ${brand.colors.cyan}77` : "none",
                            transform: selected ? `scale(${interpolate(highlight, [0, 1], [0.95, 1])})` : "none",
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard delay={t(42)} style={{ width: 360, padding: 28, opacity: confirmOpacity }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 12px #22C55E" }} />
                <div style={{ fontFamily, fontSize: 12, color: "#22C55E", fontWeight: 700, letterSpacing: "0.1em" }}>
                  CONFIRMATION SENT
                </div>
              </div>
              <div style={{ fontFamily, fontSize: 11, color: brand.colors.muted, marginBottom: 12 }}>SMS TO CUSTOMER</div>
              <div
                style={{
                  fontFamily,
                  fontSize: 15,
                  color: brand.colors.white,
                  lineHeight: 1.6,
                  padding: 16,
                  borderRadius: 12,
                  background: brand.colors.gray,
                }}
              >
                Your appointment is confirmed for Wed at 2:00 PM. Reply CHANGE to reschedule.
              </div>
            </GlassCard>
          </div>
        </AbsoluteFill>
      </CinematicCamera>
    </CinematicShell>
  );
};

/* ── SCENE 6: DASHBOARD REVEAL (0:58–1:12) ── */
export const DashboardScene = () => {
  return (
    <CinematicShell variant="hero">
      <CinematicCamera intensity={0.25}>
        <AbsoluteFill style={{ padding: "90px 80px 140px" }}>
          <CinematicTitle lines={["REAL-TIME", "BUSINESS INTELLIGENCE"]} size={50} delay={t(2)} />
          <div style={{ marginTop: 36 }}>
            <HolographicDashboard />
          </div>
        </AbsoluteFill>
      </CinematicCamera>
    </CinematicShell>
  );
};

/* ── SCENE 7: INTEGRATIONS (1:12–1:22) ── */
const INTEGRATION_NAMES = [
  "HubSpot",
  "Salesforce",
  "Google Calendar",
  "Zoho CRM",
  "Twilio",
  "Stripe",
] as const;

export const IntegrationsScene = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: CINEMATIC.dark }}>
      <IntegrationOrbit3D frame={frame * 2.2} />
      <AbsoluteFill style={{ zIndex: 1 }}>
        <CinematicCamera intensity={0.35}>
          <AbsoluteFill
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "88px 80px 100px",
            }}
          >
            <CinematicTitle
              lines={["SEAMLESS", "INTEGRATIONS"]}
              size={52}
              delay={t(2)}
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 12,
                maxWidth: 880,
              }}
            >
              {INTEGRATION_NAMES.map((name, i) => (
                <GlassCard
                  key={name}
                  delay={t(8) + i * t(4)}
                  style={{
                    padding: "12px 22px",
                    borderRadius: 999,
                  }}
                >
                  <span
                    style={{
                      fontFamily,
                      fontSize: 14,
                      fontWeight: 600,
                      color: brand.colors.white,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {name}
                  </span>
                </GlassCard>
              ))}
            </div>
            <div
              style={{
                fontFamily,
                fontSize: 15,
                color: brand.colors.muted,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: cFade(frame, t(40), 10),
              }}
            >
              Connects with your CRM, calendar, and business tools in minutes
            </div>
          </AbsoluteFill>
        </CinematicCamera>
      </AbsoluteFill>
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

/* ── SCENE 8: INDUSTRIES (1:22–1:34) ── */
const INDUSTRIES = [
  { key: "HVAC", name: "HVAC Technician" },
  { key: "Plumbing", name: "Plumber" },
  { key: "Electrician", name: "Electrician" },
  { key: "Dental", name: "Dental Clinic" },
  { key: "MedicalSpa", name: "Medical Spa" },
  { key: "Roofing", name: "Roofing Contractor" },
  { key: "Law", name: "Law Office" },
  { key: "HomeServices", name: "Home Services" },
] as const;

export const IndustriesScene = () => {
  const frame = useCurrentFrame();
  const cycleLen = 20;
  const activeIdx = Math.floor(frame / cycleLen) % INDUSTRIES.length;
  const localFrame = frame % cycleLen;
  const active = INDUSTRIES[activeIdx];

  return (
    <CinematicShell variant="minimal">
      <CinematicCamera intensity={0.5}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CinematicTitle lines={["BUILT FOR", "LOCAL BUSINESSES"]} size={54} delay={0} />

          <div
            style={{
              marginTop: 56,
              textAlign: "center",
              transform: `scale(${cScale(localFrame, 0, 18, 0.88, 1)})`,
              opacity: cFade(localFrame, 0, 14),
            }}
          >
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 28,
                background: `${brand.colors.cyan}12`,
                border: `1px solid ${brand.colors.cyan}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                boxShadow: `0 0 60px ${brand.colors.cyan}22`,
              }}
            >
              <IndustryIcon industry={active.key} size={56} />
            </div>
            <div style={{ fontFamily, fontSize: 38, fontWeight: 800, color: brand.colors.white, letterSpacing: "-0.02em" }}>
              {active.name}
            </div>
            <div style={{ fontFamily, fontSize: 15, color: brand.colors.cyan, marginTop: 12, fontWeight: 600 }}>
              Call IQ handles every call perfectly
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 48,
              flexWrap: "wrap",
              justifyContent: "center",
              maxWidth: 900,
            }}
          >
            {INDUSTRIES.map((ind, i) => (
              <div
                key={ind.key}
                style={{
                  fontFamily,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: `1px solid ${i === activeIdx ? brand.colors.cyan : brand.colors.grayLight}`,
                  background: i === activeIdx ? `${brand.colors.cyan}14` : "transparent",
                  color: i === activeIdx ? brand.colors.cyan : brand.colors.muted,
                  opacity: i === activeIdx ? 1 : 0.45,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <IndustryIcon industry={ind.key} size={16} color={i === activeIdx ? brand.colors.cyan : brand.colors.muted} />
                {ind.name.split(" ")[0]}
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </CinematicCamera>
    </CinematicShell>
  );
};

/* ── SCENE 9: RESULTS (1:34–1:45) ── */
export const ResultsScene = () => {
  return (
    <CinematicShell variant="cta">
      <CinematicCamera intensity={0.35}>
        <AbsoluteFill style={{ padding: "100px 110px 150px" }}>
          <div style={{ display: "flex", gap: 40, marginBottom: 48 }}>
            {[
              { label: "MORE LEADS", from: 120, to: 612 },
              { label: "MORE BOOKINGS", from: 45, to: 284 },
              { label: "MORE REVENUE", from: 12, to: 49, suffix: "%" },
            ].map((m, i) => (
              <GlassCard key={m.label} delay={t(4) + i * t(6)} style={{ flex: 1, padding: "40px 32px", textAlign: "center" }}>
                <AnimatedCounter
                  from={m.from}
                  to={m.to}
                  start={t(10) + i * t(8)}
                  duration={t(36)}
                  suffix={m.suffix ?? ""}
                  size={52}
                />
                <div
                  style={{
                    fontFamily,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    color: brand.colors.white,
                    marginTop: 16,
                  }}
                >
                  {m.label}
                </div>
              </GlassCard>
            ))}
          </div>

          <GlassCard delay={t(26)} style={{ padding: "32px 40px", maxWidth: 700, margin: "0 auto" }}>
            <GrowthBar label="Lead conversion rate" from={18} to={49} delay={t(28)} suffix="%" />
            <GrowthBar label="Appointments booked" from={45} to={284} delay={t(34)} />
            <GrowthBar label="Customer satisfaction" from={72} to={98} delay={t(40)} suffix="%" />
          </GlassCard>
        </AbsoluteFill>
      </CinematicCamera>
    </CinematicShell>
  );
};

/* ── SCENE 10: GRAND FINALE (1:45–1:55) ── */
export const FinaleScene = () => {
  const frame = useCurrentFrame();
  const logoScale = cScale(frame, t(6), t(28), 0.85, 1);
  const fadeOut = cFade(frame, t(130), t(20), 1, 0);
  const camDrift = Math.sin(frame * 0.02) * 8;

  return (
    <AbsoluteFill style={{ background: CINEMATIC.dark, opacity: fadeOut }}>
      <CinematicShell variant="cta" letterbox={false}>
        <CinematicCamera intensity={0.2}>
          <AbsoluteFill
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${logoScale}) translateY(${camDrift}px)`,
            }}
          >
            <div style={{ position: "relative" }}>
              <LogoEnergyRing size={560} />
              <div style={{ position: "relative", zIndex: 2 }}>
                <CallIqLogo size="lg" animate={false} showTagline={false} />
              </div>
            </div>
            <div style={{ marginTop: 48, textAlign: "center" }}>
              <CinematicTitle lines={[CINEMATIC.company, "NEVER MISS ANOTHER LEAD"]} size={50} delay={t(10)} />
              <div
                style={{
                  fontFamily,
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  color: brand.colors.muted,
                  marginTop: 28,
                  opacity: cFade(frame, t(22), 10),
                }}
              >
                AI RECEPTIONIST • LEAD CAPTURE • APPOINTMENT BOOKING
              </div>
              <div
                style={{
                  fontFamily,
                  fontSize: 32,
                  fontWeight: 800,
                  color: brand.colors.cyan,
                  marginTop: 40,
                  letterSpacing: "0.1em",
                  opacity: cFade(frame, t(30), 10),
                  textShadow: `0 0 60px ${brand.colors.cyan}77`,
                }}
              >
                {CINEMATIC.website}
              </div>
            </div>
          </AbsoluteFill>
        </CinematicCamera>
      </CinematicShell>
    </AbsoluteFill>
  );
};
