import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mailer } from '../../application/mailer';
import { ConsoleMailer } from './console.mailer';
import { SmtpMailer } from './smtp.mailer';

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('MAIL_TRANSPORT') === 'smtp'
          ? new SmtpMailer(config)
          : new ConsoleMailer(),
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
