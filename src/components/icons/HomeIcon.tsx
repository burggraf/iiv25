import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface HomeIconProps {
  size?: number;
  color?: string;
}

export default function HomeIcon({ size = 24, color = '#14A44A' }: HomeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
      />
    </Svg>
  );
}