'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import { useToast } from '@/hooks/use-toast';
import type { PdfDocument, Annotation } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import { Loader2, ChevronLeft, ChevronRight, X, Highlighter, PenSquare, Download, FileJson2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
}

type Tool = 'highlight' | 'marker';

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose, userId, appId }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<Tool>('highlight');
  const [scale, setScale] = useState(1.5);
  const [annotations, setAnnotations] = useState(pdf.annotations || {});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  useEffect(() => {
    setAnnotations(pdf.annotations || {});
    setCurrentPage(1);
  }, [pdf]);

  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pageAnnotations = annotations[currentPage] || [];
    pageAnnotations.forEach(anno => {
      ctx.fillStyle = anno.type === 'highlight' ? 'rgba(255, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
      ctx.fillRect(anno.x * scale, anno.y * scale, anno.width * scale, anno.height * scale);
    });
  }, [annotations, currentPage, scale]);

  useEffect(() => {
    drawAnnotations();
  }, [drawAnnotations, currentPage, annotations, scale]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };
  
  const onPageLoadSuccess = (page: any) => {
    const containerWidth = pdfContainerRef.current?.clientWidth || 600;
    setScale(containerWidth / page.width);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const { offsetX, offsetY } = e.nativeEvent;
    const newAnno: Annotation = {
      x: offsetX / scale,
      y: offsetY / scale,
      width: 0,
      height: 0,
      type: currentTool,
      id: Date.now().toString(),
    };
    setAnnotations(prev => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), newAnno],
    }));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pageAnnotations = annotations[currentPage];
    if (!pageAnnotations || pageAnnotations.length === 0) return;

    const currentAnno = pageAnnotations[pageAnnotations.length - 1];
    const { offsetX, offsetY } = e.nativeEvent;
    
    currentAnno.width = offsetX / scale - currentAnno.x;
    currentAnno.height = offsetY / scale - currentAnno.y;
    
    setAnnotations(prev => ({ ...prev, [currentPage]: [...pageAnnotations] }));
  };

  const handleMouseUp = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    const pageAnnotations = annotations[currentPage];
    if (!pageAnnotations || pageAnnotations.length === 0) return;
    const lastAnnotation = pageAnnotations[pageAnnotations.length-1];

    if (Math.abs(lastAnnotation.width) < 5 && Math.abs(lastAnnotation.height) < 5) {
      // Remove tiny accidental clicks
       setAnnotations(prev => ({
        ...prev,
        [currentPage]: prev[currentPage].slice(0, -1),
      }));
       return;
    }

    try {
      const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
      await setDoc(doc(db, pdfDocPath), { annotations }, { merge: true });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error Saving Annotation', description: error.message });
    }
  };

  const downloadOriginal = async () => {
     if (!supabase) {
        toast({ variant: 'destructive', title: 'Download Failed', description: "Supabase not configured." });
        return;
    }
    try {
        const { data, error } = await supabase.storage.from('main').download(pdf.storagePath);
        if (error) throw error;
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdf.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Download Failed', description: error.message });
    }
  };

  const exportAnnotations = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(annotations, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${pdf.name.replace('.pdf', '')}_annotations.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between bg-muted/50 py-3">
        <CardTitle className="truncate text-lg" title={pdf.name}>{pdf.name}</CardTitle>
        <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={downloadOriginal} disabled={!supabase}><Download className="h-4 w-4" /></Button></TooltipTrigger>
                <TooltipContent><p>Download Original PDF</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={exportAnnotations}><FileJson2 className="h-4 w-4" /></Button></TooltipTrigger>
                <TooltipContent><p>Export Annotations (JSON)</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex items-center justify-center gap-4 bg-muted/20 p-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Page {currentPage} of {numPages || '...'}</span>
          <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div ref={pdfContainerRef} className="max-h-[calc(100vh-18rem)] overflow-auto bg-gray-200 dark:bg-gray-800 p-4">
          <Document
            file={pdf.url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
            error={<div className="text-destructive p-4">Error loading PDF.</div>}
          >
            <div className="relative mx-auto w-fit shadow-lg">
                <Page 
                  key={`page_${currentPage}`}
                  pageNumber={currentPage} 
                  scale={scale} 
                  onLoadSuccess={onPageLoadSuccess}
                  renderAnnotationLayer={false}
                  renderTextLayer={true}
                />
                <canvas
                  ref={canvasRef}
                  width={(pdfContainerRef.current?.clientWidth || 0) - 32} // a bit of padding
                  height={((pdfContainerRef.current?.clientWidth || 0) / (8.5/11)) } // Approximate height
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="absolute top-0 left-0 cursor-crosshair"
                />
            </div>
          </Document>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 bg-muted/50 p-3">
          <div className="text-sm font-medium">Annotation Tools</div>
          <div className="flex items-center gap-2">
            <Button variant={currentTool === 'highlight' ? 'default' : 'outline'} onClick={() => setCurrentTool('highlight')}><Highlighter className="mr-2 h-4 w-4" />Highlight</Button>
            <Button variant={currentTool === 'marker' ? 'default' : 'outline'} onClick={() => setCurrentTool('marker')} className={cn(currentTool === 'marker' && "bg-red-600 hover:bg-red-700")}><PenSquare className="mr-2 h-4 w-4" />Marker</Button>
          </div>
      </CardFooter>
    </Card>
  );
};

export default PdfViewer;
