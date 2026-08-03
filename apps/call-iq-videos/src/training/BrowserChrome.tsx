import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type BrowserChromeProps = {
  url: string;
  children: React.ReactNode;
};

export const BrowserChrome: React.FC<BrowserChromeProps> = ({
  url,
  children,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 20], [0.96, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          background: brand.colors.gray,
          borderRadius: "12px 12px 0 0",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          border: `1px solid ${brand.colors.grayLight}`,
          borderBottom: "none",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {["#FF5F57", "#FFBD2E", "#28CA41"].map((color) => (
            <div
              key={color}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: color,
              }}
            />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            background: brand.colors.dark,
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 13,
            color: brand.colors.muted,
          }}
        >
          {url}
        </div>
      </div>
      <div
        style={{
          background: brand.colors.dark,
          border: `1px solid ${brand.colors.grayLight}`,
          borderRadius: "0 0 12px 12px",
          minHeight: 420,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
};
