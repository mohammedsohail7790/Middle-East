import "@/styles/calliq-marketing.css";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { TawkChatWidget } from "@/components/marketing/TawkChatWidget";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="calliq-marketing">
      <MarketingNav />
      {children}
      <MarketingFooter />
      <TawkChatWidget />
    </div>
  );
}
