import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  IssuedRefreshToken,
  ParsedRefreshToken,
  RefreshTokenCodec,
} from '../domain/ports/refresh-token.codec';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_BYTES = 32;
const SECRET_LENGTH = 43; // 32 bytes en base64url

/**
 * Formato: `<sessionId>.<secreto aleatorio>`.
 * El secreto tiene 256 bits de entropía, así que basta SHA-256 para guardarlo (no hace falta Argon2).
 */
@Injectable()
export class CryptoRefreshTokenCodec extends RefreshTokenCodec {
  issue(sessionId: string = randomUUID()): IssuedRefreshToken {
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    return { sessionId, token: `${sessionId}.${secret}`, hash: sha256(secret) };
  }

  parse(token: string): ParsedRefreshToken | null {
    const separator = token.indexOf('.');
    if (separator < 0) return null;

    const sessionId = token.slice(0, separator);
    const secret = token.slice(separator + 1);
    if (!UUID_PATTERN.test(sessionId) || secret.length !== SECRET_LENGTH) {
      return null;
    }

    return { sessionId, hash: sha256(secret) };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
