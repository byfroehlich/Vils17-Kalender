interface WhatsAppCleaningParams {
  to: string; // Telefonnummer mit Ländervorwahl, z.B. "+4912345678"
  cleanerName: string;
  apartmentName: string;
  checkOut: Date;
  guestCount: number;
  language?: string;
}

export async function sendCleaningWhatsApp(params: WhatsAppCleaningParams) {
  if (process.env.TWILIO_ENABLED !== "true") return;

  const isDE = (params.language ?? "de") === "de";
  const dateStr = params.checkOut.toLocaleDateString(isDE ? "de-DE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const message = isDE
    ? `🏠 Neuer Reinigungsauftrag!\n${params.apartmentName}\n📅 ${dateStr}\n👥 ${params.guestCount} Gäste\nDetails: ${process.env.NEXT_PUBLIC_APP_URL}/my-jobs`
    : `🏠 New cleaning job!\n${params.apartmentName}\n📅 ${dateStr}\n👥 ${params.guestCount} guests\nDetails: ${process.env.NEXT_PUBLIC_APP_URL}/my-jobs`;

  const { Twilio } = await import("twilio");
  const client = new Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM!,
    to: `whatsapp:${params.to}`,
    body: message,
  });
}
