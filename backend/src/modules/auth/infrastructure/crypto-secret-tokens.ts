import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { SecretTokens } from '../domain/ports/secret-tokens';

/** 256 bits aleatorios en base64url; en la base solo queda el SHA-256. */
@Injectable()
export class CryptoSecretTokens extends SecretTokens {
  generate() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
