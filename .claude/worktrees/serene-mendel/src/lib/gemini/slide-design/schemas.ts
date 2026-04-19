/**
 * Gemini Structured Output schemas for the Slide Designer.
 */

import { Type } from '@google/genai'

export const DESIGN_SYSTEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    creativeDirection: {
      type: Type.OBJECT,
      properties: {
        visualMetaphor: { type: Type.STRING },
        visualTension: { type: Type.STRING },
        oneRule: { type: Type.STRING },
        colorStory: { type: Type.STRING },
        typographyVoice: { type: Type.STRING },
        emotionalArc: { type: Type.STRING },
      },
      required: ['visualMetaphor', 'visualTension', 'oneRule', 'colorStory', 'typographyVoice', 'emotionalArc'],
    },
    colors: {
      type: Type.OBJECT,
      properties: {
        primary: { type: Type.STRING }, secondary: { type: Type.STRING },
        accent: { type: Type.STRING }, background: { type: Type.STRING },
        text: { type: Type.STRING }, cardBg: { type: Type.STRING },
        cardBorder: { type: Type.STRING }, gradientStart: { type: Type.STRING },
        gradientEnd: { type: Type.STRING }, muted: { type: Type.STRING },
        highlight: { type: Type.STRING }, auroraA: { type: Type.STRING },
        auroraB: { type: Type.STRING }, auroraC: { type: Type.STRING },
      },
      required: ['primary', 'secondary', 'accent', 'background', 'text', 'cardBg', 'cardBorder',
        'gradientStart', 'gradientEnd', 'muted', 'highlight', 'auroraA', 'auroraB', 'auroraC'],
    },
    fonts: {
      type: Type.OBJECT,
      properties: { heading: { type: Type.STRING }, body: { type: Type.STRING } },
      required: ['heading', 'body'],
    },
    typography: {
      type: Type.OBJECT,
      properties: {
        displaySize: { type: Type.INTEGER }, headingSize: { type: Type.INTEGER },
        subheadingSize: { type: Type.INTEGER }, bodySize: { type: Type.INTEGER },
        captionSize: { type: Type.INTEGER },
        letterSpacingTight: { type: Type.NUMBER }, letterSpacingWide: { type: Type.NUMBER },
        lineHeightTight: { type: Type.NUMBER }, lineHeightRelaxed: { type: Type.NUMBER },
        weightPairs: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
      },
      required: ['displaySize', 'headingSize', 'subheadingSize', 'bodySize', 'captionSize',
        'letterSpacingTight', 'letterSpacingWide', 'lineHeightTight', 'lineHeightRelaxed', 'weightPairs'],
    },
    spacing: {
      type: Type.OBJECT,
      properties: {
        unit: { type: Type.INTEGER }, cardPadding: { type: Type.INTEGER },
        cardGap: { type: Type.INTEGER }, safeMargin: { type: Type.INTEGER },
      },
      required: ['unit', 'cardPadding', 'cardGap', 'safeMargin'],
    },
    effects: {
      type: Type.OBJECT,
      properties: {
        borderRadius: { type: Type.STRING, enum: ['sharp', 'soft', 'pill'] },
        borderRadiusValue: { type: Type.INTEGER },
        decorativeStyle: { type: Type.STRING, enum: ['geometric', 'organic', 'minimal', 'brutalist'] },
        shadowStyle: { type: Type.STRING, enum: ['none', 'fake-3d', 'glow'] },
        auroraGradient: { type: Type.STRING },
      },
      required: ['borderRadius', 'borderRadiusValue', 'decorativeStyle', 'shadowStyle', 'auroraGradient'],
    },
    motif: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING }, opacity: { type: Type.NUMBER },
        color: { type: Type.STRING }, implementation: { type: Type.STRING },
      },
      required: ['type', 'opacity', 'color', 'implementation'],
    },
  },
  required: ['colors', 'fonts', 'typography', 'spacing', 'effects', 'motif'],
}

/** Flat element schema — all element type fields combined, type-specific ones are optional */
const SLIDE_ELEMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    type: { type: Type.STRING, enum: ['text', 'shape', 'image'] },
    x: { type: Type.NUMBER }, y: { type: Type.NUMBER },
    width: { type: Type.NUMBER }, height: { type: Type.NUMBER },
    zIndex: { type: Type.INTEGER },
    opacity: { type: Type.NUMBER },
    rotation: { type: Type.NUMBER },
    // Text fields
    content: { type: Type.STRING },
    fontSize: { type: Type.NUMBER },
    fontWeight: { type: Type.INTEGER },
    color: { type: Type.STRING },
    textAlign: { type: Type.STRING },
    role: { type: Type.STRING },
    lineHeight: { type: Type.NUMBER },
    letterSpacing: { type: Type.NUMBER },
    textStroke: {
      type: Type.OBJECT,
      properties: { width: { type: Type.NUMBER }, color: { type: Type.STRING } },
      required: ['width', 'color'],
    },
    // Shape fields
    shapeType: { type: Type.STRING },
    fill: { type: Type.STRING },
    borderRadius: { type: Type.NUMBER },
    clipPath: { type: Type.STRING },
    border: { type: Type.STRING },
    // Image fields
    src: { type: Type.STRING },
    alt: { type: Type.STRING },
    objectFit: { type: Type.STRING },
  },
  required: ['id', 'type', 'x', 'y', 'width', 'height', 'zIndex'],
}

export const SLIDE_BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          slideType: { type: Type.STRING },
          label: { type: Type.STRING },
          background: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['solid', 'gradient', 'image'] },
              value: { type: Type.STRING },
            },
            required: ['type', 'value'],
          },
          elements: { type: Type.ARRAY, items: SLIDE_ELEMENT_SCHEMA },
        },
        required: ['id', 'slideType', 'label', 'background', 'elements'],
      },
    },
  },
  required: ['slides'],
}
