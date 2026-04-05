import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Organization anlegen
  const org = await prisma.organization.upsert({
    where: { slug: "vils17" },
    update: {},
    create: {
      name: "Vils17 Ferienwohnungen",
      slug: "vils17",
    },
  });
  console.log("Organization:", org.name);

  // Admin-Benutzer anlegen
  const adminPassword = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email_organizationId: { email: "admin@vils17.de", organizationId: org.id } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Admin",
      email: "admin@vils17.de",
      passwordHash: adminPassword,
      role: Role.ADMIN,
      language: "de",
    },
  });
  console.log("Admin:", admin.email);

  // Zwei Wohnungen anlegen
  const apt1 = await prisma.apartment.upsert({
    where: { smoobuId_organizationId: { smoobuId: 0, organizationId: org.id } },
    update: { smoobuId: null },
    create: {
      organizationId: org.id,
      name: "Wohnung 1",
      description: "Erdgeschoss, 2 Schlafzimmer",
      color: "#3b82f6",
      smoobuId: null,
    },
  });

  const apt2 = await prisma.apartment.upsert({
    where: {
      id: "seed-apt2",
    },
    update: {},
    create: {
      id: "seed-apt2",
      organizationId: org.id,
      name: "Wohnung 2",
      description: "Obergeschoss, 3 Schlafzimmer",
      color: "#8b5cf6",
      smoobuId: null,
    },
  });
  console.log("Apartments:", apt1.name, apt2.name);

  console.log("\n✅ Seed abgeschlossen!");
  console.log("\nLogin-Daten:");
  console.log("  E-Mail: admin@vils17.de");
  console.log("  Passwort: admin123");
  console.log("\n⚠️  Bitte Passwort nach dem ersten Login ändern!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
