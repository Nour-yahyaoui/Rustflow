import { z } from "zod";
export const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const password = z.string().min(12).max(256);
export const id = z.uuid();
export const record = (value: unknown) =>
  z.record(z.string(), z.unknown()).parse(value);
