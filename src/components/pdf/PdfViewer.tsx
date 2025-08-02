'use client';

import React from 'react';
import { useToast } from '@/hooks/use-toast';
import type { PdfDocument } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { X, Download, FileJson2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PdfViewerProps {
  pdf: PdfDocument;
  onClose: () => void;
  userId: string;
  appId: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, onClose }) => {
  const { toast } = useToast();

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
      <CardContent className="p-0 flex-grow">
          <iframe
            src={pdf.url}
            className="w-full h-full border-0"
            title={pdf.name}
          />
      </CardContent>
    </Card>
  );
};

export default PdfViewer;
