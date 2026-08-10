import Link from "next/link";
import Image from "next/image";
import { INDUSTRIES_LIST } from "@/lib/marketing-pages";

export function MarketingFooter() {
  return (
    <footer>
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-logo">
              <Link href="/" className="footer-wordmark">
                <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-lg object-contain" />
                Call<span>IQ</span>
              </Link>
            </div>
            <p>
              Pure AI receptionist for service businesses. Never miss a call. Smart • Seamless • Always.
            </p>
            <Link href="/signup" className="btn btn-blue btn-sm">
              Start free trial
            </Link>
          </div>

          <div className="footer-col">
            <h5>Solutions</h5>
            <Link href="/pricing" className="flink">
              Plans & Pricing
            </Link>
            <Link href="/how-it-works" className="flink">
              How It Works
            </Link>
            <Link href="/features" className="flink">
              What We Do
            </Link>
            <Link href="/ai-vs-human" className="flink">
              AI vs. Live Agents
            </Link>
            <Link href="/faq" className="flink">
              FAQ
            </Link>
          </div>

          <div className="footer-col">
            <h5>Features</h5>
            <Link href="/solutions/answering" className="flink">
              Answering Service
            </Link>
            <Link href="/solutions/scheduling" className="flink">
              Scheduling
            </Link>
            <Link href="/solutions/messages" className="flink">
              Message Taking
            </Link>
            <Link href="/solutions/leads" className="flink">
              Lead Capture
            </Link>
            <Link href="/solutions/routing" className="flink">
              Call Routing
            </Link>
            <Link href="/solutions/multilingual" className="flink">
              Multi-Lingual
            </Link>
            <Link href="/solutions/afterhours" className="flink">
              After Hours
            </Link>
            <Link href="/solutions/screening" className="flink">
              Call Screening
            </Link>
          </div>

          <div className="footer-col">
            <h5>Industries</h5>
            {INDUSTRIES_LIST.map((ind) => (
              <Link key={ind.slug} href={`/industries/${ind.slug}`} className="flink">
                {ind.title}
              </Link>
            ))}
          </div>

          <div className="footer-col">
            <h5>Resources</h5>
            <Link href="/roi" className="flink">
              ROI Calculator
            </Link>
            <Link href="/blog" className="flink">
              Blog
            </Link>
            <Link href="/forwarding" className="flink">
              Call Forwarding
            </Link>
            <Link href="/docs" className="flink">
              Help Center
            </Link>
            <Link href="/support" className="flink">
              Support
            </Link>
          </div>

          <div className="footer-col">
            <h5>Company</h5>
            <Link href="/about" className="flink">
              About Us
            </Link>
            <Link href="/security" className="flink">
              Security
            </Link>
            <Link href="/privacy" className="flink">
              Privacy Policy
            </Link>
            <Link href="/terms" className="flink">
              Terms of Use
            </Link>
            <Link href="/login" className="flink">
              Sign In
            </Link>
            <Link href="/support" className="flink">
              Contact Us
            </Link>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-legal">© {new Date().getFullYear()} Halla AI Labs. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}
