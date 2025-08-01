'use client';

import React from 'react';
import type { PdfDocument } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  selectedPdfId?: string;
  onPdfSelect: (pdf: PdfDocument) => void;
  loading: boolean;
  userId: string;
  appId: string;
}

const PdfList: React.FC<PdfListProps> = ({ pdfs, selectedPdfId, onPdfSelect, loading, userId, appId }) => {
  const { toast } = useToast();

  const handleDelete = async (pdf: PdfDocument) => {
    try {
      // Delete from Supabase
      const { error: storageError } = await supabase.storage
        .from('pdf_documents')
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="h-5 w-5" />
          My Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : pdfs.length > 0 ? (
            <div className="space-y-2">
              {pdfs.map(pdf => (
                <div key={pdf.id} className="group flex items-center gap-2">
                  <Button
                    variant={selectedPdfId === pdf.id ? 'default' : 'ghost'}
                    className="w-full justify-start truncate"
                    onClick={() => onPdfSelect(pdf)}
                  >
                    <FileText className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{pdf.name}</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 opacity-0 group-hover:opacity-100">
                        <Trash2 className="h-4 w-4 text-destructive" />
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
                          "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        )}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">No documents uploaded yet.</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default PdfList;
