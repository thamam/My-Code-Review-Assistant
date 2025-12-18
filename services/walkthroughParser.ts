
import { Walkthrough, WalkthroughSection } from '../types';

export class WalkthroughParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalkthroughParserError';
  }
}

export const parseMarkdownWalkthrough = (text: string): Walkthrough => {
  const lines = text.split('\n');
  let title = "Walkthrough";
  let author = "Anonymous";
  const sections: WalkthroughSection[] = [];
  let currentSection: any = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    if (line.startsWith('# ')) {
      title = line.substring(2).trim();
    } else if (line.toLowerCase().startsWith('author:')) {
      author = line.substring(7).trim();
    } else if (line.startsWith('## ')) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        id: `sec-${sections.length + 1}`,
        title: line.substring(3).trim(),
        files: [],
        description: '',
        highlights: []
      };
    } else if (currentSection) {
      if (line.toLowerCase().startsWith('files:')) {
        currentSection.files = line.substring(6).split(',').map((f: string) => f.trim());
      } else if (line.startsWith('- ') && line.includes(':')) {
        const firstColon = line.indexOf(':');
        if (firstColon > -1) {
          const file = line.substring(2, firstColon).trim();
          const rest = line.substring(firstColon + 1).trim();
          const secondColon = rest.indexOf(':');
          if (secondColon > -1) {
            const range = rest.substring(0, secondColon).trim();
            const note = rest.substring(secondColon + 1).trim();
            let start = 0, end = 0;
            if (range.includes('-')) {
              const parts = range.split('-');
              start = parseInt(parts[0]);
              end = parseInt(parts[1]);
            } else {
              start = parseInt(range);
              end = start;
            }
            
            if (!isNaN(start)) {
              currentSection.highlights.push({ file, lines: [start, end], note });
              if (!currentSection.files.includes(file)) currentSection.files.push(file);
            } else {
              currentSection.description += line + '\n';
            }
          } else {
            currentSection.description += line + '\n';
          }
        } else {
          currentSection.description += line + '\n';
        }
      } else {
        currentSection.description += line + '\n';
      }
    }
  }
  
  if (currentSection) sections.push(currentSection);
  
  if (sections.length === 0) {
      throw new WalkthroughParserError("No valid sections found. Use '## Section Title' to define sections.");
  }

  return { title, author, sections };
};

export const parseWalkthroughFromText = (content: string, fileName: string): Walkthrough => {
    if (fileName.endsWith('.json')) {
        try {
            const json = JSON.parse(content);
            if (!json.sections || !Array.isArray(json.sections)) {
                throw new WalkthroughParserError("Invalid JSON structure: Missing 'sections' array.");
            }
            return json as Walkthrough;
        } catch (e) {
            if (e instanceof WalkthroughParserError) throw e;
            throw new WalkthroughParserError("Invalid JSON syntax.");
        }
    } else {
        return parseMarkdownWalkthrough(content);
    }
};

export const parseWalkthroughFile = (file: File): Promise<Walkthrough> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        resolve(parseWalkthroughFromText(content, file.name));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new WalkthroughParserError("Failed to read file."));
    reader.readAsText(file);
  });
};
