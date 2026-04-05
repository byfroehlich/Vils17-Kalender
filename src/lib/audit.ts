import { prisma } from "./prisma";

interface AuditParams {
  organizationId: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details as object ?? undefined,
        ipAddress: params.ipAddress,
      },
    });
  } catch (err) {
    // Audit-Fehler dürfen die Hauptoperation nicht blockieren
    console.error("[Audit] Failed to log:", params.action, err);
  }
}
