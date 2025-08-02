'use client';

import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { PdfDocument } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { X, Download, FileJson2, Loader2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose }) => {
  const { toast } = useToast();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

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
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pdf.annotations || {}, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${pdf.name.replace('.pdf', '')}_annotations.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <Card className="overflow-hidden h-[calc(100vh-12rem)] flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between bg-muted/50 py-3">
        <CardTitle className="truncate text-lg" title={pdf.name}>{pdf.name}</CardTitle>
        <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setScale(s => s * 1.2)}><ZoomIn className="h-4 w-4" /></Button></TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
              </Tooltip>
               <Tooltip>
                <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setScale(s => s / 1.2)} disabled={scale <= 0.5}><ZoomOut className="h-4 w-4" /></Button></TooltipTrigger>
                <TooltipContent><p>Zoom Out</p></TooltipContent>
              </Tooltip>
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
      <CardContent className="p-0 flex-grow overflow-auto bg-gray-200 dark:bg-gray-800">
          <div className="p-4 flex justify-center">
            <Document
                file={pdf.url}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
                className="flex flex-col items-center"
            >
                <Page 
                    pageNumber={pageNumber} 
                    scale={scale} 
                    renderAnnotationLayer={false}
                />
            </Document>
          </div>
      </CardContent>
       {numPages && (
        <div className="flex items-center justify-center p-2 bg-muted/50 border-t">
          <Button variant="ghost" size="icon" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            Page {pageNumber} of {numPages}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
};

export default PdfViewer;
