export type PearlVisualRef = {
  collection: string;
  item: string | number;
  fields?: string | string[];
  mode?: 'drawer' | 'modal' | 'popover';
};

export function pearlVisualAttr(ref: PearlVisualRef | null | undefined): string | undefined {
  if (!ref) return undefined;
  const fields = Array.isArray(ref.fields) ? ref.fields.join(',') : ref.fields;
  return [
    `collection:${ref.collection}`,
    `item:${ref.item}`,
    fields ? `fields:${fields}` : null,
    `mode:${ref.mode ?? 'drawer'}`,
  ].filter(Boolean).join(';');
}
