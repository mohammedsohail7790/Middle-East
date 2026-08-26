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
      background = "rgba(13, 148, 136, 1)",
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
      "group relative z-0 inline-flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border border-white/10 px-6 py-2.5 text-sm font-semibold text-white no-underline [background:var(--bg)] [border-radius:var(--radius)]",
      "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
      className,
    );

    const shimmerLayers = (
      <>
        <div className="absolute inset-0 -z-30 overflow-visible blur-[2px]">
          <div className="animate-shimmer-slide absolute inset-0 aspect-square h-full rounded-none [mask:none]">
            <div className="animate-spin-around absolute -inset-full w-auto rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
          </div>
        </div>
        <div
          className={cn(
            "pointer-events-none absolute inset-0 size-full rounded-[inherit]",
            "shadow-[inset_0_-8px_10px_#ffffff1f]",
            "transform-gpu transition-all duration-300 ease-in-out",
            "group-hover:shadow-[inset_0_-6px_10px_#ffffff3f]",
            "group-active:shadow-[inset_0_-10px_10px_#ffffff3f]",
          )}
        />
        <div className="absolute inset-[var(--cut)] -z-20 rounded-[var(--radius)] [background:var(--bg)]" />
      </>
    );

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
