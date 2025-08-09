import React, { useRef, useEffect } from 'react';
import { ViewStyle, Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface SpinnerIconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export default function SpinnerIcon({ size = 24, color = '#14A44A', style }: SpinnerIconProps) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startRotation = () => {
      rotation.setValue(0);
      Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        { iterations: -1 }
      ).start();
    };

    startRotation();
  }, [rotation]);

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const animatedStyle = {
    transform: [{ rotate: rotateInterpolate }],
  };

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.09-5.09l-2.83 2.83M9.74 14.26L6.91 17.09M17.09 17.09l-2.83-2.83M9.74 9.74L6.91 6.91"
        />
      </Svg>
    </Animated.View>
  );
}