import * as Diff from 'diff';

export interface DiffLine {
  type: 'normal' | 'add' | 'remove';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  diffParts?: Diff.Change[]; // Word-level diff parts
}

export function computeDiff(oldContent: string | undefined, newContent: string): DiffLine[] {
  if (oldContent === undefined) {
    return newContent.split('\n').map((line, i) => ({
      type: 'add',
      content: line,
      newLineNumber: i + 1
    }));
  }

  const changes = Diff.diffLines(oldContent, newContent);
  const lines: DiffLine[] = [];
  
  let currentOldLine = 1;
  let currentNewLine = 1;

  // Temporary buffer to detect add/remove pairs for word diffing
  let lastRemoveLine: { index: number, line: DiffLine } | null = null;

  changes.forEach(part => {
    // Handle newline consistency
    let value = part.value;
    if (value.endsWith('\n') && part.count && part.count > 0) {
        // diffLines keeps the newline on the line, we usually split it off
    }
    
    const partLines = value.split('\n');
    if (partLines[partLines.length - 1] === '') {
        partLines.pop();
    }

    partLines.forEach(line => {
      if (part.added) {
        const newLine: DiffLine = {
          type: 'add',
          content: line,
          newLineNumber: currentNewLine++
        };
        
        // Check for intra-line diff opportunity
        if (lastRemoveLine && (lines.length === lastRemoveLine.index + 1)) {
           // We have a remove followed immediately by this add
           // Compute word diff
           const words = Diff.diffWords(lastRemoveLine.line.content, line);
           
           // Heuristic: If it looks like a complete rewrite (>80% changed), don't show word diff
           // For now, just show it, it's usually helpful.
           lastRemoveLine.line.diffParts = words; // Apply to the removal
           newLine.diffParts = words;             // Apply to the addition
           
           lastRemoveLine = null; // Reset
        } else {
           lastRemoveLine = null;
        }
        
        lines.push(newLine);

      } else if (part.removed) {
        const removeLine: DiffLine = {
          type: 'remove',
          content: line,
          oldLineNumber: currentOldLine++
        };
        lines.push(removeLine);
        lastRemoveLine = { index: lines.length - 1, line: removeLine };
      } else {
        lines.push({
          type: 'normal',
          content: line,
          oldLineNumber: currentOldLine++,
          newLineNumber: currentNewLine++
        });
        lastRemoveLine = null;
      }
    });
  });

  return lines;
}