import React from 'react';
import { MapPin, MessageSquare } from 'lucide-react';

interface LineGutterIndicatorProps {
  size: number;
  isHovered: boolean;
  isSelected: boolean;
  hasMarker: boolean;
  hasLabel: boolean;
}

/** Hover-hint pin / marker-or-label icon shown in the gutter, shared by DiffView and SourceView. */
export const LineGutterIndicator: React.FC<LineGutterIndicatorProps> = ({ size, isHovered, isSelected, hasMarker, hasLabel }) => {
  if (hasMarker || hasLabel) {
    return (
      <div className="absolute left-1 top-1 text-blue-400 pointer-events-none">
        {hasLabel ? <MessageSquare size={size} className="text-yellow-400" /> : <MapPin size={size} />}
      </div>
    );
  }
  if (isHovered && !isSelected) {
    return (
      <div className="absolute left-1 top-1 text-gray-500 opacity-50 pointer-events-none">
        <MapPin size={size} />
      </div>
    );
  }
  return null;
};
