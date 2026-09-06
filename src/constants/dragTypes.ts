/**
 * Custom MIME type used to tag tab-reorder drags.
 *
 * File-drop handling must ignore any drag carrying this type, otherwise dragging
 * a tab across the window raises the file-drop overlay.
 */
export const TAB_DRAG_TYPE = 'application/x-devxray-tab';

export function isTabDrag(event: Pick<DragEvent, 'dataTransfer'>): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes(TAB_DRAG_TYPE);
}

export function isFileDrag(event: Pick<DragEvent, 'dataTransfer'>): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}
