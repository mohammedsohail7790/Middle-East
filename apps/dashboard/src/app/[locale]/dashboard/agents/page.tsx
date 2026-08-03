import { redirect } from "next/navigation";

export default function AgentsRedirectPage() {
  redirect("/dashboard/agent#per-number-agents");
}
