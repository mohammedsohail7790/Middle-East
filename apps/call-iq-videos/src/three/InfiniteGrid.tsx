// @ts-nocheck
import { brand } from "../brand";

type InfiniteGridProps = {
  frame: number;
  size?: number;
  divisions?: number;
};

export const InfiniteGrid: React.FC<InfiniteGridProps> = ({
  frame,
  size = 30,
  divisions = 30,
}) => {
  const drift = (frame * 0.015) % 1;

  return (
    <group position={[0, -2.5, drift * 2 - 1]} rotation={[-Math.PI / 2.15, 0, 0]}>
      <gridHelper
        args={[size, divisions, brand.colors.cyan, brand.colors.grayLight]}
      />
    </group>
  );
};
