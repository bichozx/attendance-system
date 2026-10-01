import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { Mailer, MailMessage } from '../../application/mailer';

/**
 * Producción. SMTP_URL con el formato smtps://usuario:clave@smtp.proveedor.com:465
 * (sirve con Amazon SES, SendGrid, Mailgun, Brevo, Google Workspace...).
 */
@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    this.transporter = createTransport(config.getOrThrow<string>('SMTP_URL'));
    this.from = config.getOrThrow<string>('MAIL_FROM');
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
