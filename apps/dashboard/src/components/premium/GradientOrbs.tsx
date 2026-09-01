"use client";

export function GradientOrbs({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div
        className="absolute -top-[30%] -left-[10%] w-[55%] h-[55%] rounded-full blur-[100px] opacity-60 animate-orb-drift"
        style={{ background: "#C7A25A" }}
      />
      <div
        className="absolute top-[10%] -right-[15%] w-[45%] h-[45%] rounded-full blur-[90px] opacity-50 animate-orb-drift-reverse"
        style={{ background: "#8C6F3E" }}
      />
      <div
        className="absolute bottom-0 left-[30%] w-[40%] h-[35%] rounded-full blur-[80px] opacity-40"
        style={{ background: "#A7ADA3" }}
      />
    </div>
  );
}
