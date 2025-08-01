'use client';

import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, Loader2 } from 'lucide-react';

interface PdfUploaderProps {
  userId: string;
  appId: string;
}

const PdfUploader: React.FC<PdfUploaderProps> = ({ userId, appId }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type !== 'application/pdf') {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: 'Please select a PDF file.',
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        variant: 'destructive',
        title: 'No File Selected',
        description: 'Please select a PDF file to upload.',
      });
      return;
    }

    setIsUploading(true);
    const fileName = `${Date.now()}_${selectedFile.name}`;
    const storagePath = `${userId}/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('pdf_documents')
        .upload(storagePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('pdf_documents')
        .getPublicUrl(storagePath);
      
      if (!publicUrlData.publicUrl) {
        throw new Error("Could not get public URL for the uploaded file.");
      }

      const pdfsCollectionPath = `artifacts/${appId}/users/${userId}/pdfs`;
      await addDoc(collection(db, pdfsCollectionPath), {
        name: selectedFile.name,
        storagePath: storagePath,
        url: publicUrlData.publicUrl,
        annotations: {},
        createdAt: serverTimestamp(),
      });

      toast({
        title: 'Upload Successful',
        description: `"${selectedFile.name}" has been uploaded.`,
      });

    } catch (error: any) {
      console.error('Upload failed:', error);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadCloud className="h-5 w-5" />
          Upload New PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        <Button onClick={handleUpload} disabled={isUploading || !selectedFile} className="w-full">
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="mr-2 h-4 w-4" />
          )}
          {isUploading ? 'Uploading...' : 'Upload'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default PdfUploader;
