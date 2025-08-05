
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PdfDocument, Annotation, AnnotationTool } from '@/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Square,
  Circle,
  Triangle,
  Check,
  X,
  MousePointer2,
  Brush,
  Eraser,
  Save,
  Download,
  XCircle,
  Loader2,
  FileJson,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
  onPdfUpdate: (pdf: PdfDocument) => void;
}

const cleanAnnotationsForFirebase = (annotations: Annotation[]): Annotation[] => {
    return annotations.map(ann => {
        const cleanedAnn: any = { ...ann };
        Object.keys(cleanedAnn).forEach(key => {
            if (cleanedAnn[key] === undefined) {
                delete cleanedAnn[key];
            }
        });
        return cleanedAnn as Annotation;
    });
};


const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId, onPdfUpdate }) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('marker');
  const [color, setColor] = useState('#FF0000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(1.5);

  const [history, setHistory] = useState<Annotation[][]>([pdf.annotations || []]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const annotations = history[historyIndex];

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});
  const { toast } = useToast();

  const setStateWithHistory = (newAnnotations: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
    const updatedAnnotations = typeof newAnnotations === 'function' ? newAnnotations(annotations) : newAnnotations;
    
    // If the new state is the same as the current one, do nothing.
    if (JSON.stringify(updatedAnnotations) === JSON.stringify(annotations)) {
        return;
    }

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(updatedAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };
  
  const handleUndo = () => {
    if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          setHistoryIndex(historyIndex + 1);
      }
  };


  useEffect(() => {
    const loadPdf = async () => {
      setIsLoading(true);
      try {
        const loadingTask = pdfjsLib.getDocument(pdf.url);
        const loadedPdfDoc = await loadingTask.promise;
        setPdfDoc(loadedPdfDoc);
      } catch (error) {
        console.error('Error loading PDF:', error);
        toast({
          variant: 'destructive',
          title: 'Failed to load PDF',
          description: 'The document could not be loaded.',
        });
      } finally {
        setIsLoading(false);
      }
    };
    loadPdf();
  }, [pdf.url, toast]);
  
  const saveAnnotations = useCallback(async (currentAnnotations: Annotation[]) => {
    try {
        const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
        const annotationsToSave = cleanAnnotationsForFirebase(currentAnnotations);
        await updateDoc(doc(db, pdfDocPath), { annotations: annotationsToSave });
        const updatedPdf = { ...pdf, annotations: currentAnnotations };
        onPdfUpdate(updatedPdf); // This will update parent state
    } catch (e: any) {
        console.error('Save failed:', e);
        toast({
            variant: 'destructive',
            title: 'Save Failed',
            description: e.message || 'An unexpected error occurred while saving annotations.',
        });
    }
  }, [appId, userId, pdf, toast, onPdfUpdate]);

  const handleSave = () => {
    saveAnnotations(annotations);
    toast({
        title: "Annotations Saved",
        description: "Your annotations have been successfully saved to the cloud."
    });
  };

  const getRelativeCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = drawingCanvasRefs.current[parseInt(e.currentTarget.dataset.pageIndex || '0', 10)];
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'select' || activeTool === 'eraser') return;
    setIsDrawing(true);
    const { x, y } = getRelativeCoords(e);
    
    const newAnnotation: Annotation = {
        id: `${Date.now()}`,
        pageIndex,
        type: activeTool,
        color,
        x, y, width: 0, height: 0,
        path: activeTool === 'marker' ? [{x, y}] : undefined,
    };
    setStateWithHistory(prev => [...prev, newAnnotation]);
  };
  
  const handleMouseMove = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const { x, y } = getRelativeCoords(e);
    
    setStateWithHistory(prev => prev.map(ann => {
        if (ann.id === prev[prev.length - 1].id) {
            if (ann.type === 'marker' && ann.path) {
                return { ...ann, path: [...ann.path, {x, y}]};
            }
            return { ...ann, width: x - ann.x, height: y - ann.y };
        }
        return ann;
    }));
  };
  
  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      // Automatically save on mouse up
      saveAnnotations(history[history.length - 1]);
    }
  };
  
  const isPointInRect = (x: number, y: number, ann: Annotation) => {
    const MARGIN = 5; // 5px margin
    const x1 = Math.min(ann.x, ann.x + ann.width);
    const x2 = Math.max(ann.x, ann.x + ann.width);
    const y1 = Math.min(ann.y, ann.y + ann.height);
    const y2 = Math.max(ann.y, ann.y + ann.height);
    return x >= x1 - MARGIN && x <= x2 + MARGIN && y >= y1 - MARGIN && y <= y2 + MARGIN;
  };

  const isPointOnPath = (x: number, y: number, path: {x:number, y:number}[]) => {
      const MARGIN = 5; // 5px margin
      return path.some(point => 
          Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2)) <= MARGIN
      );
  };

  const handleEraserClick = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
      if (activeTool !== 'eraser') return;
      const { x, y } = getRelativeCoords(e);

      let annotationToDeleteId: string | null = null;
      
      const pageAnnotations = annotations.filter(ann => ann.pageIndex === pageIndex);

      for (let i = pageAnnotations.length - 1; i >= 0; i--) {
        const ann = pageAnnotations[i];
        if (ann.type === 'marker' && ann.path && isPointOnPath(x, y, ann.path)) {
            annotationToDeleteId = ann.id;
            break;
        } else if (isPointInRect(x, y, ann)) {
            annotationToDeleteId = ann.id;
            break;
        }
      }
      
      if (annotationToDeleteId) {
          const newAnnotations = annotations.filter(ann => ann.id !== annotationToDeleteId);
          setStateWithHistory(newAnnotations);
          saveAnnotations(newAnnotations);
      }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-gray-800">
      <AnnotationToolbar 
        activeTool={activeTool} 
        setActiveTool={setActiveTool} 
        color={color} 
        setColor={setColor}
        onSave={handleSave}
        onClose={onClose}
        pdfName={pdf.name}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(z + 0.2, 3))}
        onZoomOut={() => setZoom(z => Math.max(z - 0.2, 0.5))}
      />
      {isLoading ? (
        <div className="flex-grow flex items-center justify-center text-white">
          <Loader2 className="h-12 w-12 animate-spin" />
          <span className="ml-4 text-xl">Loading Document...</span>
        </div>
      ) : (
        <div ref={canvasContainerRef} className="flex-grow overflow-auto p-4 bg-gray-600 space-y-4">
          {pdfDoc && Array.from({ length: pdfDoc.numPages }).map((_, index) => (
            <PageCanvas 
                key={index}
                pdfDoc={pdfDoc}
                pageIndex={index}
                annotations={annotations.filter(a => a.pageIndex === index)}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onEraserClick={handleEraserClick}
                activeTool={activeTool}
                drawingCanvasRef={el => drawingCanvasRefs.current[index] = el}
                zoom={zoom}
            />
          ))}
        </div>
      )}
    </div>
  );
};


interface PageCanvasProps {
    pdfDoc: pdfjsLib.PDFDocumentProxy;
    pageIndex: number;
    annotations: Annotation[];
    onMouseDown: (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseMove: (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseUp: () => void;
    onEraserClick: (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => void;
    activeTool: AnnotationTool;
    drawingCanvasRef: (el: HTMLCanvasElement | null) => void;
    zoom: number;
}

const PageCanvas: React.FC<PageCanvasProps> = ({ 
    pdfDoc, 
    pageIndex, 
    annotations, 
    onMouseDown, 
    onMouseMove, 
    onMouseUp, 
    onEraserClick,
    activeTool,
    drawingCanvasRef,
    zoom
}) => {
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const localDrawingCanvasRef = useRef<HTMLCanvasElement>(null);
    const renderTask = useRef<pdfjsLib.RenderTask | null>(null);

    const drawAnnotation = useCallback((ctx: CanvasRenderingContext2D, annotation: Annotation, currentZoom: number) => {
      ctx.strokeStyle = annotation.color;
      ctx.fillStyle = annotation.color;
      ctx.lineWidth = 2 * currentZoom;

      const x = annotation.x;
      const y = annotation.y;
      const w = annotation.width;
      const h = annotation.height;

      switch (annotation.type) {
        case 'marker':
          if (!annotation.path || annotation.path.length === 0) return;
          ctx.beginPath();
          annotation.path.forEach((point, index) => {
            if (index === 0) {
              ctx.moveTo(point.x, point.y);
            } else {
              ctx.lineTo(point.x, point.y);
            }
          });
          ctx.stroke();
          break;
        case 'square':
          ctx.strokeRect(x, y, w, h);
          break;
        case 'circle':
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
          ctx.stroke();
          break;
        case 'triangle':
            ctx.beginPath();
            ctx.moveTo(x + w / 2, y);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x + w, y + h);
            ctx.closePath();
            ctx.stroke();
            break;
        case 'check':
            ctx.beginPath();
            ctx.moveTo(x, y + h/2);
            ctx.lineTo(x + w/2, y + h);
            ctx.lineTo(x + w, y);
            ctx.stroke();
            break;
        case 'cross':
            ctx.beginPath();
            ctx.moveTo(x,y);
            ctx.lineTo(x+w, y+h);
            ctx.moveTo(x+w, y);
            ctx.lineTo(x, y+h);
            ctx.stroke();
            break;

      }
    }, []);

    useEffect(() => {
        const renderPage = async () => {
            if (renderTask.current) {
                renderTask.current.cancel();
            }

            const pdfCanvas = pdfCanvasRef.current;
            const drawingCanvas = localDrawingCanvasRef.current;
            if (!pdfCanvas || !drawingCanvas) return;

            const page = await pdfDoc.getPage(pageIndex + 1);
            const viewport = page.getViewport({ scale: zoom });

            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            drawingCanvas.height = viewport.height;
            drawingCanvas.width = viewport.width;

            const pdfContext = pdfCanvas.getContext('2d');
            if (pdfContext) {
                const newRenderTask = page.render({ canvasContext: pdfContext, viewport });
                renderTask.current = newRenderTask;
                await newRenderTask.promise;
            }
        };

        renderPage();

        // Cleanup function
        return () => {
            if (renderTask.current) {
                renderTask.current.cancel();
            }
        };
    }, [pdfDoc, pageIndex, zoom]);
    
    useEffect(() => {
      const drawingCanvas = localDrawingCanvasRef.current;
      if (!drawingCanvas) return;
      
      const ctx = drawingCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        annotations.forEach(a => drawAnnotation(ctx, a, zoom));
      }

    }, [annotations, drawAnnotation, zoom]);

    // Pass the ref up to the parent
    useEffect(() => {
        if(localDrawingCanvasRef.current) {
            drawingCanvasRef(localDrawingCanvasRef.current);
        }
    }, [drawingCanvasRef]);


    const getCursor = () => {
        if (activeTool === 'select') return 'default';
        if (activeTool === 'eraser') return 'crosshair'; // Or a custom eraser cursor
        return 'crosshair';
    };


    return (
        <div 
            className="relative mx-auto shadow-lg"
            style={{ 
                width: pdfCanvasRef.current?.width, 
                height: pdfCanvasRef.current?.height,
                cursor: getCursor(),
            }}
            onMouseDown={(e) => onMouseDown(pageIndex, e)}
            onMouseMove={(e) => onMouseMove(pageIndex, e)}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp} // Stop drawing if mouse leaves canvas area
            onClick={(e) => onEraserClick(pageIndex, e)}
            data-page-index={pageIndex}
        >
            <canvas ref={pdfCanvasRef} />
            <canvas
                ref={localDrawingCanvasRef}
                className="absolute top-0 left-0"
            />
        </div>
    );
};


interface AnnotationToolbarProps {
    activeTool: AnnotationTool;
    setActiveTool: (tool: AnnotationTool) => void;
    color: string;
    setColor: (color: string) => void;
    onSave: () => void;
    onClose: () => void;
    pdfName: string;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    zoom: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
}

const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({ 
    activeTool, setActiveTool, color, setColor, 
    onSave, onClose, pdfName, 
    onUndo, onRedo, canUndo, canRedo,
    zoom, onZoomIn, onZoomOut
}) => {
  const tools: { name: AnnotationTool, icon: React.ElementType }[] = [
    { name: 'select', icon: MousePointer2 },
    { name: 'marker', icon: Brush },
    { name: 'square', icon: Square },
    { name: 'circle', icon: Circle },
    { name: 'triangle', icon: Triangle },
    { name: 'check', icon: Check },
    { name: 'cross', icon: X },
    { name: 'eraser', icon: Eraser },
  ];

  return (
    <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between w-full flex-shrink-0 z-20 shadow-md">
      <h2 className="text-lg font-semibold truncate max-w-xs">{pdfName}</h2>
      
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={onUndo} disabled={!canUndo}><Undo className="h-5 w-5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={onRedo} disabled={!canRedo}><Redo className="h-5 w-5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-6 bg-gray-600 mx-2" />
          
          {tools.map(tool => (
            <Tooltip key={tool.name}>
              <TooltipTrigger asChild>
                <Button
                  variant={activeTool === tool.name ? 'secondary' : 'ghost'}
                  className="text-white hover:bg-gray-700"
                  size="icon"
                  onClick={() => setActiveTool(tool.name)}
                >
                  <tool.icon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tool.name.charAt(0).toUpperCase() + tool.name.slice(1)}</TooltipContent>
            </Tooltip>
          ))}
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-8 h-8 p-0 border-none bg-transparent cursor-pointer"
            title="Select color"
          />
        </TooltipProvider>
      </div>
      
      <div className="flex items-center gap-2">
         <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700" onClick={onZoomOut}>
                <ZoomOut className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <span className="text-sm font-mono w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
          <Tooltip>
            <TooltipTrigger asChild>
               <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700" onClick={onZoomIn}>
                <ZoomIn className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="w-px h-6 bg-gray-600 mx-2" />

        <Button variant="outline" className="text-white border-gray-500" onClick={onSave}><Save className="mr-2" /> Save</Button>
        <Button onClick={onClose} variant="destructive"><XCircle className="mr-2 h-5 w-5" /> Done</Button>
      </div>
    </div>
  );
};


export default PdfViewer;
