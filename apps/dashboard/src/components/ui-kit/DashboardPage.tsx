"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui-kit/PageSkeleton";

type DashboardPageProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  children: ReactNode;
  maxWidth?: "md" | "lg" | "xl" | "full";
  className?: string;
  contentClassName?: string;
};

const MAX_WIDTH: Record<NonNullable<DashboardPageProps["maxWidth"]>, string> = {
  md: "max-w-5xl mx-auto",
  lg: "max-w-6xl mx-auto",
  xl: "max-w-7xl mx-auto",
  full: "max-w-none",
};

export function DashboardPage({
  title,
  description,
  actions,
  toolbar,
  loading,
  error,
  onRetry,
  children,
  maxWidth = "xl",
  className,
  contentClassName,
}: DashboardPageProps) {
  return (
    <div className={cn("dashboard-page flex flex-col gap-6 sm:gap-7 pb-24", MAX_WIDTH[maxWidth], className)}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="dashboard-page-header dashboard-page-header--premium"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="w-0.5 h-7 sm:h-8 rounded-full bg-accent shrink-0 opacity-75" aria-hidden />
            <div className="min-w-0">
              <h1 className="dashboard-title leading-tight">{title}</h1>
              {description && <p className="dashboard-description">{description}</p>}
            </div>
          </div>
        </div>
        {actions && (
          <div className="dashboard-page-actions">
            {actions}
          </div>
        )}
      </motion.div>

      {toolbar && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="dashboard-toolbar min-w-0"
        >
          {toolbar}
        </motion.div>
      )}

      {error && (
        <div className="dashboard-alert dashboard-alert-error" role="alert">
          <AlertCircle className="size-5 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">Could not load data</p>
            <p className="text-sm mt-0.5 opacity-90 break-words">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 text-sm font-medium underline underline-offset-2 hover:opacity-80"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className={cn("dashboard-page-content min-w-0", contentClassName)}
      >
        {loading ? (
          <div aria-busy="true" aria-live="polite">
            <PageSkeleton statCount={2} />
          </div>
        ) : (
          children
        )}
      </motion.div>
    </div>
  );
}
