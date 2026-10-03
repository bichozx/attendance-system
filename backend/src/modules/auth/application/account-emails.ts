import { Injectable, Logger } from '@nestjs/common';
import { Mailer, MailMessage } from '../../../shared/application/mailer';
import { AuthSettings } from './auth.settings';

interface Recipient {
  email: string;
  firstName: string;
}

/**
 * Correos de seguridad de la cuenta. Se envían en segundo plano:
 * - la respuesta HTTP no espera al servidor de correo,
 * - y el tiempo de respuesta no delata si la cuenta existe.
 */
@Injectable()
export class AccountEmails {
  private readonly logger = new Logger(AccountEmails.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly settings: AuthSettings,
  ) {}

  passwordReset(to: Recipient, token: string) {
    const minutes = this.settings.security.resetTokenTtlMinutes;
    this.dispatch({
      to: to.email,
      subject: 'Restablece tu contraseña',
      text:
        `Hola ${to.firstName},\n\n` +
        `Recibimos una solicitud para restablecer tu contraseña. Abre este enlace ` +
        `(válido por ${minutes} minutos, un solo uso):\n\n${this.settings.resetLink(token)}\n\n` +
        'Si no fuiste tú, ignora este correo: tu contraseña no cambiará.',
    });
  }

  passwordChanged(to: Recipient) {
    this.dispatch({
      to: to.email,
      subject: 'Tu contraseña fue cambiada',
      text:
        `Hola ${to.firstName},\n\n` +
        'La contraseña de tu cuenta acaba de cambiar y se cerraron tus otras sesiones.\n\n' +
        'Si no fuiste tú, restablece tu contraseña de inmediato y avisa a tu administrador.',
    });
  }

  accountLocked(to: Recipient) {
    const { maxFailedLogins, lockMinutes } = this.settings.security;
    this.dispatch({
      to: to.email,
      subject: 'Bloqueamos temporalmente tu cuenta',
      text:
        `Hola ${to.firstName},\n\n` +
        `Hubo ${maxFailedLogins} intentos fallidos de iniciar sesión en tu cuenta, así que la ` +
        `bloqueamos por ${lockMinutes} minutos.\n\n` +
        'Si no fuiste tú, te recomendamos restablecer tu contraseña.',
    });
  }

  /** Cuenta nueva: la persona crea su propia contraseña (nadie más la conoce). */
  invitation(
    to: Recipient,
    token: string,
    companyName: string,
    roleName = 'administrador',
  ) {
    const hours = this.settings.security.inviteTokenTtlHours;
    this.dispatch({
      to: to.email,
      subject: `Te damos la bienvenida a ${companyName}`,
      text:
        `Hola ${to.firstName},\n\n` +
        `Se creó tu cuenta en ${companyName} (${roleName}) en el sistema de control de ` +
        `asistencia. Para activarla, crea tu contraseña con este enlace (válido por ${hours} horas, ` +
        `un solo uso):\n\n${this.settings.resetLink(token)}\n\n` +
        'Si no esperabas este correo, ignóralo.',
    });
  }

  /** Cuenta existente: solo se avisa del nuevo acceso. */
  addedToCompany(to: Recipient, companyName: string, roleName: string) {
    this.dispatch({
      to: to.email,
      subject: `Ahora tienes acceso a ${companyName}`,
      text:
        `Hola ${to.firstName},\n\n` +
        `Se te dio acceso a ${companyName} con el rol ${roleName}. Entra con tu correo y tu ` +
        'contraseña de siempre; al iniciar sesión podrás elegir la empresa.',
    });
  }

  private dispatch(message: MailMessage) {
    void this.mailer
      .send(message)
      .catch((error: unknown) =>
        this.logger.error(
          `No se pudo enviar "${message.subject}"`,
          error as Error,
        ),
      );
  }
}
