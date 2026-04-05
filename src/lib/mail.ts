import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface CleaningAssignmentMailParams {
  to: string;
  cleanerName: string;
  apartmentName: string;
  checkOut: Date;
  checkIn: Date;
  guestCount: number;
  notes?: string | null;
  language?: string;
}

export async function sendCleaningAssignmentMail(
  params: CleaningAssignmentMailParams
) {
  const isDE = (params.language ?? "de") === "de";

  const checkOutStr = params.checkOut.toLocaleDateString(isDE ? "de-DE" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const checkInStr = params.checkIn.toLocaleDateString(isDE ? "de-DE" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = isDE
    ? `Reinigungsauftrag – ${params.apartmentName} – ${checkOutStr}`
    : `Cleaning Job – ${params.apartmentName} – ${checkOutStr}`;

  const body = isDE
    ? `
Hallo ${params.cleanerName},

Sie haben einen neuen Reinigungsauftrag erhalten:

🏠 Wohnung: ${params.apartmentName}
📅 Reinigung am: ${checkOutStr} (nach Abreise)
📅 Nächste Anreise: ${checkInStr}
👥 Anzahl Gäste: ${params.guestCount}
${params.notes ? `\n📝 Hinweise:\n${params.notes}` : ""}

Bitte loggen Sie sich in die App ein um den Auftrag als erledigt zu markieren:
${process.env.NEXT_PUBLIC_APP_URL}/my-jobs

Bei Fragen melden Sie sich bitte beim Eigentümer.

Vielen Dank!
Vils17 Ferienwohnungen
    `.trim()
    : `
Hello ${params.cleanerName},

You have a new cleaning job:

🏠 Apartment: ${params.apartmentName}
📅 Cleaning on: ${checkOutStr} (after check-out)
📅 Next check-in: ${checkInStr}
👥 Number of guests: ${params.guestCount}
${params.notes ? `\n📝 Notes:\n${params.notes}` : ""}

Please log in to the app to mark the job as done:
${process.env.NEXT_PUBLIC_APP_URL}/my-jobs

Contact the owner if you have any questions.

Thank you!
Vils17 Holiday Apartments
    `.trim();

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: params.to,
    subject,
    text: body,
  });
}
