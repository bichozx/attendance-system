export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Envío de correo. Implementaciones: consola (desarrollo) y SMTP (producción). */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}
