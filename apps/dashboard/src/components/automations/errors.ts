/** An error from the automations API that keeps the HTTP status and the list of plain sentences the gateway sends with a 400. */
export class AutomationsApiError extends Error {
  status: number;
  details: string[];
  constructor(message: string, status: number, details: string[] = []) {
    super(message);
    this.name = "AutomationsApiError";
    this.status = status;
    this.details = details;
  }
}

export function errorStatus(err: unknown): number | null {
  return err instanceof AutomationsApiError ? err.status : null;
}
