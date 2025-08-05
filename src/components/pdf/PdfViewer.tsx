
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PdfDocument, Annotation, AnnotationTool } from '@/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Square, Circle, Triangle, Check, X, MousePointer2, Brush, Eraser, Save, XCircle, Loader2, Undo, Redo, ZoomIn, ZoomOut, Type, Palette
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from '@/hooks/use-mobile';


pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
  onPdfUpdate: (pdf: PdfDocument) => void;
}

const cleanAnnotationsForFirebase = (annotations: Annotation[]): any[] => {
    return annotations.map(ann => {
        const cleanedAnn: any = { ...ann };
        Object.keys(cleanedAnn).forEach(key => {
            const K = key as keyof Annotation;
            if (cleanedAnn[K] === undefined || K === 'isSelected') {
                delete cleanedAnn[K];
            }
        });
        return cleanedAnn;
    });
};

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId, onPdfUpdate }) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('marker');
  const [color, setColor] = useState('#FF0000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(1.0);

  const [history, setHistory] = useState<Annotation[][]>([pdf.annotations || []]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const annotations = history[historyIndex];

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});
  const { toast } = useToast();
  
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [moveStartPoint, setMoveStartPoint] = useState<{x: number, y: number} | null>(null);


  const setStateWithHistory = useCallback((newAnnotations: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
    const updatedAnnotations = typeof newAnnotations === 'function' ? newAnnotations(annotations) : newAnnotations;
    if (JSON.stringify(updatedAnnotations) === JSON.stringify(annotations)) return;

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(updatedAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [annotations, history, historyIndex]);
  
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
  }, [historyIndex]);

  const handleRedo = useCallback(() => {
      if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1);
  }, [historyIndex, history.length]);

  useEffect(() => {
    const loadPdf = async () => {
      setIsLoading(true);
      try {
        const loadingTask = pdfjsLib.getDocument(pdf.url);
        const loadedPdfDoc = await loadingTask.promise;
        setPdfDoc(loadedPdfDoc);

        const page = await loadedPdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        if (canvasContainerRef.current) {
            const containerWidth = canvasContainerRef.current.clientWidth;
            setZoom(containerWidth / viewport.width);
        }

      } catch (error) {
        console.error('Error loading PDF:', error);
        toast({ variant: 'destructive', title: 'Failed to load PDF' });
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
        onPdfUpdate(updatedPdf);
    } catch (e: any) {
        console.error('Save failed:', e);
        toast({ variant: 'destructive', title: 'Save Failed', description: e.message });
    }
  }, [appId, userId, pdf, toast, onPdfUpdate]);

  const handleSave = useCallback(() => {
    saveAnnotations(annotations);
    toast({ title: "Annotations Saved" });
  }, [annotations, saveAnnotations, toast]);
  
  const getCanvasAndCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const pageIndex = parseInt(e.currentTarget.dataset.pageIndex || '0', 10);
    const canvas = drawingCanvasRefs.current[pageIndex];
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    return { canvas, x, y, pageIndex, rect };
  }


  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const eventData = getCanvasAndCoords(e);
    if (!eventData) return;
    const { canvas, x, y, pageIndex } = eventData;
    
    // Deselect annotations when clicking away
    if (activeTool !== 'select') {
        setSelectedAnnotationId(null);
    }

    if (activeTool === 'select') {
        const clickedAnnotation = getAnnotationAtPoint(x, y, pageIndex);
        if (clickedAnnotation) {
            setSelectedAnnotationId(clickedAnnotation.id);
            setIsMoving(true);
            setMoveStartPoint({x, y});
        } else {
            setSelectedAnnotationId(null);
        }
        return;
    }

    if (activeTool === 'eraser') {
      const clickedAnnotation = getAnnotationAtPoint(x, y, pageIndex);
      if (clickedAnnotation) {
        const newAnnotations = annotations.filter(ann => ann.id !== clickedAnnotation.id);
        setStateWithHistory(newAnnotations);
        saveAnnotations(newAnnotations);
      }
      return;
    }

    setIsDrawing(true);

    const baseAnnotation = { id: `${Date.now()}`, pageIndex, type: activeTool, color };

    if (activeTool === 'text') {
        const text = prompt("Enter text:");
        if (text) {
            const newAnnotation: Annotation = {
                ...baseAnnotation, x, y, text, fontSize: 16 * zoom, width: 0, height: 0,
            };
            const newAnns = [...annotations, newAnnotation];
            setStateWithHistory(newAnns);
            saveAnnotations(newAnns);
        }
        setIsDrawing(false);
        return;
    }

    if (activeTool === 'check' || activeTool === 'cross') {
        const size = 20; // fixed size regardless of zoom
        const newAnnotation: Annotation = {
            ...baseAnnotation, x: x - (size/2), y: y - (size/2), width: size, height: size,
        };
        const newAnns = [...annotations, newAnnotation];
        setStateWithHistory(newAnns);
        saveAnnotations(newAnns);
        setIsDrawing(false);
        return;
    }
    
    const newAnnotation: Annotation = {
        ...baseAnnotation, x, y, width: 0, height: 0,
        path: activeTool === 'marker' ? [{x, y}] : undefined,
    };
    setStateWithHistory(prev => [...prev, newAnnotation]);
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      const eventData = getCanvasAndCoords(e);
      if (!eventData) return;
      const { x, y } = eventData;

      if (isMoving && selectedAnnotationId && moveStartPoint) {
          const dx = x - moveStartPoint.x;
          const dy = y - moveStartPoint.y;
          
          setStateWithHistory(prev => prev.map(ann => {
              if (ann.id === selectedAnnotationId) {
                  const newAnn = { ...ann, x: ann.x + dx, y: ann.y + dy };
                  if (newAnn.path) {
                    newAnn.path = newAnn.path.map(p => ({ x: p.x + dx, y: p.y + dy }));
                  }
                  return newAnn;
              }
              return ann;
          }));
          setMoveStartPoint({x,y});
          return;
      }
    
    if (!isDrawing) return;
    
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
  
  const handleMouseUp = useCallback(() => {
    if (isDrawing || isMoving) {
      setIsDrawing(false);
      setIsMoving(false);
      setMoveStartPoint(null);
      saveAnnotations(history[historyIndex]);
    }
  }, [isDrawing, isMoving, history, historyIndex, saveAnnotations]);
  
  const getAnnotationAtPoint = (x: number, y: number, pageIndex: number): Annotation | null => {
    const pageAnnotations = annotations.filter(ann => ann.pageIndex === pageIndex).reverse(); // LIFO
    for (const ann of pageAnnotations) {
      if (isPointInAnnotation(x, y, ann)) return ann;
    }
    return null;
  }

  const isPointInAnnotation = (x: number, y: number, ann: Annotation): boolean => {
    const MARGIN = 5 * zoom;
    if (ann.type === 'marker' && ann.path) {
        return ann.path.some(point => Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2)) <= MARGIN);
    } else {
        const x1 = Math.min(ann.x, ann.x + ann.width);
        const x2 = Math.max(ann.x, ann.x + ann.width);
        const y1 = Math.min(ann.y, ann.y + ann.height);
        const y2 = Math.max(ann.y, ann.y + ann.height);
        return x >= x1 - MARGIN && x <= x2 + MARGIN && y >= y1 - MARGIN && y <= y2 + MARGIN;
    }
  }
  
  useEffect(() => {
    setStateWithHistory(prev => prev.map(ann => ({...ann, isSelected: ann.id === selectedAnnotationId})));
  }, [selectedAnnotationId, setStateWithHistory]);


  return (
    <div className="flex h-screen w-full flex-col bg-gray-800">
      <AnnotationToolbar 
        activeTool={activeTool} setActiveTool={setActiveTool} color={color} setColor={setColor}
        onSave={handleSave} onClose={onClose} pdfName={pdf.name}
        onUndo={handleUndo} onRedo={handleRedo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1}
        zoom={zoom} onZoomIn={() => setZoom(z => Math.min(z + 0.2, 5))} onZoomOut={() => setZoom(z => Math.max(z - 0.2, 0.2))}
      />
      {isLoading ? (
        <div className="flex-grow flex items-center justify-center text-white">
          <Loader2 className="h-12 w-12 animate-spin" /><span className="ml-4 text-xl">Loading Document...</span>
        </div>
      ) : (
        <div 
            ref={canvasContainerRef} 
            className="flex-grow overflow-auto p-4 bg-gray-600 space-y-4"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
          {pdfDoc && Array.from({ length: pdfDoc.numPages }).map((_, index) => (
            <PageCanvas key={index} pdfDoc={pdfDoc} pageIndex={index}
                annotations={annotations.filter(a => a.pageIndex === index)}
                onMouseDown={handleMouseDown}
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
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    activeTool: AnnotationTool;
    drawingCanvasRef: (el: HTMLCanvasElement | null) => void;
    zoom: number;
}

const PageCanvas: React.FC<PageCanvasProps> = React.memo(({ 
    pdfDoc, pageIndex, annotations, onMouseDown, activeTool, drawingCanvasRef, zoom
}) => {
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const localDrawingCanvasRef = useRef<HTMLCanvasElement>(null);
    const renderTask = useRef<pdfjsLib.RenderTask | null>(null);

    const drawAnnotation = useCallback((ctx: CanvasRenderingContext2D, annotation: Annotation) => {
      const isSelected = annotation.isSelected;
      ctx.strokeStyle = isSelected ? '#00BFFF' : annotation.color;
      ctx.fillStyle = annotation.color;
      
      // Use original PDF page dimensions for scaling
      const pdfPage = pdfDoc.getPage(pageIndex + 1);
      const viewport = pdfPage.then(page => page.getViewport({ scale: zoom }));

      viewport.then(vp => {
        const { x, y, width: w, height: h, type } = annotation;
        
        ctx.lineWidth = 2; // Keep line width consistent
        if (isSelected) {
            ctx.setLineDash([6, 3]);
            ctx.lineWidth = 1;
        } else {
            ctx.setLineDash([]);
            ctx.lineWidth = 2;
        }

        switch (type) {
          case 'marker':
            if (!annotation.path || annotation.path.length === 0) return;
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 5 * zoom;
            ctx.beginPath();
            annotation.path.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            break;
          case 'square': 
            ctx.strokeRect(x, y, w, h); 
            if (isSelected) drawHandles(ctx, x, y, w, h);
            break;
          case 'circle':
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
            ctx.stroke();
            if (isSelected) drawHandles(ctx, x, y, w, h);
            break;
          case 'triangle':
              ctx.beginPath();
              ctx.moveTo(x + w / 2, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h);
              ctx.closePath(); ctx.stroke();
              if (isSelected) drawHandles(ctx, x, y, w, h);
              break;
          case 'check':
              ctx.strokeStyle = annotation.color;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(x, y + h/2); ctx.lineTo(x + w/2, y + h); ctx.lineTo(x + w, y);
              ctx.stroke();
              break;
          case 'cross':
              ctx.strokeStyle = annotation.color;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(x,y); ctx.lineTo(x+w, y+h); ctx.moveTo(x+w, y); ctx.lineTo(x, y+h);
              ctx.stroke();
              break;
          case 'text':
              if (annotation.text && annotation.fontSize) {
                  ctx.font = `${annotation.fontSize * zoom}px Arial`;
                  ctx.fillText(annotation.text, x, y);
              }
              break;
        }

        ctx.setLineDash([]);
      });
    }, [zoom, pdfDoc, pageIndex]);

    const drawHandles = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        const size = 8;
        const handleOffset = size / 2;

        const handles = [
            { x: x - handleOffset, y: y - handleOffset },
            { x: x + w - handleOffset, y: y - handleOffset },
            { x: x - handleOffset, y: y + h - handleOffset },
            { x: x + w - handleOffset, y: y + h - handleOffset },
        ];
        
        handles.forEach(handle => {
            ctx.fillRect(handle.x, handle.y, size, size);
            ctx.strokeRect(handle.x, handle.y, size, size);
        });
    }

    useEffect(() => {
        let isCancelled = false;
        const renderPage = async () => {
            if (renderTask.current) {
                renderTask.current.cancel();
            }

            const pdfCanvas = pdfCanvasRef.current;
            const drawingCanvas = localDrawingCanvasRef.current;
            if (!pdfCanvas || !drawingCanvas || !pdfDoc) return;

            try {
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
                    if(isCancelled) return;
                }
            } catch (e: any) {
                if (e.name !== 'RenderingCancelledException') {
                    console.error('Page render error:', e);
                }
            } finally {
                if (!isCancelled) {
                    renderTask.current = null;
                }
            }
        };
        renderPage();
        return () => {
            isCancelled = true;
            if (renderTask.current) {
                renderTask.current.cancel();
                renderTask.current = null;
            }
        };
    }, [pdfDoc, pageIndex, zoom]);
    
    useEffect(() => {
      const drawingCanvas = localDrawingCanvasRef.current;
      if (!drawingCanvas) return;
      const ctx = drawingCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        annotations.forEach(a => drawAnnotation(ctx, a));
      }
    }, [annotations, drawAnnotation, zoom, pdfDoc]);

    useEffect(() => {
        if(localDrawingCanvasRef.current) drawingCanvasRef(localDrawingCanvasRef.current);
    }, [drawingCanvasRef]);

    const getCursor = () => {
        if (activeTool === 'select') return 'grab';
        if (activeTool === 'eraser') return 'cell';
        if (activeTool === 'text') return 'text';
        return 'crosshair';
    };

    return (
        <div 
            className="relative mx-auto shadow-lg"
            style={{ width: pdfCanvasRef.current?.width, height: pdfCanvasRef.current?.height }}
            onMouseDown={onMouseDown}
            data-page-index={pageIndex}
        >
            <canvas ref={pdfCanvasRef} style={{cursor: getCursor()}} />
            <canvas ref={localDrawingCanvasRef} className="absolute top-0 left-0" style={{cursor: getCursor()}} />
        </div>
    );
});
PageCanvas.displayName = 'PageCanvas';

interface AnnotationToolbarProps {
    activeTool: AnnotationTool;
    setActiveTool: (tool: AnnotationTool) => void;
    color: string;
    setColor: (color: string) => void;
    onSave: () => void; onClose: () => void; pdfName: string;
    onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
    zoom: number; onZoomIn: () => void; onZoomOut: () => void;
}

const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({ 
    activeTool, setActiveTool, color, setColor, onSave, onClose, pdfName, 
    onUndo, onRedo, canUndo, canRedo, zoom, onZoomIn, onZoomOut
}) => {
  const isMobile = useIsMobile();
  const tools: { name: AnnotationTool, icon: React.ElementType }[] = [
    { name: 'select', icon: MousePointer2 }, { name: 'marker', icon: Brush },
    { name: 'square', icon: Square }, { name: 'circle', icon: Circle },
    { name: 'triangle', icon: Triangle }, { name: 'check', icon: Check },
    { name: 'cross', icon: X }, { name: 'text', icon: Type },
    { name: 'eraser', icon: Eraser },
  ];

  const renderTools = () => (
    tools.map(tool => {
        const button = (
            <Button key={tool.name} variant={activeTool === tool.name ? 'secondary' : 'ghost'}
                className="text-white hover:bg-gray-700" size="icon" onClick={() => setActiveTool(tool.name)}>
                <tool.icon className="h-5 w-5" />
            </Button>
        );
        return (
            <Tooltip key={tool.name}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent><p>{tool.name.charAt(0).toUpperCase() + tool.name.slice(1)}</p></TooltipContent>
            </Tooltip>
        );
    })
  );

  return (
    <div className="bg-gray-900 text-white px-2 sm:px-4 py-2 flex items-center justify-between w-full flex-shrink-0 z-20 shadow-md flex-wrap gap-y-2">
      <h2 className="text-lg font-semibold truncate max-w-[150px] sm:max-w-xs order-1">{pdfName}</h2>
      
      <div className="flex items-center gap-1 sm:gap-2 order-3 sm:order-2 w-full sm:w-auto justify-center">
        <TooltipProvider>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={onUndo} disabled={!canUndo}><Undo className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent>Undo</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" className="text-white hover:bg-gray-700" size="icon" onClick={onRedo} disabled={!canRedo}><Redo className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent>Redo</TooltipContent></Tooltip>
          <div className="w-px h-6 bg-gray-600 mx-1 sm:mx-2" />
          
          {isMobile ? (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="text-white hover:bg-gray-700" size="icon"><Palette className="h-5 w-5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-gray-800 text-white border-gray-700">
                    <div className="grid grid-cols-4 gap-1 p-2">
                        {renderTools()}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
          ) : renderTools() }

          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 p-0 border-none bg-transparent cursor-pointer" title="Select color"/>
        </TooltipProvider>
      </div>
      
      <div className="flex items-center gap-1 sm:gap-2 order-2 sm:order-3">
         <TooltipProvider>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="text-white hover:bg-gray-700" onClick={onZoomOut}><ZoomOut className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent>Zoom Out</TooltipContent></Tooltip>
            <span className="text-sm font-mono w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="text-white hover:bg-gray-700" onClick={onZoomIn}><ZoomIn className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent>Zoom In</TooltipContent></Tooltip>
        </TooltipProvider>
        <div className="w-px h-6 bg-gray-600 mx-1 sm:mx-2" />
        <Button variant="outline" className="text-white border-gray-500 hover:bg-gray-700" onClick={onSave} size={isMobile ? 'icon' : 'default'}><Save className={isMobile ? "h-5 w-5" : "mr-2 h-4 w-4"}/><span className="hidden sm:inline">Save</span></Button>
        <Button onClick={onClose} variant="destructive" size={isMobile ? 'icon' : 'default'}><XCircle className={isMobile ? "h-5 w-5" : "mr-2 h-5 w-5"}/><span className="hidden sm:inline">Done</span></Button>
      </div>
    </div>
  );
};

export default PdfViewer;

    
