import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushSender } from '../../application/push-sender';
import { ConsolePushSender } from './console.push-sender';
import { ExpoPushSender } from './expo.push-sender';

@Global()
@Module({
  providers: [
    {
      provide: PushSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('PUSH_PROVIDER') === 'expo'
          ? new ExpoPushSender(config)
          : new ConsolePushSender(),
    },
  ],
  exports: [PushSender],
})
export class PushModule {}
