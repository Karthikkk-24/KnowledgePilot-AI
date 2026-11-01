import { chunkFixedSize, type TextChunk } from './fixed-size';
import { chunkStructureAware } from './structure-aware';

export type ParentChildChunk = TextChunk & {
  /** Present on child chunks; parent rows omit this and act as the parent body. */
  isParent?: boolean;
  parentOrdinal?: number;
};

/**
 * Pre-materialized parent-child chunking:
 * - Parent = structure-aware section (or whole doc slice)
 * - Children = fixed-size slices of each parent
 * Callers persist parents first, then children with parentChunkId.
 */
export function chunkParentChild(
  text: string,
  options: { parentSize: number; childSize: number; childOverlap: number },
): { parents: ParentChildChunk[]; children: ParentChildChunk[] } {
  const parents = chunkStructureAware(text, {
    chunkSize: options.parentSize,
    overlap: Math.min(80, Math.floor(options.parentSize / 10)),
  }).map((p) => ({ ...p, isParent: true as const }));

  const children: ParentChildChunk[] = [];
  parents.forEach((parent, parentOrdinal) => {
    const kids = chunkFixedSize(parent.content, {
      chunkSize: options.childSize,
      overlap: options.childOverlap,
      headingPath: parent.headingPath,
    });
    for (const kid of kids) {
      children.push({
        ...kid,
        isParent: false,
        parentOrdinal,
        // Offset child spans relative to parent start within the original text is approximate;
        // ingestion stores ordinals and parent links, not absolute parent offsets.
        charStart: parent.charStart + kid.charStart,
        charEnd: parent.charStart + kid.charEnd,
      });
    }
  });

  return { parents, children };
}
