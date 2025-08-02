'use client';

import type { FC } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db, signIn } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import type { PdfDocument } from '@/types';
import PdfUploader from '@/components/pdf/PdfUploader';
import PdfList from '@/components/pdf/PdfList';
import PdfViewer from '@/components/pdf/PdfViewer';
import { Loader2, FileText, LogIn } from 'lucide-react';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Button } from '@/components/ui/button';

// The worker is now handled by Next.js's bundler, so we no longer set the workerSrc manually.

declare const __app_id: string;

const App: FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [pdfs, setPdfs] = useState<PdfDocument[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<PdfDocument | null>(null);
  const [loadingPdfs, setLoadingPdfs] = useState(true);

  const appId = useMemo(() => (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'), []);

  useEffect(() => {
    if (user) {
      setLoadingPdfs(true);
      const pdfsCollectionPath = `artifacts/${appId}/users/${user.uid}/pdfs`;
      const q = query(collection(db, pdfsCollectionPath), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const userPdfs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
        } as PdfDocument));
        setPdfs(userPdfs);

        if (selectedPdf) {
          const updatedSelectedPdf = userPdfs.find(p => p.id === selectedPdf.id);
          setSelectedPdf(updatedSelectedPdf || null);
        }
        setLoadingPdfs(false);
      }, (error) => {
        console.error("Error fetching PDFs:", error);
        setLoadingPdfs(false);
      });

      return () => unsubscribe();
    } else if (!authLoading) {
      setPdfs([]);
      setLoadingPdfs(false);
      setSelectedPdf(null);
    }
  }, [user, authLoading, appId, selectedPdf?.id]);

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
        <FileText className="h-16 w-16 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">PDF Annotator Pro</h1>
        <p className="mt-2 text-muted-foreground">Please sign in to manage your documents.</p>
        <Button onClick={signIn} className="mt-6">
          <LogIn className="mr-2 h-4 w-4" />
          Sign In Anonymously
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">PDF Annotator Pro</h1>
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">User ID:</span> {user.uid}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4 xl:col-span-3">
            <div className="space-y-6">
              <PdfUploader userId={user.uid} appId={appId} />
              <PdfList
                pdfs={pdfs}
                selectedPdfId={selectedPdf?.id}
                onPdfSelect={setSelectedPdf}
                loading={loadingPdfs}
                userId={user.uid}
                appId={appId}
              />
            </div>
          </div>

          <div className="lg:col-span-8 xl:col-span-9">
            {selectedPdf ? (
              <PdfViewer pdf={selectedPdf} onClose={() => setSelectedPdf(null)} userId={user.uid} appId={appId} />
            ) : (
              <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-lg border-2 border-dashed bg-card">
                <div className="text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">No PDF Selected</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload or select a PDF from the list to start annotating.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
