
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PdfDocument, Annotation, AnnotationTool } from '@/types';
import { db, supabase } from '@/lib/firebase';
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

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId, onPdfUpdate }) => {
  const [pages, setPages] = useState<any[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>(pdf.annotations || []);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('marker');
  const [color, setColor] = useState('#FF0000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRef = useRef<{ [key: number]: HTMLCanvasElement | null }>({});
  const { toast } = useToast();

  const renderPdf = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadingTask = pdfjsLib.getDocument(pdf.url);
      const pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;
      const pagesArray = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        pagesArray.push(page);
      }
      setPages(pagesArray);
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
  }, [pdf.url, toast]);

  useEffect(() => {
    renderPdf();
  }, [renderPdf]);

  const saveAnnotations = useCallback(async (newAnnotations: Annotation[]) => {
    try {
      const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
      const annotationsToSave = newAnnotations.map(ann => ({ ...ann }));
      await updateDoc(doc(db, pdfDocPath), { annotations: annotationsToSave });
      onPdfUpdate({ ...pdf, annotations: newAnnotations });
    } catch (e: any) {
      console.error('Save failed:', e);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'An unexpected error occurred while saving annotations.',
      });
    }
  }, [appId, userId, pdf.id, toast, onPdfUpdate, pdf]);
  
  const handleSave = () => {
    saveAnnotations(annotations);
    toast({
        title: "Annotations Saved",
        description: "Your annotations have been successfully saved to the cloud."
    });
  };

  const drawAnnotation = useCallback((ctx: CanvasRenderingContext2D, annotation: Annotation) => {
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = 2;

    switch (annotation.type) {
      case 'marker':
        ctx.beginPath();
        annotation.path?.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.stroke();
        break;
      case 'square':
        ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(annotation.x + annotation.width/2, annotation.y + annotation.height/2, Math.abs(annotation.width)/2, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      // Other shapes would go here
    }
  }, []);

  const redrawAllAnnotations = useCallback(() => {
    Object.entries(drawingCanvasRef.current).forEach(([pageIndexStr, canvas]) => {
        const pageIndex = parseInt(pageIndexStr, 10);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                annotations
                    .filter(a => a.pageIndex === pageIndex)
                    .forEach(a => drawAnnotation(ctx, a));
            }
        }
    });
  }, [annotations, drawAnnotation]);


  useEffect(() => {
    redrawAllAnnotations();
  }, [redrawAllAnnotations]);
  
  
  const handleMouseDown = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'select' || activeTool === 'eraser') return;
    
    const canvas = drawingCanvasRef.current[pageIndex];
    if (!canvas) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newAnnotation: Annotation = {
        id: `${Date.now()}`,
        pageIndex,
        type: activeTool,
        color,
        x, y, width: 0, height: 0,
        path: activeTool === 'marker' ? [{x, y}] : undefined,
    };
    setAnnotations(prev => [...prev, newAnnotation]);
  };
  
  const handleMouseMove = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing) return;

    const canvas = drawingCanvasRef.current[pageIndex];
     if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setAnnotations(prev => prev.map(ann => {
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
    setIsDrawing(false);
    saveAnnotations(annotations);
  };
  
   const handleEraserClick = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
        if (activeTool !== 'eraser') return;
        const canvas = drawingCanvasRef.current[pageIndex];
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Find annotation to delete - simple proximity check for now
        const annotationToDelete = annotations.find(ann => 
            ann.pageIndex === pageIndex &&
            x >= ann.x && x <= ann.x + ann.width &&
            y >= ann.y && y <= ann.y + ann.height
        );
        
        if (annotationToDelete) {
            const newAnnotations = annotations.filter(ann => ann.id !== annotationToDelete.id);
            setAnnotations(newAnnotations);
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
      />
      {isLoading ? (
        <div className="flex-grow flex items-center justify-center text-white">
          <Loader2 className="h-12 w-12 animate-spin" />
          <span className="ml-4 text-xl">Loading Document...</span>
        </div>
      ) : (
        <div ref={canvasContainerRef} className="flex-grow overflow-auto p-4 bg-gray-600 space-y-4">
          {pages.map((page, index) => (
            <PageCanvas 
                key={index} 
                page={page} 
                pageIndex={index}
                annotations={annotations.filter(a => a.pageIndex === index)}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onEraserClick={handleEraserClick}
                isDrawing={isDrawing}
                activeTool={activeTool}
                drawingCanvasRef={el => drawingCanvasRef.current[index] = el}
                drawAnnotation={drawAnnotation}
            />
          ))}
        </div>
      )}
    </div>
  );
};


const PageCanvas = ({ page, pageIndex, onMouseDown, onMouseMove, onMouseUp, onEraserClick, activeTool, drawingCanvasRef, drawAnnotation, annotations }) => {
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const render = async () => {
            const canvas = pdfCanvasRef.current;
            if (!canvas) return;
            const viewport = page.getViewport({ scale: 1.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            const canvasContext = canvas.getContext('2d');
            if (canvasContext) {
                const renderContext = { canvasContext, viewport };
                await page.render(renderContext).promise;
            }
        };
        render();
    }, [page]);
    
    useEffect(() => {
      const drawingCanvas = drawingCanvasRef.current;
      if (!drawingCanvas) return;
      
      const ctx = drawingCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        annotations.forEach(a => drawAnnotation(ctx, a));
      }

    }, [annotations, drawAnnotation, drawingCanvasRef]);

    return (
        <div 
            className="relative mx-auto shadow-lg"
            style={{ width: pdfCanvasRef.current?.width, height: pdfCanvasRef.current?.height }}
            onMouseDown={(e) => onMouseDown(pageIndex, e)}
            onMouseMove={(e) => onMouseMove(pageIndex, e)}
            onMouseUp={onMouseUp}
            onClick={(e) => onEraserClick(pageIndex, e)}
        >
            <canvas ref={pdfCanvasRef} />
            <canvas
                ref={drawingCanvasRef}
                width={pdfCanvasRef.current?.width}
                height={pdfCanvasRef.current?.height}
                className="absolute top-0 left-0"
                style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
            />
        </div>
    );
};


const AnnotationToolbar = ({ activeTool, setActiveTool, color, setColor, onSave, onClose, pdfName }) => {
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
    <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between w-full flex-shrink-0">
      <h2 className="text-lg font-semibold truncate max-w-xs">{pdfName}</h2>
      <div className="flex items-center gap-2">
        <TooltipProvider>
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
          />
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="text-white border-gray-500" onClick={onSave}><Save className="mr-2" /> Save</Button>
        <Button onClick={onClose} variant="destructive"><XCircle className="mr-2 h-5 w-5" /> Done</Button>
      </div>
    </div>
  );
};


export default PdfViewer;
