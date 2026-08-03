// @ts-nocheck
import { brand } from "../brand";

export const EnterpriseLighting: React.FC = () => (
  <>
    <ambientLight intensity={0.35} color="#ffffff" />
    <directionalLight
      position={[8, 12, 6]}
      intensity={1.2}
      color="#ffffff"
      castShadow
    />
    <directionalLight
      position={[-6, 4, -8]}
      intensity={0.45}
      color={brand.colors.cyan}
    />
    <pointLight position={[0, 2, 4]} intensity={0.8} color={brand.colors.cyan} />
    <pointLight position={[-4, -2, 2]} intensity={0.3} color="#6366f1" />
  </>
);
