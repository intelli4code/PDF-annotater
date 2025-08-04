
'use client';

import React from 'react';
import type { PdfDocument, Annotation } from '@/types';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { doc, updateDoc } from 'firebase/firestore';

import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin, ToolbarProps, TransformToolbarSlot } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import type { RenderHighlightsProps, HighlightArea } from '@react-pdf-viewer/highlight';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Highlighter, Edit, Eraser, Download, FileJson, Save, X } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AnnotationType = 'highlight' | 'marker';

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
}

const getAnnotationsArray = (annotations: any): Annotation[] => {
    if (Array.isArray(annotations)) {
        return annotations.filter(a => a && a.highlightAreas);
    }
    if (annotations && typeof annotations === 'object') {
        return Object.values(annotations).filter((a: any) => a && a.highlightAreas);
    }
    return [];
};


const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId }) => {
  const [annotations, setAnnotations] = React.useState<Annotation[]>(getAnnotationsArray(pdf.annotations));
  const [annotationType, setAnnotationType] = React.useState<AnnotationType>('highlight');
  const { toast } = useToast();

  React.useEffect(() => {
    setAnnotations(getAnnotationsArray(pdf.annotations));
  }, [pdf]);

  const saveAnnotations = async () => {
    try {
      const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
      await updateDoc(doc(db, pdfDocPath), {
        annotations: annotations,
      });
      toast({
        title: "Annotations Saved",
        description: "Your annotations have been successfully saved.",
      });
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: e.message || 'An unexpected error occurred while saving annotations.',
      });
    }
  };

  const handleDownload = async () => {
    if (!supabase) {
        toast({
            variant: 'destructive',
            title: 'Supabase Not Configured',
            description: 'Please configure Supabase to download files.',
        });
        return;
    }
    try {
        const { data, error } = await supabase.storage.from('main').download(pdf.storagePath);
        if (error) throw error;
        const blob = new Blob([data], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = pdf.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Download Failed',
            description: error.message || 'Could not download the PDF.',
        });
    }
  };

  const handleExport = () => {
      try {
          const jsonString = JSON.stringify(annotations, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${pdf.name.replace('.pdf', '')}_annotations.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (error: any) {
          toast({
              variant: 'destructive',
              title: 'Export Failed',
              description: 'Could not export annotations.',
          });
      }
  };

  const addAnnotation = (highlightArea: HighlightArea, type: AnnotationType) => {
    const newAnnotation: Annotation = {
        id: `${Date.now()}`,
        highlightAreas: [highlightArea],
        type: type,
        pageIndex: highlightArea.pageIndex,
    };
    setAnnotations(prev => [...prev, newAnnotation]);
  };

  const renderHighlights = (props: RenderHighlightsProps) => (
    <div>
      {annotations
        .filter(ann => ann.pageIndex === props.pageIndex)
        .map((ann, index) => (
          <div
            key={index}
            style={Object.assign(
              {},
              {
                background: ann.type === 'highlight' ? 'yellow' : 'red',
                opacity: 0.4,
              },
              props.getCssProperties(ann.highlightAreas[0], props.rotation)
            )}
            onClick={() => {
              if (annotationType === 'eraser') {
                setAnnotations(prev => prev.filter(a => a.id !== ann.id));
              }
            }}
          />
        ))}
    </div>
  );

  const highlightPluginInstance = highlightPlugin({
    renderHighlights,
    trigger: Trigger.TextSelection,
    onHighlight: (areas) => {
        if (annotationType !== 'eraser') {
            addAnnotation(areas[0], annotationType);
        }
    },
  });

  const transform: TransformToolbarSlot = (slot: ToolbarProps) => ({
      ...slot,
      // Hide the default annotation tools
      Open: () => <></>,
      Download: () => <></>,
      SwitchTheme: () => <></>,
      EnterFullScreen: () => <></>,
      Print: () => <></>,
  });
  
  const layoutPlugin = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [defaultTabs[0]], // Show only thumbnails
    transformToolbar: transform,
  });

  const workerUrl = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
  
  const AnnotationToolbar = () => (
    <div className="absolute top-2 right-2 z-10 bg-card p-2 rounded-lg shadow-md border flex gap-1">
      <TooltipProvider>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant={annotationType === 'highlight' ? 'default' : 'ghost'} size="icon" onClick={() => setAnnotationType('highlight')}>
                      <Highlighter className="h-5 w-5" />
                  </Button>
              </TooltipTrigger>
              <TooltipContent>Highlight (Yellow)</TooltipContent>
          </Tooltip>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant={annotationType === 'marker' ? 'default' : 'ghost'} size="icon" onClick={() => setAnnotationType('marker')}>
                      <Edit className="h-5 w-5" />
                  </Button>
              </TooltipTrigger>
              <TooltipContent>Marker (Red)</TooltipContent>
          </Tooltip>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant={annotationType === 'eraser' ? 'default' : 'ghost'} size="icon" onClick={() => setAnnotationType('eraser')}>
                      <Eraser className="h-5 w-5" />
                  </Button>
              </TooltipTrigger>
              <TooltipContent>Eraser</TooltipContent>
          </Tooltip>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={saveAnnotations}><Save className="h-5 w-5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Save Annotations</TooltipContent>
          </Tooltip>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleDownload}><Download className="h-5 w-5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Download PDF</TooltipContent>
          </Tooltip>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleExport}><FileJson className="h-5 w-5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Export Annotations</TooltipContent>
          </Tooltip>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Close Document</TooltipContent>
          </Tooltip>
      </TooltipProvider>
    </div>
  );

  return (
    <div className="h-[calc(100vh-12rem)] w-full relative border rounded-lg overflow-hidden">
        <AnnotationToolbar />
        <Worker workerUrl={workerUrl}>
            <Viewer
            fileUrl={pdf.url}
            plugins={[layoutPlugin, highlightPluginInstance]}
            />
        </Worker>
    </div>
  );
};

export default PdfViewer;
