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
