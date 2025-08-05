
'use client';

import type { FC } from 'react';
import React, { useState }from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db, signIn } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import type { PdfDocument } from '@/types';
import PdfUploader from '@/components/pdf/PdfUploader';
import PdfList from '@/components/pdf/PdfList';
import PdfViewer from '@/components/pdf/PdfViewer';
import { Loader2, FileText, LogIn, Clipboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from "@/components/ui/toaster";
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';


declare const __app_id: string;

const App: FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [pdfs, setPdfs] = React.useState<PdfDocument[]>([]);
  const [selectedPdf, setSelectedPdf] = React.useState<PdfDocument | null>(null);
  const [loadingPdfs, setLoadingPdfs] = React.useState(true);
  const { toast } = useToast();
  const [uidInput, setUidInput] = useState('');

  const appId = React.useMemo(() => (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'), []);

  React.useEffect(() => {
    if (user) {
      setLoadingPdfs(true);
      const pdfsCollectionPath = `artifacts/${appId}/users/${user.uid}/pdfs`;
      const q = query(collection(db, pdfsCollectionPath), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const userPdfs = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate(),
                annotations: Array.isArray(data.annotations) ? data.annotations : [],
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
  
  const handleCopyId = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      toast({
        title: 'User ID Copied!',
        description: 'Your ID has been copied to the clipboard.',
      });
    }
  };
  
  const handleLogin = async () => {
    if (!uidInput) {
      toast({
        variant: 'destructive',
        title: 'User ID Required',
        description: 'Please enter your User ID to log in.',
      });
      return;
    }
    const signedInUser = await signIn();
    if (signedInUser && signedInUser.uid !== uidInput) {
        toast({
            variant: 'destructive',
            title: 'Login Mismatch',
            description: "The signed-in user's ID does not match the one you entered. A new session may have been created.",
        });
    }
  };
  
  const handleCreateNew = async () => {
    await signIn();
    toast({
        title: 'New Account Created',
        description: 'A new anonymous account has been created for you.',
    });
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-100">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedPdf && user) {
     return (
        <PdfViewer 
          key={selectedPdf.id} 
          pdf={selectedPdf} 
          onClose={() => setSelectedPdf(null)} 
          userId={user.uid} 
          appId={appId} 
          onPdfUpdate={handlePdfUpdate}
        />
     )
  }

  if (!user) {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md text-center">
                <FileText className="mx-auto h-16 w-16 text-primary" />
                <h1 className="mt-4 text-3xl font-bold tracking-tight">PDF Annotator Pro</h1>
                <p className="mt-2 text-lg text-gray-500">Sign in to manage your documents.</p>
                <div className="mt-8 space-y-4 text-left">
                    <div>
                        <label htmlFor="uid-input" className="text-sm font-medium text-gray-700">
                           Have a User ID? Enter it here to log back in.
                        </label>
                        <div className="mt-1 flex gap-2">
                             <Input 
                                id="uid-input"
                                type="text" 
                                placeholder="Enter your User ID"
                                value={uidInput}
                                onChange={(e) => setUidInput(e.target.value)}
                                className="flex-grow"
                            />
                            <Button onClick={handleLogin} className="bg-primary text-primary-foreground hover:bg-primary/90">
                                <LogIn className="mr-2 h-5 w-5" />
                                Login
                            </Button>
                        </div>
                         <p className="mt-2 text-xs text-gray-500">
                           Note: Firebase creates a new anonymous session. We check if it matches your ID.
                        </p>
                    </div>

                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t"></span>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-gray-50 px-2 text-gray-500">Or</span>
                        </div>
                    </div>
                    
                    <Button onClick={handleCreateNew} variant="outline" className="w-full">
                       Create a New Anonymous Account
                    </Button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
        <header className="flex-shrink-0 border-b border-border bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">PDF Annotator Pro</h1>
            </div>
            <div 
                className="text-sm text-muted-foreground flex items-center gap-2 cursor-pointer hover:text-primary"
                onClick={handleCopyId}
                title="Click to copy User ID"
            >
                <span className="font-semibold text-foreground">User:</span> 
                <span>{user.uid.substring(0, 12)}...</span>
                <Clipboard className="h-4 w-4" />
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
      <Toaster />
    </div>
  );
};

export default App;
