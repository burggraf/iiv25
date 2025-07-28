import React from 'react';
import Svg, { Rect, Path } from 'react-native-svg';

interface PasteIconProps {
  size?: number;
  color?: string;
}

export default function PasteIcon({ size = 24, color = '#14A44A' }: PasteIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Clipboard outline */}
      <Rect
        x="5"
        y="3"
        width="14"
        height="18"
        rx="2"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Top clip area */}
      <Rect
        x="9"
        y="1"
        width="6"
        height="4"
        rx="1"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Content lines */}
      <Path
        d="M9 9h6M9 13h6M9 17h4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}