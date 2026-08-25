import { prisma } from "../prisma";
import { logAudit } from "../audit";
import { fetchUnreadMails, isImapConfigured } from "./imap";
import { parsePortalMail } from "./parse";
import { findBooking, type MatchCandidate } from "./match";
import { addDays, subDays } from "date-fns";

export interface EmailImportStats {
  gelesen: number;
  uebernommen: number;
  unveraendert: number;
  ohneZuordnung: number;
  ignoriert: number;
  fehler: number;
}

/**
 * Liest ungelesene Portal-Mails, ordnet sie Buchungen zu und ergänzt die
 * Angaben, die Smoobu nicht liefert (Gästezahl, Haustiere, Sonderwünsche).
 *
 * Grundsätze:
 *  - Eine von Hand gesetzte Gästezahl wird nie überschrieben.
 *  - Ohne eindeutige Zuordnung wird nichts geändert, sondern protokolliert.
 *  - Jede Mail wird über ihre messageId genau einmal verarbeitet.
 */
export async function runEmailImport(organizationId: string): Promise<EmailImportStats> {
  const stats: EmailImportStats = {
    gelesen: 0, uebernommen: 0, unveraendert: 0, ohneZuordnung: 0, ignoriert: 0, fehler: 0,
  };

  if (!isImapConfigured()) {
    throw new Error("IMAP nicht konfiguriert");
  }

  const mails = await fetchUnreadMails();
  stats.gelesen = mails.length;

  for (const mail of mails) {
    // Bereits verarbeitet? messageId ist eindeutig.
    const seen = await prisma.emailImport.findUnique({ where: { messageId: mail.messageId } });
    if (seen) continue;

    const record = {
      organizationId,
      messageId: mail.messageId,
      subject: mail.subject.slice(0, 300) || null,
      receivedAt: mail.receivedAt,
    };

    try {
      const parsed = parsePortalMail({ from: mail.from, subject: mail.subject, text: mail.text });

      if (!parsed) {
        await prisma.emailImport.create({
          data: { ...record, portal: null, status: "IGNORED", detail: "Keine Portal-Mail" },
        });
        stats.ignoriert++;
        continue;
      }

      if (parsed.guestCount === null && parsed.pets === null && parsed.remarks.length === 0) {
        await prisma.emailImport.create({
          data: { ...record, portal: parsed.portal, status: "NO_DATA", detail: "Mail enthält keine verwertbaren Angaben" },
        });
        stats.ignoriert++;
        continue;
      }

      // Kandidaten eingrenzen: rund um das Anreisedatum, sonst der ganze Zeitraum
      const from = parsed.checkIn ? subDays(parsed.checkIn, 3) : subDays(new Date(), 30);
      const to = parsed.checkIn ? addDays(parsed.checkIn, 3) : addDays(new Date(), 400);

      const candidates: MatchCandidate[] = await prisma.booking.findMany({
        where: {
          organizationId,
          status: "confirmed",
          checkIn: { gte: from, lte: to },
        },
        select: { id: true, guestName: true, checkIn: true, checkOut: true, channelName: true },
      });

      const match = findBooking(parsed, candidates);

      if (!match.booking) {
        await prisma.emailImport.create({
          data: {
            ...record,
            portal: parsed.portal,
            status: match.ambiguous ? "AMBIGUOUS" : "UNMATCHED",
            detail: `${match.reason}${parsed.guestName ? ` · Mail nennt "${parsed.guestName}"` : ""}`,
            parsedGuestCount: parsed.guestCount,
            parsedAdults: parsed.adults,
            parsedChildren: parsed.children,
            parsedPets: parsed.pets,
          },
        });
        stats.ohneZuordnung++;
        continue;
      }

      const booking = await prisma.booking.findUnique({
        where: { id: match.booking.id },
        select: {
          id: true, guestName: true, guestCount: true, guestCountManual: true,
          guestCountSource: true, petCount: true, channelNotice: true,
        },
      });
      if (!booking) throw new Error("Buchung verschwunden");

      const changes: string[] = [];
      const data: Record<string, unknown> = {};

      // Gästezahl — Handeingabe hat Vorrang und bleibt unangetastet
      const manualByHand = booking.guestCountManual && booking.guestCountSource !== "email";
      if (parsed.guestCount !== null && parsed.guestCount > 0) {
        if (manualByHand) {
          changes.push(`Gästezahl ${parsed.guestCount} nicht übernommen (Handeingabe ${booking.guestCount} hat Vorrang)`);
        } else if (parsed.guestCount !== booking.guestCount) {
          data.guestCount = parsed.guestCount;
          data.guestCountManual = true;
          data.guestCountSource = "email";
          changes.push(`Gästezahl ${booking.guestCount} → ${parsed.guestCount}`);
        }
      }

      // Haustiere nur ergänzen, nie überschreiben
      if (parsed.pets !== null && booking.petCount === null) {
        data.petCount = parsed.pets;
        changes.push(`Haustiere: ${parsed.pets}`);
      }

      // Sonderwünsche an die Portal-Notiz anhängen, wenn noch nicht enthalten
      if (parsed.remarks.length > 0) {
        const existing = booking.channelNotice ?? "";
        const neu = parsed.remarks.filter((r) => !existing.includes(r));
        if (neu.length > 0) {
          data.channelNotice = existing ? `${existing}\n${neu.join("\n")}` : neu.join("\n");
          changes.push(`Hinweis: ${neu.join(", ")}`);
        }
      }

      if (Object.keys(data).length === 0) {
        await prisma.emailImport.create({
          data: {
            ...record, portal: parsed.portal, status: "NO_CHANGE",
            detail: changes.length > 0 ? changes.join(" · ") : "Angaben stimmen bereits überein",
            bookingId: booking.id,
            parsedGuestCount: parsed.guestCount, parsedAdults: parsed.adults,
            parsedChildren: parsed.children, parsedPets: parsed.pets,
          },
        });
        stats.unveraendert++;
        continue;
      }

      await prisma.booking.update({ where: { id: booking.id }, data });

      await prisma.emailImport.create({
        data: {
          ...record, portal: parsed.portal, status: "APPLIED",
          detail: `${booking.guestName}: ${changes.join(" · ")}`,
          bookingId: booking.id,
          parsedGuestCount: parsed.guestCount, parsedAdults: parsed.adults,
          parsedChildren: parsed.children, parsedPets: parsed.pets,
        },
      });

      await logAudit({
        organizationId,
        action: "booking.emailImport.applied",
        entityType: "Booking",
        entityId: booking.id,
        details: { portal: parsed.portal, changes },
      });

      stats.uebernommen++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      console.error("[email-import] Fehler bei Mail", mail.messageId, msg);
      await prisma.emailImport.create({
        data: { ...record, status: "ERROR", detail: msg.slice(0, 400) },
      }).catch(() => undefined);
      stats.fehler++;
    }
  }

  return stats;
}
