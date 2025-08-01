# **App Name**: PDF Annotator Pro

## Core Features:

- User Authentication: Secure user authentication with Firebase. Display user ID.
- PDF Upload: Upload PDF files to Supabase Storage, linked to the user ID.
- PDF Listing: List uploaded PDFs by filename.
- PDF Viewing: Display PDFs using react-pdf.
- Highlight Tool: Draw highlights (semi-transparent yellow rectangles).
- Marker Tool: Draw markers (semi-transparent red rectangles).
- Annotation Saving: Save and persist annotation data (page, coordinates, color, type) in Firestore. Load saved annotations on PDF re-open.
- Download PDF: Download the original PDF from Supabase Storage.
- Export Annotations: Export annotations as a JSON file.

## Style Guidelines:

- Primary color: Indigo (#4F46E5) for a professional and focused feel.
- Background color: Light gray (#F9FAFB) for a clean, unobtrusive background.
- Accent color: Purple (#8B5CF6) to draw attention to interactive elements.
- Body and headline font: 'Inter' (sans-serif) for a modern, readable interface.
- Use simple, outline-style icons from a library like Feather or Heroicons.
- Employ a clean, well-spaced layout with clear visual hierarchy.
- Use subtle animations and transitions to provide feedback and enhance the user experience.