"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  asChild?: boolean;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#ffffff",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "100px",
      background = "#0066CC",
      className,
      children,
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const style = {
      "--spread": "90deg",
      "--shimmer-color": shimmerColor,
      "--radius": borderRadius,
      "--speed": shimmerDuration,
      "--cut": shimmerSize,
      "--bg": background,
    } as CSSProperties;

    const buttonClassName = cn(
      "group relative z-0 inline-flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap px-6 py-2.5 text-sm font-medium text-white hover:brightness-90 no-underline [background:var(--bg)] [border-radius:var(--radius)]",
      "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
      className,
    );

    // Apple surface system: a flat blue pill. The shimmer sweep and inner glow were removed;
    // the props are kept so existing call sites stay valid.
    const shimmerLayers = null;

    if (asChild) {
      return (
        <div style={style} className="group relative inline-flex">
          {shimmerLayers}
          <Slot ref={ref} style={style} className={buttonClassName} {...props}>
            {children}
          </Slot>
        </div>
      );
    }

    return (
      <button ref={ref} style={style} className={buttonClassName} {...props}>
        {shimmerLayers}
        <span className="relative z-10">{children}</span>
      </button>
    );
  },
);

ShimmerButton.displayName = "ShimmerButton";
