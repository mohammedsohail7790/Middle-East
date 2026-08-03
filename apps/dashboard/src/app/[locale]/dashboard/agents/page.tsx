import { redirect } from "@/i18n/navigation";

export default async function AgentsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/dashboard/agent#per-number-agents", locale });
}
