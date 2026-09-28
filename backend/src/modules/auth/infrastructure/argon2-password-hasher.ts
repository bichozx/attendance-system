import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { PasswordHasher } from '../domain/ports/password-hasher';

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return hash(plain);
  }

  async verify(passwordHash: string | null, plain: string): Promise<boolean> {
    if (!passwordHash) {
      // Mismo costo que una verificación real, para que no se note si el correo existe.
      this.dummyHash ??= hash('timing-attack-protection');
      await verify(await this.dummyHash, plain).catch(() => false);
      return false;
    }

    try {
      return await verify(passwordHash, plain);
    } catch {
      return false; // Hash corrupto o con formato inválido
    }
  }
}
