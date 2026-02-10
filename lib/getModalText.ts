// src/lib/getModalText.ts
export function getModalTextValue(
  interaction: any,
  preferredIds: string[],
): string {
  // Discord raw interaction format:
  // interaction.data.components = [{ components: [{ custom_id, value }] }]
  const rows = interaction?.data?.components ?? [];
  const allInputs: Array<{ id: string; value: string }> = [];

  for (const row of rows) {
    for (const comp of row?.components ?? []) {
      if (comp?.custom_id) {
        allInputs.push({ id: String(comp.custom_id), value: String(comp.value ?? "") });
      }
    }
  }

  // Try preferred ids first
  for (const id of preferredIds) {
    const hit = allInputs.find((x) => x.id === id);
    if (hit) return hit.value;
  }

  // Fallback: if there is exactly one text input, use it
  if (allInputs.length === 1) return allInputs[0].value;

  // If nothing obvious, return empty (caller will error with helpful log)
  return "";
}