import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface UserIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
}

export default function UserIcon({ size = 24, color = '#14A44A', filled = false }: UserIconProps) {
  if (filled) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="10" fill={color} />
        <Circle cx="12" cy="9" r="3" fill="white" />
        <Path
          fill="white"
          d="M17.5 15.5c-1.2-1.8-3.2-3-5.5-3s-4.3 1.2-5.5 3c1.5 1.8 3.7 3 6 3s4.5-1.2 6-3z"
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
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
      />
      <Circle
        cx="12"
        cy="7"
        r="4"
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
    </Svg>
  );
}