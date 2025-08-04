import type { Timestamp } from "firebase/firestore";
import type { HighlightArea } from "@react-pdf-viewer/highlight";

export interface Annotation {
  id: string;
  type: 'highlight' | 'marker';
  pageIndex: number;
  highlightAreas: HighlightArea[];
  comment: string;
  content: {
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
