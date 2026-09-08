export function joinFullName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: fullName.trim(), lastName: fullName.trim() };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function cleanPlates(plates?: string[]) {
  if (!plates) {
    return undefined;
  }
  return [...new Set(plates.map((item) => item.trim()).filter(Boolean))];
}
