import * as Diff from 'diff';

export interface DiffLine {
  type: 'normal' | 'add' | 'remove';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function computeDiff(oldContent: string | undefined, newContent: string): DiffLine[] {
  // If no old content (new file), just return all as additions
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

  changes.forEach(part => {
    // Remove trailing newline which diffLines sometimes leaves or counting issues
    const partLines = part.value.split('\n');
    if (partLines[partLines.length - 1] === '') {
        partLines.pop();
    }

    partLines.forEach(line => {
      if (part.added) {
        lines.push({
          type: 'add',
          content: line,
          newLineNumber: currentNewLine++
        });
      } else if (part.removed) {
        lines.push({
          type: 'remove',
          content: line,
          oldLineNumber: currentOldLine++
        });
      } else {
        lines.push({
          type: 'normal',
          content: line,
          oldLineNumber: currentOldLine++,
          newLineNumber: currentNewLine++
        });
      }
    });
  });

  return lines;
}
