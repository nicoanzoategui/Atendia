/**
 * Título de curso legible y consistente (no mayúsculas sostenidas del backend).
 * No altera strings que ya parecen nombres propios mixtos.
 */
export function formatCourseDisplayTitle(name: string): string {
  const t = name.trim();
  if (!t) return t;
  const lower = t.toLocaleLowerCase('es-AR');
  const upper = t.toLocaleUpperCase('es-AR');
  if (t === upper && t.length > 3) {
    return lower
      .split(/(\s+)/)
      .map((part) => {
        if (/^\s+$/.test(part) || part === '') return part;
        return part.charAt(0).toLocaleUpperCase('es-AR') + part.slice(1);
      })
      .join('');
  }
  return t;
}
