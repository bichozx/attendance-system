export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  token: string;
  ok: boolean;
  /** Id del ticket para consultar el recibo después. */
  ticketId?: string;
  /** El dispositivo ya no existe (app desinstalada, permiso revocado): borrar el token. */
  unregistered: boolean;
  error?: string;
}

export interface ReceiptCheck {
  /** Tickets ya resueltos (se pueden borrar). */
  processed: string[];
  /** Tokens que el proveedor reportó como inexistentes. */
  unregisteredTokens: string[];
}

/**
 * Envío de notificaciones push. Implementaciones: consola (desarrollo) y Expo Push Service
 * (producción: entrega por FCM en Android y APNs en iOS con un solo token).
 * Un error de red o del proveedor se LANZA para que el despachador reintente.
 */
export abstract class PushSender {
  abstract send(tokens: string[], message: PushMessage): Promise<PushResult[]>;
  abstract checkReceipts(
    tickets: { id: string; token: string }[],
  ): Promise<ReceiptCheck>;
}
