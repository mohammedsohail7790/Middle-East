import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Shows the key and the values it was given, so the test can see which text and limits the panel asks for.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
}));

import { MAX_QUALIFYING_QUESTIONS, MAX_QUESTION_LENGTH, QualifyingQuestionsPanel } from "./QualifyingQuestionsPanel";

function Harness({ initial = [] as string[], spy = vi.fn() }) {
  const [questions, setQuestions] = useState(initial);
  return (
    <QualifyingQuestionsPanel
      questions={questions}
      onChange={(next) => {
        spy(next);
        setQuestions(next);
      }}
    />
  );
}

const input = () => screen.getByLabelText("addQuestion", { selector: "input" }) as HTMLInputElement;
const addButton = () => screen.getByRole("button", { name: "addQuestion" });

describe("qualifying questions panel", () => {
  it("adds a question with the button and with Enter, and clears the box", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.change(input(), { target: { value: "  What service   do you need? " } });
    fireEvent.click(addButton());
    expect(spy).toHaveBeenLastCalledWith(["What service do you need?"]);
    expect(input().value).toBe("");
    fireEvent.change(input(), { target: { value: "When would you like to come in?" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(spy).toHaveBeenLastCalledWith(["What service do you need?", "When would you like to come in?"]);
    expect(screen.getByText("When would you like to come in?")).toBeTruthy();
  });

  it("ignores an empty question and a repeat", () => {
    const spy = vi.fn();
    render(<Harness initial={["What service?"]} spy={spy} />);
    fireEvent.change(input(), { target: { value: "   " } });
    fireEvent.click(addButton());
    fireEvent.change(input(), { target: { value: "What service?" } });
    fireEvent.click(addButton());
    expect(spy).not.toHaveBeenCalled();
  });

  it("removes the question that was clicked", () => {
    const spy = vi.fn();
    render(<Harness initial={["One?", "Two?", "Three?"]} spy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: /removeQuestion.*Two\?/ }));
    expect(spy).toHaveBeenLastCalledWith(["One?", "Three?"]);
    expect(screen.queryByText("Two?")).toBeNull();
  });

  it("keeps a question within the length limit", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    expect(input().maxLength).toBe(MAX_QUESTION_LENGTH);
    fireEvent.change(input(), { target: { value: "x".repeat(MAX_QUESTION_LENGTH + 50) } });
    fireEvent.click(addButton());
    expect((spy.mock.calls[0][0] as string[])[0]).toHaveLength(MAX_QUESTION_LENGTH);
  });

  it("stops at the limit and shows that it is full instead of the box", () => {
    const full = Array.from({ length: MAX_QUALIFYING_QUESTIONS }, (_, i) => `Question ${i + 1}?`);
    render(<Harness initial={full} />);
    expect(screen.queryByLabelText("addQuestion")).toBeNull();
    expect(screen.getByText(/questionsFull/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /removeQuestion.*Question 10\?/ }));
    expect(input()).toBeTruthy();
  });
});
