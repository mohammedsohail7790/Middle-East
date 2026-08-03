"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" uses a red confirm button + warning icon (default). "default" uses the accent button. */
  tone?: "danger" | "default";
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Promise-based confirmation dialog — a polished, on-brand replacement for the
 * native `window.confirm()`. Self-contained: no global provider required.
 *
 * Usage:
 *   const { confirm, confirmDialog } = useConfirm();
 *   // in JSX: {confirmDialog}
 *   // in a handler: if (!(await confirm({ title, message }))) return;
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending]
  );

  const confirmDialog = (
    <ConfirmDialogView
      pending={pending}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
}

function ConfirmDialogView({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingConfirm | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!pending) return;
    // Focus the confirm button and trap Escape to cancel.
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  if (!mounted) return null;

  const tone = pending?.tone ?? "danger";

  return createPortal(
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="dashboard-modal-overlay"
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="dashboard-modal-panel !max-w-md p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <IconBox
                icon={AlertTriangle}
                variant={tone === "danger" ? "error" : "accent"}
                size="md"
                className="shrink-0"
              />
              <div className="min-w-0">
                <h2 id="confirm-dialog-title" className="text-base font-semibold text-foreground">
                  {pending.title}
                </h2>
                <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {pending.message}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onCancel} className="btn-ghost text-sm">
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={onConfirm}
                className={cn(
                  "text-sm inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-medium transition-colors",
                  tone === "danger"
                    ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500/50"
                    : "btn-primary"
                )}
              >
                <AlertTriangle className="size-4" strokeWidth={ICON_STROKE} />
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
