#!/bin/sh
# Start auf Render: Migrationen, dann App.
# 01.11.2026: Die Migration 20261031170000_chat_done war am 31.10. gescheitert (falscher Tabellenname) und hat
# seitdem jedes Deploy blockiert (Prisma P3009). Ein gescheiterter Eintrag wird als zurückgerollt markiert, damit
# die korrigierte Fassung neu läuft. Ist er nicht (mehr) gescheitert, meldet Prisma einen Fehler — der wird ignoriert.
set -e
npx prisma migrate resolve --rolled-back 20261031170000_chat_done >/dev/null 2>&1 || true
npx prisma migrate deploy
exec npm start
