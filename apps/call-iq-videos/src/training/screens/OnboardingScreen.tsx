import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../../brand";
import { fontFamily } from "../../lib/fonts";
import { BrowserChrome } from "../BrowserChrome";

type Field = { label: string; value: string; filled?: boolean };
type Chip = { label: string; selected?: boolean; icon?: string };

type OnboardingScreenProps = {
  url?: string;
  stepLabel?: string;
  wizardStep?: number;
  wizardTotal?: number;
  headline: string;
  subtitle?: string;
  fields?: Field[];
  chips?: Chip[];
  buttonLabel?: string;
  showCheckmark?: boolean;
  notice?: string;
  completion?: {
    agentName: string;
    company: string;
    phone?: string;
    trialLine: string;
  };
};

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  url = "https://www.hallaai.com/onboarding",
  stepLabel,
  wizardStep,
  wizardTotal = 5,
  headline,
  subtitle,
  fields = [],
  chips,
  buttonLabel = "Continue",
  showCheckmark = false,
  notice,
  completion,
}) => {
  const frame = useCurrentFrame();
  const showWizardProgress =
    wizardStep !== undefined && wizardStep < wizardTotal;

  return (
    <BrowserChrome url={url}>
      <div style={{ padding: 40, fontFamily, minHeight: 400 }}>
        {showWizardProgress && (
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 10,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: brand.colors.muted,
              }}
            >
              <span>
                Setup · Step {wizardStep! + 1} of {wizardTotal}
              </span>
              {stepLabel ? <span>{stepLabel}</span> : null}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {Array.from({ length: wizardTotal }, (_, i) => {
                const active = i <= wizardStep!;
                const width = interpolate(
                  frame,
                  [i * 4, i * 4 + 12],
                  [0.3, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 99,
                      background: active
                        ? brand.colors.cyan
                        : brand.colors.grayLight,
                      opacity: active ? width : 0.5,
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {completion ? (
          <div style={{ textAlign: "center", padding: "24px 12px" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#10B981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: 28,
                color: brand.colors.white,
                opacity: interpolate(frame, [0, 15], [0, 1], {
                  extrapolateRight: "clamp",
                }),
              }}
            >
              ✓
            </div>
            <h2
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: brand.colors.white,
                marginBottom: 12,
              }}
            >
              {headline}
            </h2>
            <p
              style={{
                fontSize: 15,
                color: brand.colors.muted,
                lineHeight: 1.6,
                maxWidth: 480,
                margin: "0 auto 24px",
              }}
            >
              <strong style={{ color: brand.colors.white }}>{completion.agentName}</strong> is ready for{" "}
              <strong style={{ color: brand.colors.white }}>{completion.company}</strong>. {completion.trialLine}
              {completion.phone ? (
                <>
                  {" "}
                  Your line: <strong style={{ color: brand.colors.cyan }}>{completion.phone}</strong>
                </>
              ) : null}
            </p>
            <div
              style={{
                display: "inline-flex",
                gap: 12,
                marginTop: 8,
              }}
            >
              <div
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: `1px solid ${brand.colors.grayLight}`,
                  color: brand.colors.muted,
                  fontSize: 13,
                }}
              >
                Ring test number
              </div>
              <div
                style={{
                  padding: "12px 28px",
                  borderRadius: 8,
                  background: brand.colors.cyan,
                  color: brand.colors.dark,
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                Go to Dashboard →
              </div>
            </div>
          </div>
        ) : (
          <>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: brand.colors.white,
                marginBottom: subtitle ? 8 : 28,
                textAlign: chips || notice ? "center" : "left",
              }}
            >
              {headline}
            </h2>
            {subtitle ? (
              <p
                style={{
                  fontSize: 14,
                  color: brand.colors.muted,
                  marginBottom: 28,
                  textAlign: chips ? "center" : "left",
                  lineHeight: 1.5,
                }}
              >
                {subtitle}
              </p>
            ) : null}

            {notice ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: `${brand.colors.cyan}18`,
                  border: `1px solid ${brand.colors.cyan}44`,
                  fontSize: 14,
                  color: brand.colors.white,
                  lineHeight: 1.55,
                  marginBottom: 20,
                }}
              >
                {notice}
              </div>
            ) : null}

            {chips ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                {chips.map((chip, i) => {
                  const opacity = interpolate(frame, [i * 6, i * 6 + 12], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  });
                  return (
                    <div
                      key={chip.label}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        border: `2px solid ${chip.selected ? brand.colors.cyan : brand.colors.grayLight}`,
                        background: chip.selected ? `${brand.colors.cyan}14` : brand.colors.gray,
                        opacity,
                      }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 6 }}>{chip.icon ?? "📋"}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: brand.colors.white }}>
                        {chip.label}
                      </div>
                      {chip.selected ? (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 1,
                            color: brand.colors.cyan,
                            textTransform: "uppercase",
                          }}
                        >
                          Selected
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {fields.map((field, i) => {
              const opacity = interpolate(frame, [i * 8, i * 8 + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div key={field.label} style={{ marginBottom: 18, opacity }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      color: brand.colors.muted,
                      marginBottom: 6,
                    }}
                  >
                    {field.label}
                  </label>
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: 8,
                      background: brand.colors.gray,
                      border: `1px solid ${field.filled ? brand.colors.cyan : brand.colors.grayLight}`,
                      fontSize: 15,
                      color: brand.colors.white,
                    }}
                  >
                    {field.value}
                  </div>
                </div>
              );
            })}

            <div
              style={{
                marginTop: 24,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 28px",
                borderRadius: 8,
                background: brand.colors.cyan,
                color: brand.colors.dark,
                fontSize: 15,
                fontWeight: 600,
                opacity: interpolate(
                  frame,
                  [(fields.length + (chips?.length ?? 0)) * 6 + 10, (fields.length + (chips?.length ?? 0)) * 6 + 22],
                  [0, 1],
                  { extrapolateRight: "clamp" },
                ),
              }}
            >
              {showCheckmark && <span>✓</span>}
              {buttonLabel}
            </div>
          </>
        )}
      </div>
    </BrowserChrome>
  );
};
