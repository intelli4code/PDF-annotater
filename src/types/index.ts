import type { Timestamp } from "firebase/firestore";

// This is a generic type for annotations from react-pdf-viewer
export type Annotation = any;

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  createdAt: Timestamp | Date;
  annotations: Annotation[];
}
