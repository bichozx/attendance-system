/** Mismas reglas que el servidor: 8-128 caracteres, al menos una letra y un número. */
export function passwordProblem(password: string, confirmation?: string): string | null {
  if (password.length < 8) return 'Debe tener al menos 8 caracteres.';
  if (password.length > 128) return 'Debe tener máximo 128 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Debe tener al menos una letra y un número.';
  if (confirmation !== undefined && confirmation !== password) return 'Las contraseñas no coinciden.';
  return null;
}

/** Mensaje para los errores de cuenta (login, contraseña, recuperación). */
export function accountError(code: string, message: string, details?: Record<string, unknown>): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Correo o contraseña incorrectos.';
    case 'ACCOUNT_LOCKED': {
      const minutes = Math.max(1, Math.ceil(Number(details?.retryAfterSeconds ?? 60) / 60));
      return `La cuenta está bloqueada por intentos fallidos. Intenta en ${minutes} min o restablece la contraseña.`;
    }
    case 'TOO_MANY_REQUESTS':
      return 'Demasiados intentos. Espera un minuto.';
    case 'NO_ACTIVE_COMPANY':
    case 'USER_NOT_ACTIVE':
      return 'Esta cuenta no tiene acceso activo. Habla con el administrador.';
    case 'INVALID_CURRENT_PASSWORD':
      return 'La contraseña actual no es correcta.';
    case 'PASSWORD_UNCHANGED':
      return 'La nueva contraseña debe ser diferente de la actual.';
    case 'INVALID_RESET_TOKEN':
      return 'El enlace no es válido o ya venció. Solicita uno nuevo.';
    default:
      return message;
  }
}
