
'use client';

import type { FC } from 'react';
import React, from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db, signIn } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import type { PdfDocument, Annotation } from '@/types';
import PdfUploader from '@/components/pdf/PdfUploader';
import PdfList from '@/components/pdf/PdfList';
import PdfViewer from '@/components/pdf/PdfViewer';
import { Loader2, FileText, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from "@/components/ui/toaster";


declare const __app_id: string;

const App: FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [pdfs, setPdfs] = React.useState<PdfDocument[]>([]);
  const [selectedPdf, setSelectedPdf] = React.useState<PdfDocument | null>(null);
  const [loadingPdfs, setLoadingPdfs] = React.useState(true);

  const appId = React.useMemo(() => (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'), []);

  React.useEffect(() => {
    if (user) {
      setLoadingPdfs(true);
      const pdfsCollectionPath = `artifacts/${appId}/users/${user.uid}/pdfs`;
      const q = query(collection(db, pdfsCollectionPath), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const userPdfs = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const annotations = Array.isArray(data.annotations) 
              ? data.annotations 
              : (data.annotations && typeof data.annotations === 'object' ? Object.values(data.annotations) : []);

            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate(),
                annotations: annotations.filter(Boolean),
            } as PdfDocument;
        });
        setPdfs(userPdfs);

        if (selectedPdf) {
          const updatedSelectedPdf = userPdfs.find(p => p.id === selectedPdf.id);
          if (updatedSelectedPdf) {
             setSelectedPdf(updatedSelectedPdf);
          } else {
             setSelectedPdf(null); // The selected PDF was deleted
          }
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


  const handlePdfUpdate = (updatedPdf: PdfDocument) => {
    setPdfs(prevPdfs => prevPdfs.map(p => p.id === updatedPdf.id ? updatedPdf : p));
    setSelectedPdf(updatedPdf);
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-100">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50">
        <FileText className="h-16 w-16 text-primary" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">PDF Annotator Pro</h1>
        <p className="mt-2 text-lg text-gray-500">Please sign in to manage your documents.</p>
        <Button onClick={signIn} className="mt-8 rounded-full bg-primary px-8 py-3 text-lg text-primary-foreground hover:bg-primary/90">
          <LogIn className="mr-2 h-5 w-5" />
          Sign In Anonymously
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {selectedPdf ? (
        <PdfViewer 
          key={selectedPdf.id} 
          pdf={selectedPdf} 
          onClose={() => setSelectedPdf(null)} 
          userId={user.uid} 
          appId={appId} 
          onPdfUpdate={handlePdfUpdate}
        />
      ) : (
        <>
          <header className="flex-shrink-0 border-b border-border bg-card">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">PDF Annotator Pro</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">User:</span> {user.uid.substring(0, 12)}...
              </div>
            </div>
          </header>

          <main className="container mx-auto flex-grow p-4 md:p-8">
             <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                <div className="md:col-span-4 lg:col-span-3">
                    <PdfUploader userId={user.uid} appId={appId} />
                </div>
                <div className="md:col-span-8 lg:col-span-9">
                    <PdfList
                        pdfs={pdfs}
                        onPdfSelect={setSelectedPdf}
                        loading={loadingPdfs}
                        userId={user.uid}
                        appId={appId}
                    />
                </div>
             </div>
          </main>
        </>
      )}
      <Toaster />
    </div>
  );
};

export default App;
