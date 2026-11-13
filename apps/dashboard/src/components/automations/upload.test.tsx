import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("next-intl", async () => (await import("./test-intl")).intlMock);
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock("./client", () => ({ automationsApi: { uploadDocument: h.upload } }));

import { DocumentUpload } from "./DocumentUpload";
import { AutomationsApiError } from "./errors";

const input = () => screen.getByTestId("document-file-input");
const pick = (file: File) => fireEvent.change(input(), { target: { files: [file] } });

beforeEach(() => vi.clearAllMocks());

describe("document upload", () => {
  it("refuses a wrong type without calling the server", async () => {
    render(<DocumentUpload />);
    pick(new File(["x"], "virus.exe", { type: "application/x-msdownload" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/not supported/);
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("refuses a file over 8 MB", async () => {
    render(<DocumentUpload />);
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 8 * 1024 * 1024 + 1 });
    pick(big);
    expect((await screen.findByRole("alert")).textContent).toMatch(/larger than 8 MB/);
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("sends a good file and links to What happened", async () => {
    h.upload.mockResolvedValue({ ref: "r1" });
    render(<DocumentUpload />);
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    pick(file);
    expect(await screen.findByText(/Received\. You will see the result under What happened\./)).toBeTruthy();
    expect(h.upload).toHaveBeenCalledWith(file, "document-intake");
    expect(screen.getByRole("link", { name: "Open What happened" })).toHaveAttribute("href", "/dashboard/automations/activity");
  });

  it("accepts a dropped file", async () => {
    h.upload.mockResolvedValue({ ref: "r1" });
    render(<DocumentUpload />);
    const file = new File(["%PDF"], "a.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByLabelText("Upload a document"), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(h.upload).toHaveBeenCalledWith(file, "document-intake"));
  });

  it("shows the server's message when it refuses, and a calm one when it is down", async () => {
    h.upload.mockRejectedValueOnce(new AutomationsApiError("This file looks damaged", 400));
    render(<DocumentUpload />);
    pick(new File(["x"], "a.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("This file looks damaged")).toBeTruthy();
    h.upload.mockRejectedValueOnce(new AutomationsApiError("network", 0));
    pick(new File(["x"], "b.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("The document could not be sent.")).toBeTruthy();
  });
});
