import type { Timestamp } from "firebase/firestore";

export interface Annotation {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'highlight' | 'marker';
  id: string;
}

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  createdAt: Timestamp | Date;
  annotations: { [pageNumber: number]: Annotation[] };
}
