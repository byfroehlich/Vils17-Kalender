import { NextRequest } from "next/server";
import { unsubscribeRegularGuest } from "@/lib/regular-guests";

// ─── Abmelden von der Stammgast-Liste (Link in Mails/Nachrichten) ─────────────

export const dynamic = "force-dynamic";

function page(title: string, text: string, status: number) {
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title} – No. 17 Vils</title>
<style>body{margin:0;background:#1E302A;color:#F4F8F5;font:400 1.0625rem/1.6 "Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px 16px;box-sizing:border-box}
main{max-width:520px}h1{font:300 clamp(1.8rem,5vw,2.6rem)/1.15 "Fraunces",Georgia,serif;margin:0 0 .8rem}p{color:#DCE8DF;margin:.6rem 0}a{color:#8EC0A3}</style></head>
<body><main><h1>${title}</h1>${text}<p><a href="https://vils17.at/">← No. 17 Vils</a></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ok = token ? await unsubscribeRegularGuest(token) : false;
  if (!ok) {
    return page(
      "Link nicht gefunden",
      `<p>Dieser Abmelde-Link ist leider ungültig. Schreiben Sie uns einfach eine kurze Nachricht an <a href="mailto:info@vils17.at">info@vils17.at</a>, dann tragen wir Sie von Hand aus.</p>`,
      404
    );
  }
  return page(
    "Sie sind abgemeldet",
    `<p>Sie bekommen von uns keine Angebote mehr. Danke, dass Sie bei uns zu Gast waren – Sie sind in Vils jederzeit herzlich willkommen.</p>`,
    200
  );
}
