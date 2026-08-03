import { AbsoluteFill, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fade, scaleIn } from "../lib/motion";
import {
  EnterpriseHeadline,
  EnterpriseLabel,
  EnterpriseSubtext,
  GlassPanel,
  VignetteOverlay,
} from "./EnterpriseOverlay";
import { EnterpriseBackground } from "../three/EnterpriseBackground";

type ProductMockSceneProps = {
  label: string;
  headline: string;
  subtext?: string;
  children: React.ReactNode;
};

/** Polished product UI mock — no screen recordings. */
export const ProductMockScene: React.FC<ProductMockSceneProps> = ({
  label,
  headline,
  subtext,
  children,
}) => {
  const frame = useCurrentFrame();
  const enter = scaleIn(frame, 0, 26);

  return (
    <AbsoluteFill style={{ background: "#050508" }}>
      <EnterpriseBackground frame={frame} variant="feature" />
      <AbsoluteFill
        style={{
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          padding: "0 64px",
          gap: 40,
        }}
      >
        <div style={{ flex: "0 0 400px" }}>
          <GlassPanel frame={frame}>
            <EnterpriseLabel frame={frame}>{label}</EnterpriseLabel>
            <EnterpriseHeadline frame={frame} size={40} delay={4}>
              {headline}
            </EnterpriseHeadline>
            {subtext && (
              <EnterpriseSubtext frame={frame} delay={12}>
                {subtext}
              </EnterpriseSubtext>
            )}
          </GlassPanel>
        </div>
        <div
          style={{
            flex: 1,
            height: "82%",
            borderRadius: 16,
            overflow: "hidden",
            border: `1px solid ${brand.colors.cyan}44`,
            boxShadow: `0 32px 100px rgba(0,0,0,0.55), 0 0 60px ${brand.colors.cyan}18`,
            transform: `scale(${enter})`,
            opacity: fade(frame, 10, 20),
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
      <VignetteOverlay />
    </AbsoluteFill>
  );
};
