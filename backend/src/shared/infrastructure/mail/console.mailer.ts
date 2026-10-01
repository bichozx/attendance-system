import { Injectable, Logger } from '@nestjs/common';
import { Mailer, MailMessage } from '../../application/mailer';

/** Desarrollo: el correo se imprime en la terminal del backend en vez de enviarse. */
@Injectable()
export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger('Mail');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(
      `\n──────── CORREO (no enviado: MAIL_TRANSPORT=console) ────────\n` +
        `Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n` +
        `──────────────────────────────────────────────────────────────`,
    );
  }
}
