
'use client';

import React from 'react';
import type { PdfDocument, Annotation } from '@/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import type { ToolbarProps, TransformToolbarSlot } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import type { RenderHighlightsProps } from '@react-pdf-viewer/highlight';

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
}

// Function to ensure annotations are always an array
const getAnnotationsArray = (annotations: any): Annotation[] => {
    if (Array.isArray(annotations)) {
        return annotations;
    }
    if (annotations && typeof annotations === 'object') {
        return Object.values(annotations);
    }
    return [];
};


const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId }) => {
  const [message, setMessage] = React.useState('');
  const [annotations, setAnnotations] = React.useState<Annotation[]>(getAnnotationsArray(pdf.annotations));
  let annotationIdCounter = annotations.length;

  React.useEffect(() => {
    setAnnotations(getAnnotationsArray(pdf.annotations));
  }, [pdf]);

  const transform: TransformToolbarSlot = (slot: ToolbarProps) => ({
    ...slot,
    // Add a Save button to the toolbar
    Right: () => (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {message && (
          <div style={{
            color: '#fff',
            backgroundColor: message.includes('Saved') ? '#28a745' : '#dc3545',
            padding: '4px 8px',
            borderRadius: '4px',
            marginRight: '16px',
            fontSize: '12px',
          }}>{message}</div>
        )}
        <button
          style={{
            backgroundColor: 'hsl(var(--primary))',
            border: 'none',
            borderRadius: '4px',
            color: 'hsl(var(--primary-foreground))',
            cursor: 'pointer',
            padding: '8px 12px',
            marginRight: '8px',
          }}
          onClick={saveAnnotations}
        >
          Save
        </button>
        {slot.Right_2({})}
        {slot.Right_3({})}
      </div>
    ),
  });

  const renderHighlights = (props: RenderHighlightsProps) => (
    <div>
      {annotations
        .filter(ann => ann.pageIndex === props.pageIndex)
        .map((highlight, index) => (
          <div
            key={index}
            style={Object.assign(
              {},
              {
                background: 'yellow',
                opacity: 0.4,
              },
              props.getCssProperties(highlight.highlightAreas[0], props.rotation)
            )}
          />
        ))}
    </div>
  );

  const highlightPluginInstance = highlightPlugin({
    renderHighlights,
    trigger: Trigger.TextSelection,
  });

  const saveAnnotations = async () => {
    try {
      const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
      // Ensure we are saving the latest annotations from the state as an array
      await updateDoc(doc(db, pdfDocPath), {
        annotations: annotations,
      });
      setMessage('Annotations Saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      console.error(e);
      setMessage('Error saving annotations.');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleAnnotationAdd = (annotation: Annotation) => {
    const newAnnotation = { ...annotation, id: `${++annotationIdCounter}` };
    setAnnotations(prev => [...prev, newAnnotation]);
  };

  const handleAnnotationRemove = (annotationId: string) => {
    setAnnotations(prev => prev.filter((ann) => ann.id !== annotationId));
  };
  
  const handleAnnotationUpdate = (annotation: Annotation) => {
    setAnnotations(prev => {
        const index = prev.findIndex(ann => ann.id === annotation.id);
        if (index > -1) {
           const newAnnotations = [...prev];
           newAnnotations[index] = annotation;
           return newAnnotations;
        }
        return prev;
    });
  };

  const layoutPlugin = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[0], // Thumbnails
    ],
    transformToolbar: transform,
  });

  const workerUrl = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

  return (
    <div className="h-[calc(100vh-12rem)] w-full">
      <Worker workerUrl={workerUrl}>
        <Viewer
          fileUrl={pdf.url}
          plugins={[layoutPlugin, highlightPluginInstance]}
          initialAnnotations={annotations}
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationRemove={handleAnnotationRemove}
          onAnnotationUpdate={handleAnnotationUpdate}
        />
      </Worker>
    </div>
  );
};

export default PdfViewer;
