
'use client';

import React, { useState, useCallback, useMemo } from 'react';
import type { PdfDocument, Annotation } from '@/types';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { doc, updateDoc } from 'firebase/firestore';
import { summarizeText } from '@/ai/flows/summarize-text-flow';

import { Viewer, Worker } from '@react-pdf-viewer/core';
import { 
    defaultLayoutPlugin, 
    ToolbarProps, 
    TransformToolbarSlot,
} from '@react-pdf-viewer/default-layout';

import {
    highlightPlugin,
    Trigger
} from '@react-pdf-viewer/highlight';
import type { RenderHighlightsProps, HighlightArea, HighlightTarget } from '@react-pdf-viewer/highlight';


import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Highlighter, Edit, Eraser, Download, FileJson, Save, Bot, MessageSquare, Loader2, XCircle, Palette } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import CommentsSidebar from './CommentsSidebar';


type AnnotationMode = 'highlight' | 'erase';

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
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('highlight');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const { toast } = useToast();
  
  const saveAnnotations = useCallback(async (newAnnotations: Annotation[]) => {
    try {
      const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
      // Convert to a plain object for Firestore
      const annotationsToSave = newAnnotations.map(ann => ({...ann}));
      await updateDoc(doc(db, pdfDocPath), {
        annotations: annotationsToSave,
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

  const addAnnotation = (annotation: Annotation) => {
    setAnnotations(prevAnns => {
      const updatedAnnotations = [...prevAnns, annotation];
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
        {annotations.map((annotation) => (
            <React.Fragment key={annotation.id}>
                {annotation.highlightAreas
                    ?.filter((area) => area.pageIndex === props.pageIndex)
                    .map((area, idx) => (
                        <div
                            key={idx}
                            style={{
                                ...props.getCssProperties(area, props.rotation),
                                cursor: annotationMode === 'erase' ? 'pointer' : 'default',
                            }}
                            onClick={() => annotationMode === 'erase' && removeAnnotation(annotation.id)}
                            className="bg-yellow-400/40"
                        />
                    ))}
            </React.Fragment>
        ))}
    </div>
);


  const highlightPluginInstance = highlightPlugin({
      renderHighlights,
      trigger: annotationMode === 'highlight' ? Trigger.TextSelection : Trigger.None,
  });

  const { getSelection } = highlightPluginInstance;

  const layoutPluginInstance = defaultLayoutPlugin({
      renderToolbar: (
          Toolbar: (props: ToolbarProps) => React.ReactElement,
      ) => (
          <Toolbar>
              {(slot: TransformToolbarSlot) => {
                  const {
                      CurrentPageInput,
                      Download,
                      EnterFullScreen,
                      NumberOfPages,
                      Print,
                      Rotate,
                      Zoom,
                      ZoomIn,
                      ZoomOut,
                  } = slot;
                  return (
                      <>
                          <div style={{ padding: '0px 2px' }}>
                              <ZoomOut />
                          </div>
                          <div style={{ padding: '0px 2px' }}>
                              <Zoom />
                          </div>
                          <div style={{ padding: '0px 2px' }}>
                              <ZoomIn />
                          </div>
                          <div style={{ padding: '0px 2px', marginLeft: 'auto' }}>
                              <Rotate />
                          </div>
                          <div style={{ padding: '0px 2px' }}>
                              <EnterFullScreen />
                          </div>
                          <div style={{ padding: '0px 2px' }}>
                              <Print />
                          </div>
                      </>
                  );
              }}
          </Toolbar>
      ),
  });
  
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
          if (window.getSelection) {
            window.getSelection()?.removeAllRanges();
          }
        });
    },
    [toast]
  );
  
  
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
                        <Button variant={annotationMode === 'highlight' ? 'secondary' : 'ghost'} className="text-white hover:bg-gray-700" size="icon" onClick={() => setAnnotationMode('highlight')}>
                            <Highlighter className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Highlight Text</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant={'ghost'} className="text-white hover:bg-gray-700" size="icon" disabled>
                            <Palette className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Color picker is disabled</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant={annotationMode === 'erase' ? 'secondary' : 'ghost'} className="text-white hover:bg-gray-700" size="icon" onClick={() => setAnnotationMode('erase')}>
                            <Eraser className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Erase Annotation</TooltipContent>
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
                    <div
                      style={{
                        height: '100%',
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      <Viewer
                          fileUrl={pdf.url}
                          plugins={[layoutPluginInstance, highlightPluginInstance]}
                          onDocumentLoad={() => {
                            // Clear stored annotations if PDF is different
                            const storedPdfId = localStorage.getItem('pdfId');
                            if (storedPdfId !== pdf.id) {
                                localStorage.removeItem('annotations');
                            }
                            localStorage.setItem('pdfId', pdf.id);
                          }}
                          onHighlight={(target: HighlightTarget) => {
                            if (annotationMode !== 'highlight') return;
                            const newAnnotation: Annotation = {
                              id: `${Date.now()}`,
                              highlightAreas: target.highlightAreas,
                              type: 'highlight',
                              comment: '',
                              pageIndex: target.highlightAreas[0].pageIndex,
                              content: {
                                  text: target.selectedText,
                                  image: '',
                              },
                            };
                            addAnnotation(newAnnotation);
                          }}
                      />
                    </div>
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
