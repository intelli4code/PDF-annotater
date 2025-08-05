import type { Timestamp } from "firebase/firestore";

export type AnnotationTool = 'select' | 'marker' | 'eraser' | 'square' | 'circle' | 'triangle' | 'check' | 'cross' | 'text';

export interface Annotation {
  id: string;
  pageIndex: number;
  type: AnnotationTool;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  path?: { x: number, y: number }[]; // For freehand 'marker'
  text?: string; // For 'text' tool
  fontSize?: number; // For 'text' tool
  // For shapes that can be filled or just outlined
  variant?: 'fill' | 'outline';
}

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  createdAt: Timestamp | Date;
  annotations: Annotation[];
}
