type ClassValue = string | false | null | undefined;

/** Joins conditional class names. Deliberately dependency-free. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
