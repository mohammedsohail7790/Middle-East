"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Plus,
  Trash2,
  Upload,
  Search,
  Link2,
  FileText,
  Library,
  Save,
  Building2,
  DollarSign,
  Briefcase,
  MapPin,
  CheckCircle,
} from "lucide-react";
import { api, asArray, resolveTenantId } from "@/lib/api";
import { normalizeKnowledgeItem, normalizeTenantSettings, tenantSettingsToApi } from "@/lib/gateway-adapters";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";
import { cn } from "@/lib/utils";
import { DASHBOARD_POLL_MS, useDashboardSync } from "@/lib/dashboard-sync";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { normalizeKnowledgeImportUrl } from "@/lib/knowledge-url";
import { isTemplateKnowledgeSource } from "@/lib/knowledge-templates";
import { KnowledgeBusinessTemplates } from "@/components/knowledge/KnowledgeBusinessTemplates";

interface CompanyProfile {
  id: string;
  companyName: string;
  diagnosticFee: string;
  language: string;
  timezone: string;
  tone: string;
  transferNumber: string;
  services: string;
  businessDescription: string;
  serviceAreaEnabled: boolean;
  serviceAreaMode: "miles" | "minutes";
  serviceAreaLimit: string;
  serviceAreaAddress: string;
}

function parseServiceArea(metadata: unknown): Pick<
  CompanyProfile,
  "serviceAreaEnabled" | "serviceAreaMode" | "serviceAreaLimit" | "serviceAreaAddress"
> {
  const sa =
    metadata && typeof metadata === "object"
      ? ((metadata as Record<string, unknown>).service_area as Record<string, unknown> | undefined)
      : undefined;
  return {
    serviceAreaEnabled: sa?.enabled === true,
    serviceAreaMode: sa?.mode === "minutes" ? "minutes" : "miles",
    serviceAreaLimit: sa?.limit != null && Number(sa.limit) > 0 ? String(sa.limit) : "",
    serviceAreaAddress: typeof sa?.address === "string" ? sa.address : "",
  };
}

interface KnowledgeItem {
  id: string;
  text: string;
  category: string;
  source: string;
  created_at: string;
}

type ImportMode = "paste" | "url" | "file";

async function fileToUploadPayload(file: File): Promise<{
  content: string;
  fileType: string;
  encoding: "utf8" | "base64";
}> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "txt";
  const fileType = ["txt", "csv", "md", "pdf", "docx"].includes(ext) ? ext : "txt";
  if (ext === "pdf" || ext === "docx") {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { content: btoa(binary), fileType, encoding: "base64" };
  }
  return { content: await file.text(), fileType, encoding: "utf8" };
}

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "hvac", label: "HVAC" },
  { id: "plumbing", label: "Plumbing" },
  { id: "electrical", label: "Electrical" },
  { id: "general", label: "General" },
];

const CATEGORY_STYLES: Record<string, string> = {
  all: "bg-gray-100 text-gray-700",
  hvac: "bg-blue-500/10 text-blue-600",
  plumbing: "bg-cyan-500/10 text-cyan-700",
  electrical: "bg-amber-50 text-amber-800",
  general: "bg-accent/10 text-accent-dark",
};

function pollKnowledgeRefresh(load: () => Promise<void>, attempts = 10, intervalMs = 3000) {
  let n = 0;
  const id = setInterval(() => {
    n += 1;
    void load();
    if (n >= attempts) clearInterval(id);
  }, intervalMs);
  return () => clearInterval(id);
}

const IMPORT_TABS: { id: ImportMode; label: string; icon: typeof FileText }[] = [
  { id: "paste", label: "Paste text", icon: FileText },
  { id: "url", label: "Website", icon: Link2 },
  { id: "file", label: "Upload file", icon: Upload },
];

export default function KnowledgePage() {
  const { confirm, confirmDialog } = useConfirm();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const profileDirtyRef = useRef(false);

  const loadProfile = useCallback(async (opts?: { silent?: boolean }) => {
    if (profileDirtyRef.current && opts?.silent) return;
    if (!opts?.silent) setProfileLoading(true);
    try {
      const [tenantRes, aiRes] = await Promise.allSettled([
        api.get<Record<string, unknown>>("/tenants/me"),
        api.get<Record<string, unknown>>("/ai-config"),
      ]);
      if (tenantRes.status === "rejected") {
        const reason = tenantRes.reason;
        throw reason instanceof Error ? reason : new Error(String(reason));
      }
      const tenant = tenantRes.value;
      const aiConfig = aiRes.status === "fulfilled" ? aiRes.value : {};
      const base = normalizeTenantSettings(tenant);
      const services = Array.isArray(aiConfig.servicesOffered)
        ? (aiConfig.servicesOffered as string[]).join(", ")
        : Array.isArray(aiConfig.services_offered)
          ? (aiConfig.services_offered as string[]).join(", ")
          : "";
      setProfile({
        id: base.id,
        companyName: base.companyName,
        diagnosticFee: base.diagnosticFee,
        language: base.language,
        timezone: base.timezone,
        tone: base.tone,
        transferNumber: base.transferNumber,
        services,
        businessDescription: String(
          aiConfig.businessDescription ?? aiConfig.business_description ?? ""
        ),
        ...parseServiceArea(tenant.metadata),
      });
      setProfileError("");
    } catch (e) {
      if (!opts?.silent || !profile) {
        setProfileError(e instanceof Error ? e.message : "Failed to load business profile");
      }
    } finally {
      if (!opts?.silent) setProfileLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useDashboardSync(["settings", "config"], () => void loadProfile({ silent: true }), { debounceMs: 1000 });

  const patchProfile = (updater: (prev: CompanyProfile) => CompanyProfile) => {
    profileDirtyRef.current = true;
    setProfile((prev) => (prev ? updater(prev) : prev));
  };

  const saveProfile = async () => {
    if (!profile) return;
    setProfileSaving(true);
    setProfileError("");
    setProfileSuccess("");
    try {
      const tenantId = profile.id || (await resolveTenantId());
      await api.put(`/tenants/${tenantId}`, {
        ...tenantSettingsToApi({
          companyName: profile.companyName,
          diagnosticFee: profile.diagnosticFee,
          language: profile.language,
          timezone: profile.timezone,
          tone: profile.tone,
          transferNumber: profile.transferNumber,
        }),
        metadata: {
          service_area: {
            enabled: profile.serviceAreaEnabled,
            mode: profile.serviceAreaMode,
            limit: Number.parseFloat(profile.serviceAreaLimit) || 0,
            address: profile.serviceAreaAddress.trim(),
          },
        },
      });
      await api.put("/ai-config", {
        businessDescription: profile.businessDescription.trim(),
        servicesOffered: profile.services
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      profileDirtyRef.current = false;
      setProfileSuccess("Business profile saved.");
      syncDashboardAction("settings");
      syncDashboardAction("config");
      setTimeout(() => setProfileSuccess(""), 4000);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to save business profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("general");
  const [filterCategory, setFilterCategory] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("paste");
  const [dragActive, setDragActive] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(() => {
    return api
      .get<unknown>("/knowledge")
      .then((data) =>
        setItems(
          asArray<Record<string, unknown>>(data).map(normalizeKnowledgeItem)
        )
      );
  }, []);

  const loadList = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setListLoading(true);
    void loadItems()
      .then(() => {
        if (!opts?.silent) setListError("");
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (!opts?.silent) setListError(msg);
        setItems([]);
      })
      .finally(() => {
        if (!opts?.silent) setListLoading(false);
      });
  }, [loadItems]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useRealtimeQuery(
    ["knowledge", "config"],
    () => void loadList({ silent: true }),
    `${search}|${filterCategory}`,
    { pollMs: DASHBOARD_POLL_MS, pollOnlyWhenDisconnected: true }
  );

  const ingestCategory = category;

  const ingestWebsite = async () => {
    setSubmitting(true);
    setListError("");
    setSuccess("");
    try {
      const url = normalizeKnowledgeImportUrl(websiteUrl);
      await api.post("/knowledge/ingest-url", { url, category: ingestCategory });
      setWebsiteUrl("");
      setSuccess(`Import started from ${new URL(url).hostname} — entries appear in 30–60 seconds.`);
      await loadItems().catch(() => {});
      syncDashboardAction("knowledge");
      pollKnowledgeRefresh(loadItems);
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Website import failed");
    } finally {
      setSubmitting(false);
    }
  };

  const addKnowledge = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setListError("");
    setSuccess("");
    try {
      await api.post("/knowledge", { text: text.trim(), category: ingestCategory });
      setText("");
      setSuccess("Added to your knowledge library.");
      await loadItems();
      syncDashboardAction("knowledge");
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Could not add knowledge");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteItem = async (id: string) => {
    const ok = await confirm({
      title: "Delete this entry?",
      message: "Your AI will no longer use this knowledge on calls. This cannot be undone.",
      confirmLabel: "Delete entry",
    });
    if (!ok) return;
    try {
      await api.del(`/knowledge/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      syncDashboardAction("knowledge");
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setSubmitting(true);
    setListError("");
    setSuccess("");
    try {
      const { content, fileType, encoding } = await fileToUploadPayload(file);
      await api.post("/knowledge/upload", {
        fileName: file.name,
        content,
        fileType,
        encoding,
        category: ingestCategory,
      });
      setSuccess(`${file.name} uploaded — processing (10–30 seconds).`);
      await loadItems();
      syncDashboardAction("knowledge");
      pollKnowledgeRefresh(loadItems);
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (isTemplateKnowledgeSource(item.source)) return false;
    if (filterCategory !== "all" && item.category !== filterCategory) return false;
    if (!search.trim()) return true;
    return item.text.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <DashboardPage
      title="Business Profile"
      description="Company details, service area, and knowledge your AI uses on every call"
      error={listError && items.length === 0 && !listLoading ? listError : undefined}
    >
      {profileError && profile && (
        <div className="dashboard-alert dashboard-alert-error" role="alert">
          <p className="text-sm">{profileError}</p>
        </div>
      )}
      {profileSuccess && (
        <div className="dashboard-alert border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200">
          <CheckCircle className="size-5 shrink-0" strokeWidth={ICON_STROKE} />
          <p className="text-sm">{profileSuccess}</p>
        </div>
      )}

      {profile && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-settings-grid min-w-0"
        >
          <section className="dashboard-panel-padded space-y-6">
            <SectionHeader icon={Building2} title="Company & services" iconVariant="accent" />
            <div>
              <label htmlFor="profile-company-name" className="dashboard-field-label">Company name</label>
              <input
                id="profile-company-name"
                type="text"
                value={profile.companyName}
                onChange={(e) => patchProfile((s) => ({ ...s, companyName: e.target.value }))}
                placeholder="Your Company Name"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="profile-services" className="dashboard-field-label flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-foreground-tertiary" />
                Services (comma-separated)
              </label>
              <input
                id="profile-services"
                type="text"
                value={profile.services}
                onChange={(e) => patchProfile((s) => ({ ...s, services: e.target.value }))}
                placeholder="AC repair, furnace install, maintenance plans"
                className="input"
              />
              <p className="dashboard-field-hint">
                The AI uses this list when callers ask what you offer.
              </p>
            </div>
            <div>
              <label htmlFor="profile-business-description" className="dashboard-field-label">Business description</label>
              <textarea
                id="profile-business-description"
                rows={3}
                value={profile.businessDescription}
                onChange={(e) => patchProfile((s) => ({ ...s, businessDescription: e.target.value }))}
                placeholder="Brief overview of your business for the AI receptionist..."
                className="input resize-none"
              />
            </div>
            <div>
              <label htmlFor="profile-diagnostic-fee" className="dashboard-field-label flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-foreground-tertiary" />
                Diagnostic / service call fee (optional)
              </label>
              <input
                id="profile-diagnostic-fee"
                type="text"
                inputMode="decimal"
                value={profile.diagnosticFee}
                onChange={(e) => patchProfile((s) => ({ ...s, diagnosticFee: e.target.value }))}
                placeholder="e.g. 89"
                className="input"
              />
            </div>
          </section>

          <section className="dashboard-panel-padded space-y-6">
            <SectionHeader
              icon={MapPin}
              title="Service area"
              iconVariant="success"
              description="The AI always asks callers for their service address. Turn this on to also verify the address is within your coverage area before booking a visit."
            />
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={profile.serviceAreaEnabled}
                onChange={(e) =>
                  patchProfile((s) => ({ ...s, serviceAreaEnabled: e.target.checked }))
                }
                className="size-4 accent-accent"
              />
              <span className="text-sm font-medium text-foreground">
                Limit bookings to my service area
              </span>
            </label>
            {profile.serviceAreaEnabled && (
              <>
                <div>
                  <label htmlFor="profile-sa-address" className="dashboard-field-label">
                    Base address (shop / office)
                  </label>
                  <input
                    id="profile-sa-address"
                    type="text"
                    value={profile.serviceAreaAddress}
                    onChange={(e) =>
                      patchProfile((s) => ({ ...s, serviceAreaAddress: e.target.value }))
                    }
                    placeholder="123 Main St, Springfield, IL"
                    className="input"
                  />
                  <p className="dashboard-field-hint">
                    Distances are measured from here. Use a full street address for accuracy.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="profile-sa-mode" className="dashboard-field-label">
                      Measure by
                    </label>
                    <select
                      id="profile-sa-mode"
                      value={profile.serviceAreaMode}
                      onChange={(e) =>
                        patchProfile((s) => ({
                          ...s,
                          serviceAreaMode: e.target.value === "minutes" ? "minutes" : "miles",
                        }))
                      }
                      className="input"
                    >
                      <option value="miles">Miles (radius)</option>
                      <option value="minutes">Driving minutes</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="profile-sa-limit" className="dashboard-field-label">
                      {profile.serviceAreaMode === "minutes" ? "Max drive (minutes)" : "Max distance (miles)"}
                    </label>
                    <input
                      id="profile-sa-limit"
                      type="text"
                      inputMode="decimal"
                      value={profile.serviceAreaLimit}
                      onChange={(e) =>
                        patchProfile((s) => ({ ...s, serviceAreaLimit: e.target.value }))
                      }
                      placeholder={profile.serviceAreaMode === "minutes" ? "e.g. 30" : "e.g. 25"}
                      className="input"
                    />
                  </div>
                </div>
                <p className="dashboard-field-hint">
                  Callers outside this area aren&apos;t booked for visits — the AI politely lets them
                  know and still captures their info as a lead.
                </p>
              </>
            )}
          </section>

          <div className="lg:col-span-2 flex justify-end">
            <button type="button" onClick={() => void saveProfile()} disabled={profileSaving} className="btn-primary">
              <Save className="size-4" strokeWidth={ICON_STROKE} /> {profileSaving ? "Saving…" : "Save business profile"}
            </button>
          </div>
        </motion.div>
      )}

      <KnowledgeBusinessTemplates />

      {success && (
        <div className="dashboard-alert dashboard-alert-success">
          <p className="text-sm">{success}</p>
        </div>
      )}

      <DashboardPageSection
        step="Step 2 · Extra training"
        id="kb-extra-heading"
        title="FAQs, policies & documents"
        description="Optional content beyond hours and pricing — paste notes, import a page from your site, or upload files."
        icon={BookOpen}
        iconVariant="accent"
      >
      <div className="dashboard-content-grid">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-content-grid-aside"
        >
          <div className="dashboard-panel overflow-hidden flex flex-col min-h-[min(520px,70vh)] lg:min-h-[min(560px,72vh)]">
            <div className="flex border-b border-border bg-muted/20">
              {IMPORT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setImportMode(tab.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors border-b-2 -mb-px",
                    importMode === tab.id
                      ? "border-accent text-accent bg-background"
                      : "border-transparent text-foreground-secondary hover:text-foreground"
                  )}
                >
                  <tab.icon className="size-3.5 shrink-0" strokeWidth={ICON_STROKE} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="p-4 sm:p-5 flex-1 flex flex-col gap-4 min-h-0">
              <div>
                <span id="kb-category-label" className="dashboard-field-label">
                  Category for new content
                </span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="kb-category-label">
                  {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      aria-pressed={category === cat.id}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border",
                        category === cat.id
                          ? "border-accent/40 bg-accent/10 text-accent-dark"
                          : "border-border text-foreground-secondary hover:border-border/80"
                      )}
                      style={{ transition: "border-color 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out" }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {importMode === "paste" && (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste FAQs, policies, troubleshooting steps, or any text your agent should know…"
                    rows={10}
                    className="input resize-none flex-1 min-h-[200px]"
                  />
                  <button
                    type="button"
                    onClick={() => void addKnowledge()}
                    disabled={!text.trim() || submitting}
                    className="btn-primary w-full"
                  >
                    <Plus className="size-4" strokeWidth={ICON_STROKE} />
                    {submitting ? "Adding…" : "Add to library"}
                  </button>
                </>
              )}

              {importMode === "url" && (
                <>
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void ingestWebsite();
                    }}
                    placeholder="https://yourcompany.com/faq"
                    className="input"
                  />
                  <p className="text-xs text-foreground-tertiary leading-relaxed">
                    Public pages only. We extract readable text from HTML — JavaScript-only sites
                    may need a file upload instead.
                  </p>
                  <button
                    type="button"
                    onClick={() => void ingestWebsite()}
                    disabled={!websiteUrl.trim() || submitting}
                    className="btn-primary w-full mt-auto"
                  >
                    <Link2 className="size-4" strokeWidth={ICON_STROKE} />
                    {submitting ? "Importing…" : "Import from website"}
                  </button>
                </>
              )}

              {importMode === "file" && (
                <div
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer min-h-[220px]",
                    dragActive
                      ? "border-accent/50 bg-accent/[0.05]"
                      : "border-border hover:border-accent/30 hover:bg-muted/30"
                  )}
                  style={{ transition: "border-color 200ms ease-out, background-color 200ms ease-out" }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    void handleFileUpload(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.pdf,.docx"
                    onChange={(e) => void handleFileUpload(e.target.files)}
                    className="hidden"
                  />
                  <IconBox
                    icon={Upload}
                    variant={dragActive ? "accent" : "muted"}
                    size="lg"
                    className="mb-3"
                  />
                  <p className="text-sm font-medium text-foreground text-center">
                    {dragActive ? "Drop to upload" : "Drag & drop or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    PDF, Word, CSV, or text · max ~500k characters
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Library */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="dashboard-content-grid-main"
        >
          <div className="dashboard-panel overflow-hidden flex flex-col min-h-[min(420px,65vh)] lg:min-h-[min(560px,72vh)]">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2 shrink-0 min-w-0">
                <IconBox icon={Library} variant="accent" size="sm" />
                <h3 className="text-sm font-semibold text-foreground">Knowledge library</h3>
                {!listLoading && (
                  <span className="text-xs text-muted-foreground">
                    ({filteredItems.length})
                  </span>
                )}
              </div>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search entries…"
                  aria-label="Search knowledge base entries"
                  className="input pl-9 py-2 text-sm w-full"
                />
              </div>
            </div>

            <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setFilterCategory(cat.id)}
                  aria-pressed={filterCategory === cat.id}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-medium",
                    filterCategory === cat.id
                      ? "bg-foreground text-background"
                      : "text-foreground-secondary hover:bg-muted"
                  )}
                  style={{ transition: "background-color 150ms ease-out, color 150ms ease-out" }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {listError && items.length > 0 && (
                <div className="dashboard-alert border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
                  <p className="text-sm">{listError}</p>
                </div>
              )}

              {listLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredItems.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title={search ? "No matches" : "No extra entries yet"}
                  description="Business hours and pricing live in Step 1. Add FAQs or documents here."
                />
              ) : (
                filteredItems.map((item) => {
                  const style =
                    CATEGORY_STYLES[item.category] || CATEGORY_STYLES.general;
                  return (
                    <div
                      key={item.id}
                      className="group rounded-xl border border-border bg-background p-4 hover:border-border/80 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span
                              className={cn(
                                "px-2 py-0.5 text-[10px] rounded-full font-medium capitalize",
                                style
                              )}
                            >
                              {item.category}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(item.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-foreground-secondary line-clamp-4 leading-relaxed">
                            {item.text}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteItem(item.id)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 shrink-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                          style={{ transition: "opacity 150ms ease-out, color 150ms ease-out, background-color 150ms ease-out" }}
                          aria-label="Delete entry"
                        >
                          <Trash2 className="size-4" strokeWidth={ICON_STROKE} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </motion.div>
      </div>
      </DashboardPageSection>
      {confirmDialog}
    </DashboardPage>
  );
}
