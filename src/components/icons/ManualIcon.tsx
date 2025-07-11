import React from 'react';
import Svg, { G, Rect, Path } from 'react-native-svg';

interface ManualIconProps {
  size?: number;
  color?: string;
}

export default function ManualIcon({ size = 24, color = '#14A44A' }: ManualIconProps) {
  return (
    <Svg width={size} height={size} viewBox="2.833 0 153.667 184.143">
      <Rect
        x="7.282"
        y="4.539"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit="10"
        width="23.371"
        height="23.371"
      />
      <Rect
        x="128.463"
        y="4.539"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit="10"
        width="23.37"
        height="23.371"
      />
      <Rect
        x="68.189"
        y="4.539"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit="10"
        width="23.37"
        height="23.371"
      />
      <Rect
        x="7.282"
        y="56.771"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit="10"
        width="23.371"
        height="23.371"
      />
      <Rect
        x="128.463"
        y="56.771"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit="10"
        width="23.37"
        height="23.371"
      />
      <G>
        <G>
          <Path
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeMiterlimit="10"
            d="M127.854,94.309c-5.594,0-10.13,4.536-10.13,10.13
            v-7.588c0-5.593-4.534-10.129-10.129-10.129c-5.593,0-10.129,4.536-10.129,10.129v-7.587c0-5.594-4.534-10.129-10.129-10.129
            c-5.594,0-10.129,4.535-10.129,10.129V60.378c0-5.595-4.536-10.13-10.13-10.13c-5.594,0-10.13,4.534-10.13,10.13v56.67
            l-9.989-9.99c-3.956-3.955-10.37-3.955-14.326,0c-3.956,3.956-3.956,10.37,0,14.325l10.843,10.844
            c4.283,4.283,7.34,9.633,8.854,15.498c4.75,18.396,21.344,31.25,40.344,31.25h1.59c24.146,0,43.718-19.574,43.718-43.719v-8.59
            v-22.228C137.982,98.845,133.448,94.309,127.854,94.309z"
          />
        </G>
      </G>
    </Svg>
  );
}