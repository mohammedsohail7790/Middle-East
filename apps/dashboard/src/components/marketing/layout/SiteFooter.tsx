import Link from "next/link";

type FooterLink = { label: string; href: string };
type FooterColumn = { heading: string; links: FooterLink[] };

const CONSULTANCY_COLUMNS: FooterColumn[] = [
  {
    heading: "Services",
    links: [
      { label: "Operations Automation", href: "/services/operations" },
      { label: "Client Acquisition & Growth", href: "/services/acquisition" },
      { label: "AI-Powered Brand & Social", href: "/services/brand" },
    ],
  },
  {
    heading: "Why Halla",
    links: [
      { label: "Our AI Receptionist", href: "/design-preview/receptionist" },
    ],
  },
  {
    heading: "Get Started",
    links: [{ label: "Book a Diagnostic Call", href: "/consult-signup" }],
  },
];

const RECEPTIONIST_COLUMNS: FooterColumn[] = [
  {
    heading: "Solutions",
    links: [
      { label: "Plans & Pricing", href: "/pricing" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "ROI Calculator", href: "/roi" },
      { label: "Blog", href: "/blog" },
    ],
  },
];

const COMPANY_COLUMN: FooterColumn = {
  heading: "Company",
  links: [
    { label: "About Us", href: "/about" },
    { label: "Security", href: "/security" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Use", href: "/terms" },
  ],
};

export function SiteFooter({ brand }: { brand: "consultancy" | "receptionist" }) {
  const brandColumns = brand === "consultancy" ? CONSULTANCY_COLUMNS : RECEPTIONIST_COLUMNS;
  const columns = [...brandColumns, COMPANY_COLUMN];

  return (
    <footer className="border-t border-border bg-background px-6 py-16 text-foreground sm:px-10">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 sm:grid-cols-4">
        {columns.map((column) => (
          <div key={column.heading} className="flex flex-col gap-3">
            <h5 className="text-sm font-semibold text-foreground">{column.heading}</h5>
            {column.links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-foreground-secondary hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
