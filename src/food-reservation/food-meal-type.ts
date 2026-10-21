export const foodMealTypes = ['LUNCH', 'DINNER'] as const;

export type FoodMealTypeValue = (typeof foodMealTypes)[number];

export function resolveFoodMealType(value?: string | null): FoodMealTypeValue {
  return value === 'DINNER' ? 'DINNER' : 'LUNCH';
}

export function foodMealTypeLabel(value?: string | null) {
  return resolveFoodMealType(value) === 'DINNER' ? 'شام' : 'ناهار';
}
