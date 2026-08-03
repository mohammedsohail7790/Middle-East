import { redirect } from "@/i18n/navigation";

/** Compliance Center config now lives directly on the main Compliance page. */
export default async function ComplianceCenterRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/dashboard/compliance", locale });
}
