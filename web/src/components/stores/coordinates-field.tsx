'use client';

import { useState } from 'react';

import { Field, Input } from '@/components/ui';
import { parseCoordinates } from '@/lib/geo';

/**
 * Latitud y longitud en un solo campo: acepta lo que se copia de Google Maps
 * (clic derecho sobre el lugar → copiar coordenadas).
 */
export function CoordinatesField({
  label = 'Coordenadas',
  value,
  onChange,
  required,
}: {
  label?: string;
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number } | null) => void;
  required?: boolean;
}) {
  const [text, setText] = useState(value ? `${value.lat}, ${value.lng}` : '');
  const invalid = text.trim() !== '' && !parseCoordinates(text);
  return (
    <Field
      label={label}
      error={invalid ? 'Escríbelas como 4.6097, -74.0817' : undefined}
      hint="En Google Maps: clic derecho sobre el lugar y copia las coordenadas.">
      <Input
        required={required}
        inputMode="decimal"
        placeholder="4.6097, -74.0817"
        aria-invalid={invalid}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseCoordinates(e.target.value));
        }}
      />
    </Field>
  );
}
