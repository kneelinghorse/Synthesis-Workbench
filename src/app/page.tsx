import { redirect } from "next/navigation";

// Workbench is the review-and-iterate workspace for headless Forge — drop
// straight into it rather than a marketing splash.
export default function Home() {
  redirect("/chat");
}
