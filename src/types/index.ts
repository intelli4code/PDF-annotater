import type { Timestamp } from "firebase/firestore";

export type AnnotationTool = 'select' | 'marker' | 'eraser' | 'square' | 'circle' | 'triangle' | 'check' | 'cross';

export interface Annotation {
  id: string;
  pageIndex: number;
  type: AnnotationTool;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  path?: { x: number, y: number }[]; // For freehand drawing
}

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  createdAt: Timestamp | Date;
  annotations: Annotation[];
}
