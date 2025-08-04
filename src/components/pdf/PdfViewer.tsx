
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type { PdfDocument, Annotation } from '@/types';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { doc, updateDoc } from 'firebase/firestore';
import { summarizeText } from '@/ai/flows/summarize-text-flow';

import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin, ToolbarProps, TransformToolbarSlot, drawingPlugin, DrawingMode } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import type { RenderHighlightsProps, HighlightArea, HighlightTarget } from '@react-pdf-viewer/highlight';

import type { RenderDrawingProps } from '@react-pdf-viewer/drawing';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Highlighter, Edit, Eraser, Download, FileJson, Save, Bot, MessageSquare, Loader2, XCircle, ChevronDown } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import CommentsSidebar from './CommentsSidebar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


type AnnotationMode = 'highlight' | 'draw' | 'erase';

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
  onPdfUpdate: (pdf: PdfDocument) => void;
}

const getAnnotationsArray = (annotations: any): Annotation[] => {
    if (Array.isArray(annotations)) {
        return annotations.filter(a => a && (a.highlightAreas || a.paths));
    }
    if (annotations && typeof annotations === 'object') {
        const annArray = Object.values(annotations).filter((a: any) => a && (a.highlightAreas || a.paths));
        return annArray as Annotation[];
    }
    return [];
};

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId, onPdfUpdate }) => {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => getAnnotationsArray(pdf.annotations));
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('highlight');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Drawing state
  const [drawColor, setDrawColor] = useState('rgba(255, 0, 0, 0.5)');
  const [drawOpacity, setDrawOpacity] = useState(0.5);
  const [drawWidth, setDrawWidth] = useState(5);


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
      {annotations
        .filter(ann => ann.type === 'highlight' && ann.pageIndex === props.pageIndex && ann.highlightAreas)
        .flatMap(ann => 
            ann.highlightAreas!.map((area, index) => (
                <Popover key={`${ann.id}-${index}`}>
                    <PopoverTrigger asChild>
                        <div
                            style={Object.assign(
                                {},
                                {
                                    background: 'yellow',
                                    opacity: 0.4,
                                },
                                props.getCssProperties(area, props.rotation)
                            )}
                            onClick={() => {
                                if (annotationMode === 'erase') {
                                    removeAnnotation(ann.id);
                                }
                            }}
                        />
                    </PopoverTrigger>
                    {annotationMode !== 'erase' && (
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
            ))
        )}
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
      if (annotationMode !== 'highlight') return;
      const newAnnotation: Annotation = {
        id: `${Date.now()}`,
        highlightAreas: areas,
        type: 'highlight',
        comment: '',
        pageIndex: areas[0].pageIndex,
        content: {
            text: areas.map(a => a.content.text).join(' '),
            image: '',
        },
      };
      addAnnotation(newAnnotation);
    },
  });

  const { getSelection } = highlightPluginInstance;

  const drawingPluginInstance = drawingPlugin({
    mode: annotationMode === 'draw' ? DrawingMode.Freehand : (annotationMode === 'erase' ? DrawingMode.Eraser : DrawingMode.None),
    callbacks: {
        onDrawingAdd: (props) => {
          const { pageIndex, drawing } = props;
          const newAnnotation: Annotation = {
            id: `${Date.now()}`,
            type: 'draw',
            pageIndex,
            paths: drawing.paths,
            comment: '',
            color: drawing.color,
            opacity: drawing.opacity,
            width: drawing.width,
          };
          addAnnotation(newAnnotation);
        },
        onDrawingErase: (props) => {
            const erasedAnnotationId = props.drawing.attributes?.annotationId;
            if (erasedAnnotationId) {
                removeAnnotation(erasedAnnotationId as string);
            }
        },
    },
    render: (props: RenderDrawingProps) => {
        const { pageIndex, canvasLayerRef, canvasEleRef } = props;
        const drawingAnnotations = annotations.filter(a => a.type === 'draw' && a.pageIndex === pageIndex);

        useEffect(() => {
            if (!canvasEleRef.current) return;
            const canvas = canvasEleRef.current;
            const context = canvas.getContext('2d');
            if (!context) return;
            context.clearRect(0, 0, canvas.width, canvas.height);

            drawingAnnotations.forEach(annotation => {
                if (!annotation.paths) return;
                context.beginPath();
                context.strokeStyle = annotation.color || 'rgba(255, 0, 0, 0.5)';
                context.lineWidth = annotation.width || 5;
                context.globalAlpha = annotation.opacity || 0.5;

                annotation.paths.forEach(path => {
                    if (path.points.length > 0) {
                        context.moveTo(path.points[0].x, path.points[0].y);
                        path.points.slice(1).forEach(p => context.lineTo(p.x, p.y));
                    }
                });
                context.stroke();
            });
        }, [drawingAnnotations, canvasEleRef, props.width, props.height]);

        return <></>;
    },
  });

  const { activateDrawingMode } = drawingPluginInstance;

  useEffect(() => {
    if (annotationMode === 'draw') {
        activateDrawingMode(DrawingMode.Freehand, {
            color: drawColor,
            opacity: drawOpacity,
            width: drawWidth,
        });
    } else if (annotationMode === 'erase') {
        activateDrawingMode(DrawingMode.Eraser);
    } else {
        activateDrawingMode(DrawingMode.None);
    }
  }, [annotationMode, drawColor, drawOpacity, drawWidth, activateDrawingMode]);

  const transform: TransformToolbarSlot = (slot: ToolbarProps) => ({
      ...slot,
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
    sidebarTabs: (defaultTabs) => [],
    transformToolbar: transform,
    highlightPluginInstance,
    drawingPluginInstance,
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
                        <Button variant={annotationMode === 'highlight' ? 'secondary' : 'ghost'} className="text-white hover:bg-gray-700" size="icon" onClick={() => setAnnotationMode('highlight')}>
                            <Highlighter className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Highlight Text</TooltipContent>
                </Tooltip>
                
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                          <Button variant={annotationMode === 'draw' ? 'secondary' : 'ghost'} className="text-white hover:bg-gray-700" size="icon" onClick={() => setAnnotationMode('draw')}>
                              <Edit className="h-5 w-5" />
                          </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Draw</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setDrawColor('rgba(255, 0, 0, 0.5)')}>Red</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDrawColor('rgba(0, 0, 255, 0.5)')}>Blue</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDrawColor('rgba(0, 255, 0, 0.5)')}>Green</DropdownMenuItem>
                     <DropdownMenuItem onSelect={() => setDrawWidth(5)}>Small Brush</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDrawWidth(10)}>Medium Brush</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDrawWidth(15)}>Large Brush</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant={annotationMode === 'erase' ? 'secondary' : 'ghost'} className="text-white hover:bg-gray-700" size="icon" onClick={() => setAnnotationMode('erase')}>
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
                    plugins={[layoutPlugin]}
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
