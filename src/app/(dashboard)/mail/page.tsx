import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { mailboxConfig } from "@/lib/mailbox/config";
import { MailApp } from "@/components/mail/MailApp";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");
  const cfg = mailboxConfig();
  return <MailApp address={cfg?.address ?? null} canSend={Boolean(cfg?.smtp)} />;
}
