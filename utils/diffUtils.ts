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

  for (let i = 0; i < changes.length; i++) {
    const part = changes[i];
    
    // Split into lines. 
    // diffLines typically includes newline at end of value.
    // e.g. "foo\nbar\n" -> split("\n") -> ["foo", "bar", ""]
    const partLines = part.value.split('\n');
    if (partLines.length > 0 && partLines[partLines.length - 1] === '') {
        partLines.pop();
    }

    if (part.added) {
        // If we hit an Added block, it means we didn't process it in the look-ahead of a previous Removed block.
        // So just render as pure additions.
        partLines.forEach(line => {
             lines.push({
                type: 'add',
                content: line,
                newLineNumber: currentNewLine++
             });
        });

    } else if (part.removed) {
        // Look ahead for an immediately following Added block
        const nextPart = changes[i+1];
        
        if (nextPart && nextPart.added) {
            // Found a modification block (Remove X, Add Y)
            const nextPartLines = nextPart.value.split('\n');
            if (nextPartLines.length > 0 && nextPartLines[nextPartLines.length - 1] === '') {
                nextPartLines.pop();
            }

            // We attempt to match lines 1-to-1 up to the length of the shorter block
            const commonLength = Math.min(partLines.length, nextPartLines.length);

            // Process Removals
            partLines.forEach((line, idx) => {
                const diffLine: DiffLine = {
                    type: 'remove',
                    content: line,
                    oldLineNumber: currentOldLine++
                };
                
                // If we have a counterpart in the Added block, compute word diff
                if (idx < commonLength) {
                    const correspondingAddLine = nextPartLines[idx];
                    // Diff words between old line and new line
                    const words = Diff.diffWords(line, correspondingAddLine);
                    diffLine.diffParts = words;
                }
                
                lines.push(diffLine);
            });

            // Process Additions
            nextPartLines.forEach((line, idx) => {
                 const diffLine: DiffLine = {
                    type: 'add',
                    content: line,
                    newLineNumber: currentNewLine++
                 };
                 
                 if (idx < commonLength) {
                     const correspondingRemoveLine = partLines[idx];
                     const words = Diff.diffWords(correspondingRemoveLine, line);
                     diffLine.diffParts = words;
                 }
                 
                 lines.push(diffLine);
            });

            // Advance outer loop index since we processed the next block
            i++; 

        } else {
            // Just a removal block with no immediate replacement
            partLines.forEach(line => {
                lines.push({
                    type: 'remove',
                    content: line,
                    oldLineNumber: currentOldLine++
                });
            });
        }
    } else {
        // Normal / Unchanged
        partLines.forEach(line => {
            lines.push({
                type: 'normal',
                content: line,
                oldLineNumber: currentOldLine++,
                newLineNumber: currentNewLine++
            });
        });
    }
  }

  return lines;
}