import { FileChange } from '../types';

export function getFileColor(file: FileChange): string {
  if (file.status === 'added') return '#22c55e'; // green-500
  if (file.status === 'deleted') return '#ef4444'; // red-500
  if (file.status === 'unchanged') return '#6b7280'; // gray-500
  
  const totalLines = file.additions + file.deletions;
  // Estimate total lines if not available directly, or avoid division by zero
  const contentLines = file.newContent.split('\n').length || 1;
  const changeRatio = totalLines / contentLines;
  
  if (changeRatio > 0.5) return '#ef4444';     // red - heavy changes
  if (changeRatio > 0.2) return '#f97316';     // orange - moderate
  return '#3b82f6';                             // blue - light changes
}

export function getStatusColorClass(status: string, additions: number, deletions: number, content: string): string {
    if (status === 'added') return 'text-green-500';
    if (status === 'deleted') return 'text-red-500';
    if (status === 'unchanged') return 'text-gray-500';
    
    const totalLines = additions + deletions;
    const contentLines = content.split('\n').length || 1;
    const changeRatio = totalLines / contentLines;
    
    if (changeRatio > 0.5) return 'text-red-500';
    if (changeRatio > 0.2) return 'text-orange-500';
    return 'text-blue-500';
}
