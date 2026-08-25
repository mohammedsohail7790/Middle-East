"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Star, Phone, TrendingUp, BarChart3 } from "lucide-react";
import { api, asArray } from "@/lib/api";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { StatCard } from "@/components/ui-kit/StatCard";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { cn, timeAgo, formatDuration } from "@/lib/utils";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { DASHBOARD_POLL_MS } from "@/lib/dashboard-sync";
import { PlanFeatureGate } from "@/components/billing/PlanFeatureGate";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

interface QAReview {
  id: string;
  call_sid: string;
  sentiment: "positive" | "neutral" | "negative";
  sentiment_score: number;
  call_success: boolean;
  lead_quality: "high" | "medium" | "low";
  summary: string;
  duration_ms: number;
  created_at: string;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300",
  neutral: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300",
  negative: "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-300",
};

const QUALITY_COLORS: Record<string, string> = {
  high: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
  medium: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
  low: "text-red-600 bg-red-50 dark:bg-red-950/30",
};

export default function QualityPage() {
  return (
    <PlanFeatureGate feature="quality">
      <QualityPageContent />
    </PlanFeatureGate>
  );
}

function QualityPageContent() {
  const t = useTranslations("pages.quality");
  const { title, description } = useDashboardPageLabels("/dashboard/quality");
  const [reviews, setReviews] = useState<QAReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReviews = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    api
      .get<QAReview[]>("/qa/quality-scores?limit=50")
      .then((data) => { setReviews(asArray<QAReview>(data)); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useRealtimeQuery(["calls", "analytics"], loadReviews, "", {
    pollMs: DASHBOARD_POLL_MS,
    pollOnlyWhenDisconnected: true,
  });

  const positive = reviews.filter((r) => r.sentiment === "positive").length;
  const successRate = reviews.length > 0 ? Math.round((reviews.filter((r) => r.call_success).length / reviews.length) * 100) : 0;
  const highQuality = reviews.filter((r) => r.lead_quality === "high").length;

  return (
    <DashboardPage
      title={title}
      description={description}
      loading={loading && reviews.length === 0}
      error={error || undefined}
    >
      <div className="dashboard-stat-grid dashboard-stat-grid--three">
        <StatCard label={t("totalReviews")} value={reviews.length} icon={Star} iconVariant="accent" index={0} />
        <StatCard label={t("successRate")} value={`${successRate}%`} icon={TrendingUp} iconVariant="success" index={1} />
        <StatCard label={t("highQualityLeads")} value={highQuality} icon={BarChart3} iconVariant="violet" index={2} />
      </div>

      <DashboardPageSection title={t("callReviews")} icon={Star} iconVariant="accent">
        {reviews.length === 0 && !loading ? (
          <EmptyState
            icon={Star}
            title={t("noReviews")}
            description={t("noReviewsDesc")}
          />
        ) : (
          <VibePanel beam className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="divide-y divide-border">
            {reviews.map((review) => (
              <div key={review.id} className="vibe-quality-row flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{review.call_sid}</span>
                    <span className={cn("px-2 py-0.5 text-[10px] rounded-full font-medium capitalize", SENTIMENT_COLORS[review.sentiment])}>
                      {review.sentiment}
                    </span>
                    <span className={cn("px-2 py-0.5 text-[10px] rounded-full font-medium capitalize", QUALITY_COLORS[review.lead_quality])}>
                      {review.lead_quality} {t("leadSuffix")}
                    </span>
                    {review.call_success && (
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 font-medium">
                        {t("successful")}
                      </span>
                    )}
                  </div>
                  {review.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{review.summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span className="flex items-center gap-1">
                    <Phone className="size-3" />
                    {formatDuration(review.duration_ms)}
                  </span>
                  <span>{timeAgo(review.created_at)}</span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={cn("size-3", s <= Math.round(review.sentiment_score / 20) ? "text-amber-400 fill-amber-400" : "text-muted")}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          </VibePanel>
        )}
      </DashboardPageSection>
    </DashboardPage>
  );
}
