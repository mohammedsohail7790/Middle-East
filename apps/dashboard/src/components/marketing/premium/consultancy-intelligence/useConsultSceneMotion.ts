import { useEffect, useRef, type MutableRefObject } from "react";

export type SceneMotion = {
  parallax: { x: number; y: number };
  scroll: number;
  animate: boolean;
};

export function useConsultSceneMotion(mobile: boolean, reduced: boolean): MutableRefObject<SceneMotion> {
  const motion = useRef<SceneMotion>({
    parallax: { x: 0, y: 0 },
    scroll: 1,
    animate: true,
  });

  useEffect(() => {
    motion.current.animate = !reduced;

    if (reduced || mobile) return;

    const onMove = (e: MouseEvent) => {
      motion.current.parallax.x = (e.clientX / window.innerWidth - 0.5) * 0.14;
      motion.current.parallax.y = (e.clientY / window.innerHeight - 0.5) * 0.09;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mobile, reduced]);

  useEffect(() => {
    const hero = document.querySelector(".consult-hero");
    if (!hero) return;

    const update = () => {
      const rect = hero.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = 1 - Math.min(1, Math.max(0, rect.top / vh));
      motion.current.scroll = 0.88 + progress * 0.12;
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return motion;
}
