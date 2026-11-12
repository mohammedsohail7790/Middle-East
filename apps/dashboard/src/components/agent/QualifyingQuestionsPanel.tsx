"use client";

import { useState } from "react";
import { ListChecks, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";

/** Same limits the gateway applies when it saves and when it builds the live call prompt. */
export const MAX_QUALIFYING_QUESTIONS = 10;
export const MAX_QUESTION_LENGTH = 200;

type Props = {
  questions: string[];
  onChange: (next: string[]) => void;
};

/** The questions the receptionist asks callers who want a booking, a quote or a visit. The owner adds and removes them here; they are saved with the rest of the agent settings. */
export function QualifyingQuestionsPanel({ questions, onChange }: Props) {
  const t = useTranslations("pages.agent");
  const [draft, setDraft] = useState("");

  const add = () => {
    const text = draft.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_LENGTH);
    if (!text || questions.length >= MAX_QUALIFYING_QUESTIONS || questions.includes(text)) return;
    onChange([...questions, text]);
    setDraft("");
  };

  return (
    <div className="dashboard-panel-padded" id="qualifying-questions">
      <SectionHeader icon={ListChecks} title={t("qualifyingQuestions")} iconVariant="accent" className="mb-2" />
      <p className="text-xs text-foreground-secondary mb-4">{t("qualifyingQuestionsHint", { max: MAX_QUALIFYING_QUESTIONS })}</p>
      <ol className="space-y-1.5 mb-2">
        {questions.map((question, i) => (
          <li key={`${i}-${question}`} className="flex items-center gap-2 p-2 rounded-lg bg-muted border border-border">
            <span className="text-xs text-foreground-tertiary w-4">{i + 1}.</span>
            <span className="text-xs text-foreground-secondary flex-1">{question}</span>
            <button
              type="button"
              onClick={() => onChange(questions.filter((_, j) => j !== i))}
              aria-label={t("removeQuestion", { question })}
              className="text-foreground-tertiary hover:text-red-600"
            >
              <X className="size-3" strokeWidth={ICON_STROKE} />
            </button>
          </li>
        ))}
      </ol>
      {questions.length >= MAX_QUALIFYING_QUESTIONS ? (
        <p className="text-xs text-foreground-secondary">{t("questionsFull", { max: MAX_QUALIFYING_QUESTIONS })}</p>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            maxLength={MAX_QUESTION_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={t("questionPlaceholder")}
            aria-label={t("addQuestion")}
            className="input flex-1"
          />
          <button type="button" onClick={add} aria-label={t("addQuestion")} className="btn-ghost px-3">
            <Plus className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>
      )}
    </div>
  );
}
