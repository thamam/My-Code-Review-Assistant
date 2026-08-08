/**
 * Utilities for runtime tool execution and command formatting.
 */

/**
 * Browser-safe UTF-8 base64 encoder. TextEncoder + btoa avoids the Node-only
 * `Buffer` global (which does not exist in the browser runtime).
 * The chunked spread prevents call-stack overflow on large inputs.
 */
const toBase64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};

/**
 * Formats a search command for the runtime (FR-016).
 * Since WebContainer often lacks 'grep', we use a Node.js script for cross-platform reliability.
 * Uses base64 encoding to safely pass the query through the shell.
 */
export function formatSearchCommand(query: string): string {
  // Encode query as base64 to avoid shell quoting issues
  const encodedQuery = toBase64(query);

  // Node.js one-liner that recursively searches for text in files
  // Optimized for WebContainer/Browser environments
  // Returns exit code 1 if no matches found (like grep)
  const nodeScript = `const fs=require('fs'),path=require('path');const q=Buffer.from('${encodedQuery}','base64').toString();let found=false;function search(dir){try{fs.readdirSync(dir).forEach(f=>{const p=path.join(dir,f);try{const s=fs.statSync(p);if(s.isDirectory()&&!f.startsWith('.')&&f!=='node_modules')search(p);else if(s.isFile()&&/\.(ts|js|tsx|jsx|json|md)$/.test(f)){const lines=fs.readFileSync(p,'utf8').split('\n');lines.forEach((l,i)=>{if(l.includes(q)){console.log(p+':'+(i+1)+': '+l.trim());found=true;}});}catch(e){}});}catch(e){}}search('.');if(!found)process.exit(1);`;

  return nodeScript;
}

/**
 * Formats a write_file command for the runtime (FR-015).
 */
export function formatWriteFileCommand(filePath: string, content: string): string {
  const encodedPath = toBase64(filePath);
  const encodedContent = toBase64(content);

  return `const fs=require('fs'),path=require('path');const targetPath=Buffer.from('${encodedPath}','base64').toString();const content=Buffer.from('${encodedContent}','base64').toString();const dir=path.dirname(targetPath);if(dir&&dir!=='.'&&!fs.existsSync(dir)){fs.mkdirSync(dir,{recursive:true});}fs.writeFileSync(targetPath,content);console.log('File written: '+targetPath);`;
}
