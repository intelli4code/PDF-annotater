
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { PdfDocument, Annotation } from '@/types';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { doc, updateDoc } from 'firebase/firestore';
import { summarizeText } from '@/ai/flows/summarize-text-flow';

import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin, ToolbarProps, TransformToolbarSlot } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import type { RenderHighlightsProps, HighlightArea, HighlightTarget } from '@react-pdf-viewer/highlight';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Highlighter, Edit, Eraser, Download, FileJson, Save, Bot, MessageSquare, Loader2, XCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import CommentsSidebar from './CommentsSidebar';

type AnnotationType = 'highlight' | 'marker' | 'eraser';

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
  onPdfUpdate: (pdf: PdfDocument) => void;
}

const getAnnotationsArray = (annotations: any): Annotation[] => {
    if (Array.isArray(annotations)) {
        return annotations.filter(a => a && a.highlightAreas);
    }
    if (annotations && typeof annotations === 'object') {
        const annArray = Object.values(annotations).filter((a: any) => a && a.highlightAreas);
        return annArray as Annotation[];
    }
    return [];
};

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId, onPdfUpdate }) => {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => getAnnotationsArray(pdf.annotations));
  const [annotationType, setAnnotationType] = useState<AnnotationType>('highlight');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { toast } = useToast();
  
  const saveAnnotations = useCallback(async (newAnnotations: Annotation[]) => {
    try {
      const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
      await updateDoc(doc(db, pdfDocPath), {
        annotations: newAnnotations,
      });
      // Do not toast on auto-save
    } catch (e: any) {
      console.error("Save failed:", e);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: e.message || 'An unexpected error occurred while saving annotations.',
      });
    }
  }, [appId, userId, pdf.id, toast]);
  
  const handleManualSave = () => {
    saveAnnotations(annotations);
     toast({
      title: "Annotations Saved",
      description: "Your annotations have been successfully saved.",
    });
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

  const addAnnotation = (area: HighlightArea, type: AnnotationType) => {
    if (type === 'eraser') return;
    const newAnnotation: Annotation = {
        id: `${Date.now()}`,
        highlightAreas: [area],
        type: type,
        comment: '',
        pageIndex: area.pageIndex,
        content: {
            text: area.content.text || '',
            image: area.content.image || '',
        },
    };
    
    setAnnotations(prevAnns => {
      const updatedAnnotations = [...prevAnns, newAnnotation];
      saveAnnotations(updatedAnnotations);
      onPdfUpdate({ ...pdf, annotations: updatedAnnotations });
      return updatedAnnotations;
    });
  };

  const updateAnnotationComment = (id: string, comment: string) => {
    setAnnotations(prevAnns => {
        const updatedAnnotations = prevAnns.map(ann => ann.id === id ? { ...ann, comment } : ann);
        saveAnnotations(updatedAnnotations);
        onPdfUpdate({ ...pdf, annotations: updatedAnnotations });
        return updatedAnnotations;
    });
  };
  
  const removeAnnotation = (id: string) => {
    setAnnotations(prevAnns => {
        const updatedAnnotations = prevAnns.filter(ann => ann.id !== id);
        saveAnnotations(updatedAnnotations);
        onPdfUpdate({ ...pdf, annotations: updatedAnnotations });
        return updatedAnnotations;
    });
  };

  const renderHighlights = (props: RenderHighlightsProps) => (
    <div>
      {annotations
        .filter(ann => ann.pageIndex === props.pageIndex)
        .map((ann) => (
          <Popover key={ann.id}>
            <PopoverTrigger asChild>
              <div
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
                      removeAnnotation(ann.id);
                    }
                }}
              />
            </PopoverTrigger>
             {annotationType !== 'eraser' && (
                <PopoverContent className="w-80">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Comment</h4>
                      <p className="text-sm text-muted-foreground">
                        Add a comment to this annotation.
                      </p>
                    </div>
                    <Textarea 
                      defaultValue={ann.comment}
                      onBlur={(e) => updateAnnotationComment(ann.id, e.target.value)}
                      placeholder="Type your comment here."
                    />
                  </div>
                </PopoverContent>
              )}
          </Popover>
        ))}
    </div>
  );

  const handleSummarizeSelection = useCallback(
    (selection: HighlightTarget) => {
      const { selectedText } = selection;
      if (!selectedText) return;

      setIsSummarizing(true);
      summarizeText(selectedText)
        .then(summary => {
          toast({
            title: 'AI Summary',
            description: summary || 'Could not generate a summary.',
          });
        })
        .catch(error => {
          toast({
            variant: 'destructive',
            title: 'Summarization Failed',
            description: error.message || 'An unexpected error occurred.',
          });
        })
        .finally(() => {
          setIsSummarizing(false);
          // Clear text selection after summarizing
          if (window.getSelection) {
            window.getSelection()?.removeAllRanges();
          }
        });
    },
    [toast]
  );
  
  const highlightPluginInstance = highlightPlugin({
    renderHighlights,
    trigger: Trigger.TextSelection,
    onHighlight: (areas) => {
      addAnnotation(areas[0], annotationType);
    },
  });

  const { getSelection } = highlightPluginInstance;


  const transform: TransformToolbarSlot = (slot: ToolbarProps) => ({
      ...slot,
      // Hide all default toolbar elements
      Download: () => <></>,
      SwitchTheme: () => <></>,
      EnterFullScreen: () => <></>,
      Print: () => <></>,
      Open: () => <></>,
      Rotate: () => <></>,
      Zoom: () => <></>,
      ZoomIn: () => <></>,
      ZoomOut: () => <></>,
  });
  
  const layoutPlugin = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [], // Hide sidebar
    transformToolbar: transform,
  });

  const workerUrl = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
  
  const AnnotationToolbar = () => (
    <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold truncate max-w-xs">{pdf.name}</h2>
        </div>
        <div className="flex items-center gap-2">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant={annotationType === 'highlight' ? 'secondary' : 'ghost'} className="text-white hover:bg-gray-700" size="icon" onClick={() => setAnnotationType('highlight')}>
                            <Highlighter className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Highlight (Yellow)</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant={annotationType === 'marker' ? 'secondary' : 'ghost'} className="text-white hover:bg-gray-700" size="icon" onClick={() => setAnnotationType('marker')}>
                            <Edit className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Marker (Red)</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant={annotationType === 'eraser' ? 'secondary' : 'ghost'} className="text-white hover:bg-gray-700" size="icon" onClick={() => setAnnotationType('eraser')}>
                            <Eraser className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Eraser</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={() => getSelection()?.(handleSummarizeSelection)} disabled={isSummarizing}>
                            {isSummarizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Summarize Selection (AI)</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={handleManualSave}><Save className="h-5 w-5" /></Button>
                    </TooltipTrigger>
                    <TooltipContent>Save Annotations</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><MessageSquare className="h-5 w-5" /></Button>
                    </TooltipTrigger>
                    <TooltipContent>Show Comments</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={handleDownload}><Download className="h-5 w-5" /></Button>
                    </TooltipTrigger>
                    <TooltipContent>Download PDF</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={handleExport}><FileJson className="h-5 w-5" /></Button>
                    </TooltipTrigger>
                    <TooltipContent>Export Annotations</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
        <div>
            <Button onClick={onClose} variant="destructive" className="rounded-full">
                <XCircle className="mr-2 h-5 w-5" />
                DONE
            </Button>
        </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col">
        <AnnotationToolbar />
        <div className="flex-grow flex h-full w-full">
            <div className="flex-grow h-full w-full relative bg-gray-200">
                <Worker workerUrl={workerUrl}>
                    <Viewer
                    fileUrl={pdf.url}
                    plugins={[layoutPlugin, highlightPluginInstance]}
                    />
                </Worker>
            </div>
            <CommentsSidebar 
                isOpen={isSidebarOpen} 
                onClose={() => setIsSidebarOpen(false)}
                annotations={annotations}
                onUpdateComment={updateAnnotationComment}
            />
        </div>
    </div>
  );
};

export default PdfViewer;
