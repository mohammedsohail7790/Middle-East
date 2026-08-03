"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="dashboard-page-header"
    >
      <div className="min-w-0 flex-1">
        <h1 className="dashboard-title">{title}</h1>
        {description && <p className="dashboard-description">{description}</p>}
      </div>
      {action && <div className="shrink-0 w-full sm:w-auto">{action}</div>}
    </motion.div>
  );
}
