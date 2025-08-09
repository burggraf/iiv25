import React from 'react';
import { render } from '@testing-library/react-native';
import SpinnerIcon from '../SpinnerIcon';

// Mock Animated API
jest.mock('react-native', () => {
  const ReactNative = jest.requireActual('react-native');
  const mockAnimatedValue = {
    setValue: jest.fn(),
    interpolate: jest.fn(() => 'mocked-interpolate'),
  };

  return {
    ...ReactNative,
    Animated: {
      ...ReactNative.Animated,
      Value: jest.fn(() => mockAnimatedValue),
      loop: jest.fn(() => ({ start: jest.fn() })),
      timing: jest.fn(() => ({ start: jest.fn() })),
    },
  };
});

describe('SpinnerIcon', () => {
  it('renders with default props', () => {
    // The component should render without crashing
    expect(() => render(<SpinnerIcon />)).not.toThrow();
  });

  it('renders with custom size and color', () => {
    // The component should render without crashing with custom props
    expect(() => render(<SpinnerIcon size={32} color="#FF0000" />)).not.toThrow();
  });
});