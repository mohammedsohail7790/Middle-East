"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { api, asArray } from "@/lib/api";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";

export interface CrmRelationOption {
  /** Field key on the entity, e.g. "companyId" */
  key: string;
  label: string;
  /** Gateway path to fetch options from, e.g. "/crm/companies" */
  apiPath: string;
  /** Field on the related record to display, e.g. "name" or "title" */
  labelField: string;
}

export interface CrmFieldConfig {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "url" | "number" | "textarea" | "relation";
  required?: boolean;
  placeholder?: string;
}

interface CrmEntity {
  id: string;
  [key: string]: unknown;
}

export interface CrmEntityManagerProps {
  title: string;
  description: string;
  icon: LucideIcon;
  entityLabel: string;
  apiPath: string;
  fields: CrmFieldConfig[];
  relations?: CrmRelationOption[];
  renderRow: (item: CrmEntity, relationOptions: Record<string, CrmEntity[]>) => ReactNode;
  emptyDescription: string;
}

function emptyFormValues(fields: CrmFieldConfig[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

export function CrmEntityManager({
  title,
  description,
  icon: Icon,
  entityLabel,
  apiPath,
  fields,
  relations = [],
  renderRow,
  emptyDescription,
}: CrmEntityManagerProps) {
  const [items, setItems] = useState<CrmEntity[]>([]);
  const [relationOptions, setRelationOptions] = useState<Record<string, CrmEntity[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => emptyFormValues(fields));
  const [submitting, setSubmitting] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get<CrmEntity[]>(apiPath)
      .then((rows) => setItems(asArray<CrmEntity>(rows)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [apiPath]);

  const loadRelations = useCallback(() => {
    relations.forEach((rel) => {
      api
        .get<CrmEntity[]>(rel.apiPath)
        .then((rows) => setRelationOptions((prev) => ({ ...prev, [rel.key]: asArray<CrmEntity>(rows) })))
        .catch(() => {});
    });
    // relations config is stable per page instance; only re-run if apiPath set changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relations.map((r) => r.apiPath).join(",")]);

  useEffect(() => {
    load();
    loadRelations();
  }, [load, loadRelations]);

  const openCreate = () => {
    setForm(emptyFormValues(fields));
    setEditingId(null);
    setModalMode("create");
  };

  const openEdit = (item: CrmEntity) => {
    const next = emptyFormValues(fields);
    for (const f of fields) {
      const value = item[f.key];
      next[f.key] = value == null ? "" : String(value);
    }
    setForm(next);
    setEditingId(item.id);
    setModalMode("edit");
  };

  const closeModal = () => setModalMode(null);

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = form[f.key]?.trim() ?? "";
      if (!raw) continue;
      payload[f.key] = f.type === "number" ? Number(raw) : raw;
    }
    return payload;
  };

  const save = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = buildPayload();
      if (modalMode === "edit" && editingId) {
        await api.patch(`${apiPath}/${editingId}`, payload);
      } else {
        await api.post(apiPath, payload);
      }
      closeModal();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item: CrmEntity) => {
    const ok = await confirm({
      title: `Delete ${entityLabel.toLowerCase()}?`,
      message: `This will permanently remove this ${entityLabel.toLowerCase()} from your workspace.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.del(`${apiPath}/${item.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const requiredField = useMemo(() => fields.find((f) => f.required), [fields]);
  const canSubmit = !requiredField || form[requiredField.key]?.trim().length > 0;

  return (
    <DashboardPage
      title={title}
      description={description}
      error={error}
      onRetry={load}
      loading={loading && items.length === 0}
      actions={
        <button type="button" onClick={openCreate} className="btn-primary text-sm">
          <Plus className="size-4" strokeWidth={ICON_STROKE} /> New {entityLabel}
        </button>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={`No ${title.toLowerCase()} yet`}
          description={emptyDescription}
          action={
            <button type="button" onClick={openCreate} className="btn-primary text-sm">
              <Plus className="size-4" strokeWidth={ICON_STROKE} /> Add your first {entityLabel.toLowerCase()}
            </button>
          }
        />
      ) : (
        <div className="dashboard-panel overflow-hidden divide-y divide-border">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="dashboard-list-row sm:p-5"
            >
              {renderRow(item, relationOptions)}
              <div className="dashboard-list-row-actions">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="dashboard-icon-btn"
                  aria-label={`Edit ${entityLabel.toLowerCase()}`}
                >
                  <Pencil className="size-4" strokeWidth={ICON_STROKE} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="dashboard-icon-btn"
                  aria-label={`Delete ${entityLabel.toLowerCase()}`}
                >
                  <Trash2 className="size-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {modalMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dashboard-modal-overlay"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-modal-panel sm:max-w-md !p-0"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6 border-b border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <IconBox icon={Icon} variant="accent" size="sm" />
                  <h2 className="text-lg font-semibold text-foreground truncate">
                    {modalMode === "edit" ? `Edit ${entityLabel}` : `New ${entityLabel}`}
                  </h2>
                </div>
                <button type="button" onClick={closeModal} className="dashboard-icon-btn !size-8" aria-label="Close">
                  <X className="size-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                {fields.map((f) => (
                  <div key={f.key}>
                    <label className="dashboard-field-label" htmlFor={`crm-field-${f.key}`}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        id={`crm-field-${f.key}`}
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        rows={3}
                        className="input"
                      />
                    ) : f.type === "relation" ? (
                      <select
                        id={`crm-field-${f.key}`}
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="input"
                      >
                        <option value="">
                          Select {f.label.toLowerCase()}...
                        </option>
                        {(relationOptions[f.key] ?? []).map((opt) => {
                          const relation = relations.find((r) => r.key === f.key);
                          const label = relation ? String(opt[relation.labelField] ?? opt.id) : opt.id;
                          return (
                            <option key={opt.id} value={opt.id}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <input
                        id={`crm-field-${f.key}`}
                        type={f.type}
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="input"
                      />
                    )}
                  </div>
                ))}
                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <button type="button" onClick={closeModal} className="btn-ghost flex-1">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={!canSubmit || submitting}
                    className="btn-primary flex-1"
                  >
                    {submitting ? "Saving..." : modalMode === "edit" ? "Save changes" : `Create ${entityLabel}`}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {confirmDialog}
    </DashboardPage>
  );
}
