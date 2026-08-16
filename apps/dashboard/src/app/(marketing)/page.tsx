import { redirect } from "next/navigation";

// Marketing site is served separately.
// Root path redirects to login until the new site is connected.
export default function HomePage() {
  redirect("/login");
}
