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

import { pdfjs } from 'pdfjs-dist';

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId }) => {
  const [message, setMessage] = React.useState('');
  let annotationIdCounter = pdf.annotations?.length || 0;

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
      {pdf.annotations
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

  const { addHighlight } = highlightPluginInstance;

  const saveAnnotations = async () => {
    try {
      const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
      await updateDoc(doc(db, pdfDocPath), {
        annotations: pdf.annotations,
      });
      setMessage('Annotations Saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      console.error(e);
      setMessage('Error saving annotations.');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const layoutPlugin = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[0], // Thumbnails
    ],
    transformToolbar: transform,
  });

  const workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

  return (
    <div className="h-[calc(100vh-12rem)] w-full"
      onMouseUp={(e) => {
        // Stop the event from bubbling up to the core layer
        e.stopPropagation();

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return;
        }

        const range = selection.getRangeAt(0);
        if (range.collapsed) {
          return;
        }

        // This is a simplified example. In a real-world scenario, you'd need a more robust way
        // to determine the page index based on the selection.
        // For now, we'll assume page 0.
        const currentPage = 0; 
        
        const highlightAreas = Array.from(Array(selection.rangeCount).keys()).map(i => {
            const r = selection.getRangeAt(i);
            const rect = r.getBoundingClientRect();
            return {
                height: rect.height,
                width: rect.width,
                left: rect.left,
                top: rect.top,
                pageIndex: currentPage,
            };
        });

        addHighlight({
            highlightAreas
        });
        
        selection.removeAllRanges();
      }}
    >
      <Worker workerUrl={workerUrl}>
        <Viewer
          fileUrl={pdf.url}
          plugins={[layoutPlugin, highlightPluginInstance]}
          initialAnnotations={pdf.annotations}
          onAnnotationAdd={(annotation) => {
            if (!Array.isArray(pdf.annotations)) {
                pdf.annotations = [];
            }
            (pdf.annotations as Annotation[]).push({ ...annotation, id: `${++annotationIdCounter}` });
          }}
          onAnnotationRemove={(annotationId) => {
            pdf.annotations = (pdf.annotations as Annotation[]).filter((ann) => ann.id !== annotationId);
          }}
          onAnnotationUpdate={(annotation) => {
             const index = (pdf.annotations as Annotation[]).findIndex(ann => ann.id === annotation.id);
             if (index > -1) {
                (pdf.annotations as Annotation[])[index] = annotation;
             }
          }}
        />
      </Worker>
    </div>
  );
};

export default PdfViewer;
