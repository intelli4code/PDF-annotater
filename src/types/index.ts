import type { Timestamp } from "firebase/firestore";
import type { HighlightArea } from "@react-pdf-viewer/highlight";
import type { DrawingPath } from "@react-pdf-viewer/drawing";

export interface Annotation {
  id: string;
  type: 'highlight' | 'draw';
  pageIndex: number;
  comment: string;
  
  // Highlight-specific
  highlightAreas?: HighlightArea[];
  content?: {
      text?: string;
      image?: string;
  };

  // Drawing-specific
  paths?: DrawingPath[];
  color?: string;
  opacity?: number;
  width?: number;
}

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  createdAt: Timestamp | Date;
  annotations: Annotation[];
}
