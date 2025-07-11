import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import BarcodeIcon from '../../src/components/icons/BarcodeIcon';
import ManualIcon from '../../src/components/icons/ManualIcon';
import HistoryIcon from '../../src/components/icons/HistoryIcon';
import SearchIcon from '../../src/components/icons/SearchIcon';
import { IconSymbol } from '@/components/ui/IconSymbol';

export default function TabLayout() {
  const GREEN_COLOR = '#14A44A';
  const WHITE_COLOR = '#FFFFFF';
  const GRAY_COLOR = '#8E8E93';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: WHITE_COLOR,
        tabBarInactiveTintColor: GRAY_COLOR,
        tabBarActiveBackgroundColor: GREEN_COLOR,
        headerShown: false,
        tabBarStyle: Platform.select({
          ios: {
            backgroundColor: 'white',
            borderTopWidth: 1,
            borderTopColor: '#E5E5EA',
            paddingBottom: 4,
            paddingTop: 4,
          },
          default: {
            backgroundColor: 'white',
            borderTopWidth: 1,
            borderTopColor: '#E5E5EA',
            paddingBottom: 4,
            paddingTop: 4,
          },
        }),
        tabBarItemStyle: {
          borderRadius: 8,
          marginHorizontal: 2,
          marginVertical: 2,
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginTop: 2,
        },
        animation: 'none',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ focused }) => (
            <BarcodeIcon 
              size={24} 
              color={focused ? WHITE_COLOR : GREEN_COLOR} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="manual"
        options={{
          title: 'Manual',
          tabBarIcon: ({ focused }) => (
            <ManualIcon 
              size={24} 
              color={focused ? WHITE_COLOR : GREEN_COLOR} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused }) => (
            <HistoryIcon 
              size={24} 
              color={focused ? WHITE_COLOR : GREEN_COLOR} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ focused }) => (
            <SearchIcon 
              size={24} 
              color={focused ? WHITE_COLOR : GREEN_COLOR} 
            />
          ),
        }}
      />
    </Tabs>
  );
}
