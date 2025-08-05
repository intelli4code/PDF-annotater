import type { Timestamp } from "firebase/firestore";
import type { HighlightArea } from "@react-pdf-viewer/highlight";

// The DrawingPath type is not available as the @react-pdf-viewer/draw package does not exist.
// This type is temporarily commented out to allow the application to build.
// import type { DrawingPath } from "@react-pdf-viewer/draw";


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
  // paths?: DrawingPath[];
  paths?: any[];
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
