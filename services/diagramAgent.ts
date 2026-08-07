
import { GoogleGenAI, Type } from "@google/genai";
import { PRData, Diagram, CodeReference, DiagramType } from '../types';
import { resolveFilePath } from '../utils/fileUtils';

// Pattern: {description}§{filepath}:{line}
// Matches in Sequence: User->>System: Label§file:10
// Matches in Flowchart: A[Label§file:10]
// Matches in Class: class MyClass["MyClass§file:10"]
// Matches in State: state "Label§file:10" as s1
export const REF_PATTERN = /([^:\n>\["]+)§([^:\n"\]]+):(\d+)/g;

export function extractDiagramReferences(rawCode: string = "", prFiles: string[]): { cleanedCode: string, references: CodeReference[] } {
  const references: CodeReference[] = [];
  if (!rawCode) return { cleanedCode: "", references: [] };

  const cleanedCode = rawCode.replace(REF_PATTERN, (match, description, filepath, lineStr) => {
    const line = parseInt(lineStr, 10);
    const refId = `ref-${Math.random().toString(36).substr(2, 9)}`;
    const resolution = resolveFilePath(filepath.trim(), prFiles);

    references.push({
      id: refId,
      description: description.trim(),
      filepath: filepath.trim(),
      line: isNaN(line) ? 1 : line,
      resolvedPath: resolution.resolved,
      status: resolution.resolved ? 'valid' : 'unresolved'
    });

    return description.trim();
  });

  return { cleanedCode, references };
}

const DIAGRAM_TYPE_INSTRUCTIONS: Record<DiagramType, string> = {
  sequence: 'Generate a sequenceDiagram. Use syntax `A->>B: Message§file:line`.',
  flowchart: 'Generate a flowchart TD or LR. Use syntax `NodeID["Node Label§file:line"]`.',
  class: 'Generate a classDiagram. Use syntax `class ClassName["ClassName§file:line"]`. Use standard relationships <|--, *--, o--.',
  state: 'Generate a stateDiagram-v2. Use syntax `state "StateName§file:line" as s1`.',
};

export class DiagramAgent {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  }

  private buildManifest(prData: PRData): string {
    return prData.files.map(f => `- ${f.path} (${f.status})`).join('\n');
  }

  private buildFileContext(prData: PRData, opts: { maxFiles: number; maxChars: number; extensions?: string[] }): string {
    const { maxFiles, maxChars, extensions } = opts;
    return prData.files
      .filter(f => f.status !== 'deleted' && (!extensions || extensions.some(ext => f.path.endsWith(ext))))
      .slice(0, maxFiles)
      .map(f => `File: ${f.path}\nContent:\n${(f.newContent || '').slice(0, maxChars)}`)
      .join('\n\n');
  }

  async proposeDiagrams(prData: PRData): Promise<Diagram[]> {
    const prFilePaths = prData.files.map(f => f.path);

    // Provide a complete manifest so the agent knows every file exists
    const manifest = this.buildManifest(prData);

    // Sample content for core logic files
    const fileContext = this.buildFileContext(prData, { maxFiles: 15, maxChars: 2000, extensions: ['.ts', '.tsx', '.py', '.js'] });

    const prompt = `
      You are Theia, a world-class Software Architect. Analyze this PR and generate 2 high-value Mermaid.js Sequence Diagrams.
      
      PR: ${prData.title}
      Description: ${prData.description}

      ## PROJECT MANIFEST (All changed files)
      ${manifest}

      ## KEY FILE CONTENTS
      ${fileContext}

      ## FORMAT RULES (CRITICAL)
      1. Every message label MUST use this format: {description}§{filepath}:{line}
         Example: "Initialize pipeline§src/main.py:42"
      2. Use valid sequenceDiagram syntax.
      3. Assign specific, descriptive titles. NO "Untitled" or generic names.
      4. Ensure you reference the correct paths from the MANIFEST above.

      ## Output Schema
      Return a JSON array of objects. Each object MUST have:
      - title: Meaningful, specific name.
      - description: One-sentence summary.
      - mermaidCode: Valid sequenceDiagram code using the § format for messages.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                mermaidCode: { type: Type.STRING }
              },
              required: ["title", "description", "mermaidCode"]
            }
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      const rawDiagrams = JSON.parse(text);
      if (!Array.isArray(rawDiagrams)) throw new Error("AI returned malformed diagram list");

      return rawDiagrams.map((d: any, idx: number) => {
        const { cleanedCode, references } = extractDiagramReferences(d.mermaidCode || "", prFilePaths);
        return {
          id: `auto-diagram-${Date.now()}-${idx}`,
          title: d.title || `Flow Analysis ${idx + 1}`,
          description: d.description || "Architectural flow analysis.",
          mermaidCode: cleanedCode,
          references,
          timestamp: Date.now(),
          isAutoGenerated: true,
          category: 'interaction',
          type: 'sequence'
        };
      });
    } catch (e) {
      console.error("Diagram Generation Failed", e);
      throw e;
    }
  }

  async generateStructureDiagram(prData: PRData, type: DiagramType, userPrompt?: string): Promise<Diagram> {
    const prFilePaths = prData.files.map(f => f.path);
    const manifest = this.buildManifest(prData);
    const fileContext = this.buildFileContext(prData, { maxFiles: 20, maxChars: 1000 });

    const prompt = `
      You are Theia. Generate a ${type} diagram.
      Context: ${userPrompt || "Visualize the high-level structure and relationships of this codebase."}

      ## MANIFEST
      ${manifest}

      ## SOURCE SNIPPETS
      ${fileContext}

      ## SYNTAX RULES (CRITICAL for Navigation)
      ${DIAGRAM_TYPE_INSTRUCTIONS[type]}

      IMPORTANT: embed the §file:line reference directly in the label string.
      Do NOT add click callbacks manually. The system parses the § syntax.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              mermaidCode: { type: Type.STRING }
            },
            required: ["title", "description", "mermaidCode"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response");

      const data = JSON.parse(text);
      const { cleanedCode, references } = extractDiagramReferences(data.mermaidCode || "", prFilePaths);

      return {
        id: `structure-diagram-${Date.now()}`,
        title: data.title || `${type} Analysis`,
        description: data.description || "Structural analysis",
        mermaidCode: cleanedCode,
        references,
        timestamp: Date.now(),
        isAutoGenerated: false,
        category: type === 'sequence' ? 'interaction' : 'structure',
        type
      };
    } catch (e) {
      console.error("Structure Diagram Failed", e);
      throw e;
    }
  }

  async generateCustomDiagram(prData: PRData, userPrompt: string): Promise<Diagram> {
    return this.generateStructureDiagram(prData, 'sequence', userPrompt);
  }
}
