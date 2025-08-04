
'use client';

import React from 'react';
import type { PdfDocument } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, FileText, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';

interface PdfListProps {
  pdfs: PdfDocument[];
  onPdfSelect: (pdf: PdfDocument) => void;
  loading: boolean;
  userId: string;
  appId: string;
}

const PdfList: React.FC<PdfListProps> = ({ pdfs, onPdfSelect, loading, userId, appId }) => {
  const { toast } = useToast();

  const handleDelete = async (pdf: PdfDocument) => {
    if (!supabase) {
      toast({
          variant: 'destructive',
          title: 'Supabase Not Configured',
          description: 'Please configure your Supabase credentials to delete files.',
      });
      return;
    }
    
    try {
      // Delete from Supabase
      const { error: storageError } = await supabase.storage
        .from('main')
        .remove([pdf.storagePath]);

      if (storageError) {
        console.warn("Storage deletion might have failed, but proceeding with Firestore deletion:", storageError.message);
      }

      // Delete from Firestore
      const pdfDocPath = `artifacts/${appId}/users/${userId}/pdfs/${pdf.id}`;
      await deleteDoc(doc(db, pdfDocPath));

      toast({
        title: "PDF Deleted",
        description: `"${pdf.name}" has been successfully deleted.`,
      });
    } catch (error: any) {
      console.error("Deletion failed:", error);
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: error.message || "An unexpected error occurred.",
      });
    }
  };

  return (
    <Card className="flex-grow flex flex-col h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="h-5 w-5" />
          My Documents
        </CardTitle>
        <CardDescription>Select a document to view and edit.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow p-4">
        <ScrollArea className="h-[calc(100vh-22rem)]">
          {loading ? (
            <div className="space-y-3 pr-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : pdfs.length > 0 ? (
            <div className="space-y-3 pr-4">
              {pdfs.map(pdf => (
                <div key={pdf.id} className="group flex items-center gap-2">
                  <Button
                    variant='outline'
                    className="w-full justify-start truncate p-3 h-auto text-left flex flex-col items-start"
                    onClick={() => onPdfSelect(pdf)}
                  >
                    <span className="font-semibold text-primary flex items-center gap-2">
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{pdf.name}</span>
                    </span>
                    <span className="text-xs text-muted-foreground mt-1">
                        {pdf.createdAt ? new Date(pdf.createdAt.toString()).toLocaleDateString() : 'Date unknown'}
                    </span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" disabled={!supabase}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete "{pdf.name}" and all its annotations.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(pdf)} className={cn(
                          "bg-red-600 text-white hover:bg-red-700"
                        )}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground pt-10">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium">No Documents Found</h3>
                <p className="mt-1 text-sm">
                    Upload your first PDF to get started.
                </p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default PdfList;
