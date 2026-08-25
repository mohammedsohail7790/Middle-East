import { redirect } from "@/i18n/navigation";

export default async function CrmCompaniesRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/dashboard/leads", locale });
}
