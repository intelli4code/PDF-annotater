
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PdfDocument, Annotation, AnnotationTool } from '@/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Trash2, Square, Circle, Triangle, Check, X, MousePointer2, Brush, Eraser, Save, XCircle, Loader2, Undo, Redo, ZoomIn, ZoomOut, Type, Palette
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
            if (cleanedAnn[K] === undefined || cleanedAnn[K] === null || K === 'isSelected') {
                delete cleanedAnn[K];
            }
        });
        return cleanedAnn;
    });
};

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId, onPdfUpdate }) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
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
    const currentAnns = history[historyIndex];
    const updatedAnnotations = typeof newAnnotations === 'function' ? newAnnotations(currentAnns) : newAnnotations;
    if (JSON.stringify(updatedAnnotations) === JSON.stringify(currentAnns)) return;

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
  
  const getCanvasAndCoords = (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>, pageIndex: number) => {
    const canvas = drawingCanvasRefs.current[pageIndex];
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;

    return { canvas, x, y, pageIndex, rect };
  }


  const handleMouseDown = (pageIndex: number, e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const eventData = getCanvasAndCoords(e, pageIndex);
    if (!eventData) return;
    const { x, y } = eventData;
    
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
      }
      return;
    }

    setIsDrawing(true);

    const baseAnnotation = { id: `${Date.now()}`, pageIndex, type: activeTool, color };

    if (activeTool === 'text') {
        const text = prompt("Enter text:");
        if (text) {
            const newAnnotation: Annotation = {
                ...baseAnnotation, x, y, text, fontSize: 16 / zoom, width: 0, height: 0,
            };
            setStateWithHistory(prev => [...prev, newAnnotation]);
        }
        setIsDrawing(false);
        return;
    }

    if (activeTool === 'check' || activeTool === 'cross') {
        const size = 20 / zoom;
        const newAnnotation: Annotation = {
            ...baseAnnotation, x: x - (size/2), y: y - (size/2), width: size, height: size,
        };
        setStateWithHistory(prev => [...prev, newAnnotation]);
        setIsDrawing(false);
        return;
    }
    
    const newAnnotation: Annotation = {
        ...baseAnnotation, x, y, width: 0, height: 0,
        path: activeTool === 'marker' ? [{x, y}] : undefined,
    };
    setStateWithHistory(prev => [...prev, newAnnotation]);
  };
  
  const handleMouseMove = (pageIndex: number, e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      const eventData = getCanvasAndCoords(e, pageIndex);
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
        const lastAnn = prev[prev.length - 1];
        if (ann.id === lastAnn.id) {
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
    const MARGIN = 5 / zoom;
    if (ann.type === 'marker' && ann.path) {
        const lineWidth = 5 / zoom;
        return ann.path.some((point, i) => {
            if (i === 0) return false;
            const prevPoint = ann.path[i - 1];
            // Simplified distance from point to line segment
            const dist = Math.abs((point.y - prevPoint.y) * x - (point.x - prevPoint.x) * y + point.x * prevPoint.y - point.y * prevPoint.x) / Math.sqrt(Math.pow(point.y - prevPoint.y, 2) + Math.pow(point.x - prevPoint.x, 2));
            
            const len = Math.sqrt(Math.pow(point.x-x,2) + Math.pow(point.y-y,2));
            if(len < lineWidth) return true

            if(dist < lineWidth){
                 const dot1 = (x - prevPoint.x) * (point.x - prevPoint.x) + (y - prevPoint.y) * (point.y - prevPoint.y);
                 const dot2 = (x - point.x) * (prevPoint.x - point.x) + (y - point.y) * (prevPoint.y - point.y);
                 if(dot1 >= 0 && dot2 >= 0) return true;
            }
            return false;
        });
    } else {
        const x1 = Math.min(ann.x, ann.x + ann.width);
        const x2 = Math.max(ann.x, ann.x + ann.width);
        const y1 = Math.min(ann.y, ann.y + ann.height);
        const y2 = Math.max(ann.y, ann.y + ann.height);
        return x >= x1 - MARGIN && x <= x2 + MARGIN && y >= y1 - MARGIN && y <= y2 + MARGIN;
    }
  }
  
  useEffect(() => {
    const updatedAnnotations = annotations.map(ann => ({...ann, isSelected: ann.id === selectedAnnotationId}));
    if (JSON.stringify(updatedAnnotations) !== JSON.stringify(annotations)) {
        setStateWithHistory(updatedAnnotations);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnnotationId]);


  return (
    <div className="flex h-screen w-full flex-col bg-gray-800">
      <AnnotationToolbar 
        activeTool={activeTool} setActiveTool={setActiveTool} color={color} setColor={setColor}
        onSave={handleSave} onClose={onClose} pdfName={pdf.name}
        onUndo={handleUndo} onRedo={handleRedo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1}
        zoom={zoom} onZoomIn={() => setZoom(z => Math.min(z + 0.2, 5))} onZoomOut={() => setZoom(z => Math.max(z - 0.2, 0.2))}
        onDelete={() => {
          if (selectedAnnotationId) {
            setStateWithHistory(prev => prev.filter(a => a.id !== selectedAnnotationId));
            setSelectedAnnotationId(null);
          }
        }}
        isAnnotationSelected={!!selectedAnnotationId}
      />
      {isLoading ? (
        <div className="flex-grow flex items-center justify-center text-white">
          <Loader2 className="h-12 w-12 animate-spin" /><span className="ml-4 text-xl">Loading Document...</span>
        </div>
      ) : (
        <div 
            ref={canvasContainerRef} 
            className="flex-grow overflow-auto p-4 bg-gray-600 space-y-4"
        >
          {pdfDoc && Array.from({ length: pdfDoc.numPages }).map((_, index) => (
            <PageCanvas key={index} pdfDoc={pdfDoc} pageIndex={index}
                annotations={annotations.filter(a => a.pageIndex === index)}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                activeTool={activeTool}
                drawingCanvasRef={el => drawingCanvasRefs.current[index] = el}
                zoom={zoom}
                isMoving={isMoving}
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
    onMouseDown: (pageIndex: number, e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
    onMouseMove: (pageIndex: number, e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
    onMouseUp: (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
    activeTool: AnnotationTool;
    drawingCanvasRef: (el: HTMLCanvasElement | null) => void;
    zoom: number;
    isMoving: boolean;
}

const PageCanvas: React.FC<PageCanvasProps> = React.memo(({ 
    pdfDoc, pageIndex, annotations, onMouseDown, onMouseMove, onMouseUp, activeTool, drawingCanvasRef, zoom, isMoving
}) => {
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const localDrawingCanvasRef = useRef<HTMLCanvasElement>(null);
    const renderTask = useRef<pdfjsLib.RenderTask | null>(null);

    const drawAnnotation = useCallback((ctx: CanvasRenderingContext2D, annotation: Annotation) => {
      const isSelected = annotation.isSelected;
      
      const { x, y, width: w, height: h, type, color, text, fontSize, path } = annotation;
      
      ctx.strokeStyle = isSelected ? '#00BFFF' : color;
      ctx.fillStyle = color;
      
      const zx = x * zoom;
      const zy = y * zoom;
      const zw = w * zoom;
      const zh = h * zoom;

      ctx.lineWidth = isSelected ? 1 : 2; 
      ctx.setLineDash(isSelected ? [6, 3] : []);
      
      switch (type) {
        case 'marker':
          if (!path || path.length === 0) return;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = (isSelected ? 6 : 5) / zoom;
          ctx.beginPath();
          path.forEach((point, index) => {
              const zPointX = point.x * zoom;
              const zPointY = point.y * zoom;
              index === 0 ? ctx.moveTo(zPointX, zPointY) : ctx.lineTo(zPointX, zPointY);
          });
          ctx.stroke();
          ctx.globalAlpha = 1.0;
          break;
        case 'square': 
          ctx.strokeRect(zx, zy, zw, zh); 
          if (isSelected) drawHandles(ctx, zx, zy, zw, zh);
          break;
        case 'circle':
          ctx.beginPath();
          ctx.ellipse(zx + zw / 2, zy + zh / 2, Math.abs(zw / 2), Math.abs(zh / 2), 0, 0, 2 * Math.PI);
          ctx.stroke();
          if (isSelected) drawHandles(ctx, zx, zy, zw, zh);
          break;
        case 'triangle':
            ctx.beginPath();
            ctx.moveTo(zx + zw / 2, zy); ctx.lineTo(zx, zy + zh); ctx.lineTo(zx + zw, zy + zh);
            ctx.closePath(); ctx.stroke();
            if (isSelected) drawHandles(ctx, zx, zy, zw, zh);
            break;
        case 'check':
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(zx, zy + zh/2); ctx.lineTo(zx + zw/2, zy + zh); ctx.lineTo(zx + zw, zy);
            ctx.stroke();
            break;
        case 'cross':
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(zx,zy); ctx.lineTo(zx+zw, zy+zh); ctx.moveTo(zx+zw, zy); ctx.lineTo(zx, zy+zh);
            ctx.stroke();
            break;
        case 'text':
            if (text && fontSize) {
                ctx.font = `${fontSize * zoom}px Arial`;
                ctx.fillText(text, zx, zy);
            }
            break;
      }

      ctx.setLineDash([]);
    }, [zoom]);

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
        const renderPage = async () => {
            if (renderTask.current) {
                renderTask.current.cancel();
                renderTask.current = null;
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
                }
            } catch (e: any) {
                if (e.name !== 'RenderingCancelledException') {
                    console.error('Page render error:', e);
                }
            }
        };

        const timeoutId = setTimeout(renderPage, 100); // Debounce rendering

        return () => {
            clearTimeout(timeoutId);
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
    }, [annotations, drawAnnotation, zoom]);

    useEffect(() => {
        if(localDrawingCanvasRef.current) drawingCanvasRef(localDrawingCanvasRef.current);
    }, [drawingCanvasRef]);

    const getCursor = () => {
        switch(activeTool) {
            case 'select': return isMoving ? 'grabbing' : 'grab';
            case 'eraser': return 'cell';
            case 'text': return 'text';
            default: return 'crosshair';
        }
    };

    return (
        <div 
            className="relative mx-auto shadow-lg"
            style={{ width: pdfCanvasRef.current?.width, height: pdfCanvasRef.current?.height }}
            onMouseDown={(e) => onMouseDown(pageIndex, e)} 
            onMouseMove={(e) => onMouseMove(pageIndex, e)}
            onMouseUp={onMouseUp} 
            onMouseLeave={onMouseUp}
            onTouchStart={(e) => onMouseDown(pageIndex, e)}
            onTouchMove={(e) => onMouseMove(pageIndex, e)}
            onTouchEnd={onMouseUp}
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
    onDelete: () => void;
    isAnnotationSelected: boolean;
}

const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({ 
    activeTool, setActiveTool, color, setColor, onSave, onClose, pdfName, 
    onUndo, onRedo, canUndo, canRedo, zoom, onZoomIn, onZoomOut,
    onDelete, isAnnotationSelected
}) => {
  const isMobile = useIsMobile();
  const tools: { name: AnnotationTool, icon: React.ElementType, isShape: boolean }[] = [
    { name: 'select', icon: MousePointer2, isShape: false }, 
    { name: 'marker', icon: Brush, isShape: false },
    { name: 'text', icon: Type, isShape: false },
    { name: 'square', icon: Square, isShape: true }, 
    { name: 'circle', icon: Circle, isShape: true },
    { name: 'triangle', icon: Triangle, isShape: true }, 
    { name: 'check', icon: Check, isShape: true },
    { name: 'cross', icon: X, isShape: true },
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
          
          <Tooltip>
            <TooltipTrigger asChild>
                <Button variant={activeTool === 'eraser' ? 'secondary' : 'ghost'} size='icon' className="text-white hover:bg-gray-700" onClick={() => setActiveTool('eraser')} >
                     <Eraser className="h-5 w-5" />
                </Button>
            </TooltipTrigger>
            <TooltipContent><p>Eraser</p></TooltipContent>
          </Tooltip>
          
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 p-0 border-none bg-transparent cursor-pointer" title="Select color"/>
          
          { isAnnotationSelected && 
             <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant='ghost' size='icon' className="text-red-500 hover:bg-red-700" onClick={onDelete}>
                        <Trash2 className="h-5 w-5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Delete</p></TooltipContent>
            </Tooltip>
          }
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

    