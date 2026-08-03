import { redirect } from "next/navigation";

/** Compliance Center config now lives directly on the main Compliance page. */
export default function ComplianceCenterRedirectPage() {
  redirect("/dashboard/compliance");
}
