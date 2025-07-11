import React from 'react';
import Svg, { G, Polyline, Line } from 'react-native-svg';

interface BarcodeIconProps {
  size?: number;
  color?: string;
}

export default function BarcodeIcon({ size = 24, color = '#14A44A' }: BarcodeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 164.706 159.191">
      <G>
        <Polyline
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
          points="5.029,31.515 5.029,4.515 32.029,4.515"
        />
        <Polyline
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
          points="160.029,31.515 160.029,4.515 133.029,4.515"
        />
        <Polyline
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
          points="5.029,127.515 5.029,154.515 32.029,154.515"
        />
        <Polyline
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
          points="160.029,127.515 160.029,154.515 133.029,154.515"
        />
        <Line
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
          x1="32.029"
          y1="33.765"
          x2="32.029"
          y2="125.265"
        />
        <Line
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
          x1="65.779"
          y1="33.765"
          x2="65.779"
          y2="125.265"
        />
        <Line
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
          x1="133.279"
          y1="33.765"
          x2="133.279"
          y2="125.265"
        />
        <Line
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
          x1="99.529"
          y1="33.765"
          x2="99.529"
          y2="125.265"
        />
      </G>
    </Svg>
  );
}