'use client'

import React from 'react'
import { DeviceFrameset } from 'react-device-frameset'
import 'react-device-frameset/styles/marvel-devices.min.css'
import { Safari } from '@/components/ui/safari'
import { Iphone } from '@/components/ui/iphone'
import { Android } from '@/components/ui/android'
import type { MockupDeviceType, MockupDeviceColor, MagicUIDevice, MAGICUI_DEVICES } from '@/types/presentation'

interface DeviceMockupProps {
  deviceType: MockupDeviceType
  deviceColor?: MockupDeviceColor
  landscape?: boolean
  children?: React.ReactNode
  /** Image source — used by MagicUI devices */
  imageSrc?: string
  /** Video source — used by MagicUI devices */
  videoSrc?: string
}

const MAGIC_UI_SET = new Set<string>(['iPhone 15 Pro', 'Safari', 'Android'])

export default function DeviceMockup({
  deviceType,
  deviceColor,
  landscape = false,
  children,
  imageSrc,
  videoSrc,
}: DeviceMockupProps) {
  // ─── MagicUI devices (high-fidelity SVG) ───
  if (MAGIC_UI_SET.has(deviceType)) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {deviceType === 'iPhone 15 Pro' && (
          <Iphone
            src={imageSrc}
            videoSrc={videoSrc}
            className="h-full w-auto"
          />
        )}
        {deviceType === 'Safari' && (
          <Safari
            url="app.example.com"
            imageSrc={imageSrc}
            videoSrc={videoSrc}
            className="w-full"
          />
        )}
        {deviceType === 'Android' && (
          <Android
            src={imageSrc}
            videoSrc={videoSrc}
            className="h-full w-auto"
          />
        )}
      </div>
    )
  }

  // ─── react-device-frameset devices ───
  const frameProps: Record<string, unknown> = {
    device: deviceType,
    landscape,
  }

  if (deviceColor && DEVICE_COLORS[deviceType]?.includes(deviceColor)) {
    frameProps.color = deviceColor
  }

  return (
    <div className="device-mockup-wrapper" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
    }}>
      {/* @ts-expect-error - DeviceFrameset has complex generic props */}
      <DeviceFrameset {...frameProps}>
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          {children}
        </div>
      </DeviceFrameset>
    </div>
  )
}

// ─── Helpers ───

export const DEVICE_COLORS: Record<string, MockupDeviceColor[]> = {
  'iPhone 15 Pro': [],
  'Safari': [],
  'Android': [],
  'iPhone X': [],
  'iPhone 8': ['black', 'silver', 'gold'],
  'iPhone 8 Plus': ['black', 'silver', 'gold'],
  'iPhone 5s': ['black', 'silver', 'gold'],
  'iPhone 5c': ['white', 'red', 'yellow', 'green', 'blue'],
  'iPhone 4s': ['black', 'silver'],
  'iPad Mini': [],
  'MacBook Pro': [],
  'Galaxy Note 8': [],
  'Samsung Galaxy S5': [],
  'Nexus 5': [],
  'HTC One': [],
  'Lumia 920': ['black', 'white', 'yellow', 'red', 'blue'],
}

export const DEVICE_LIST: { value: MockupDeviceType; label: string; group: string }[] = [
  // MagicUI — premium
  { value: 'iPhone 15 Pro', label: 'iPhone 15 Pro', group: 'פרימיום' },
  { value: 'Safari', label: 'Safari Browser', group: 'פרימיום' },
  { value: 'Android', label: 'Android', group: 'פרימיום' },
  // Frameset
  { value: 'iPhone X', label: 'iPhone X', group: 'Apple' },
  { value: 'iPhone 8', label: 'iPhone 8', group: 'Apple' },
  { value: 'iPhone 8 Plus', label: 'iPhone 8 Plus', group: 'Apple' },
  { value: 'iPad Mini', label: 'iPad Mini', group: 'Apple' },
  { value: 'MacBook Pro', label: 'MacBook Pro', group: 'Apple' },
  { value: 'Galaxy Note 8', label: 'Galaxy Note 8', group: 'Android' },
  { value: 'Samsung Galaxy S5', label: 'Samsung Galaxy S5', group: 'Android' },
  { value: 'Nexus 5', label: 'Nexus 5', group: 'Android' },
  { value: 'HTC One', label: 'HTC One', group: 'Android' },
  { value: 'Lumia 920', label: 'Lumia 920', group: 'Other' },
]

export const DEVICE_HAS_LANDSCAPE: Record<string, boolean> = {
  'iPhone 15 Pro': false,
  'Safari': false,
  'Android': false,
  'iPhone X': true,
  'iPhone 8': true,
  'iPhone 8 Plus': true,
  'iPhone 5s': true,
  'iPhone 5c': true,
  'iPhone 4s': true,
  'iPad Mini': true,
  'MacBook Pro': false,
  'Galaxy Note 8': true,
  'Samsung Galaxy S5': true,
  'Nexus 5': true,
  'HTC One': true,
  'Lumia 920': true,
}
