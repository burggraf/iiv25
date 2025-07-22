import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface BellIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
}

export default function BellIcon({ size = 24, color = '#666', filled = false }: BellIconProps) {
  if (filled) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill={color}
          d="M12 2C13.1 2 14 2.9 14 4C14 4.74 13.6 5.39 13 5.73V7C13 10.76 15.76 13.86 16 17H8C8.24 13.86 11 10.76 11 7V5.73C10.4 5.39 10 4.74 10 4C10 2.9 10.9 2 12 2ZM21 19V20H3V19L5 17V11C5 7.9 7.03 5.17 10 4.29C10 4.19 10 4.1 10 4C10 2.9 10.9 2 12 2S14 2.9 14 4C14 4.1 14 4.19 14 4.29C16.97 5.17 19 7.9 19 11V17L21 19ZM9 21C9 22.1 9.9 23 11 23H13C14.1 23 15 22.1 15 21H9Z"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
      />
    </Svg>
  );
}