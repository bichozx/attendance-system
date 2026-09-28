import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Marca un endpoint como accesible sin access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
