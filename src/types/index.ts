import type { Timestamp } from "firebase/firestore";
import type { HighlightArea } from "@react-pdf-viewer/highlight";


export interface Annotation {
  id: string;
  type: 'highlight'; // Only highlight is supported for now
  pageIndex: number;
  comment: string;
  
  // Highlight-specific
  highlightAreas?: HighlightArea[];
  content?: {
      text?: string;
      image?: string;
  };
}

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  createdAt: Timestamp | Date;
  annotations: Annotation[];
}
