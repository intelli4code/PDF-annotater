
'use client';

import React from 'react';
import type { Annotation } from '@/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';

interface CommentsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: Annotation[];
  onUpdateComment: (id: string, comment: string) => void;
}

const CommentsSidebar: React.FC<CommentsSidebarProps> = ({
  isOpen,
  onClose,
  annotations,
  onUpdateComment,
}) => {
  const annotationsWithContent = annotations.filter(ann => ann.content && ann.content.text);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] p-0 flex flex-col">
        <SheetHeader className="p-6">
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle />
            Annotations & Comments
          </SheetTitle>
          <SheetDescription>
            View and manage comments for your annotations. Changes are saved automatically.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-grow">
          <div className="p-6 pt-0 space-y-4">
            {annotationsWithContent.length > 0 ? (
              annotationsWithContent.map(ann => (
                <Card key={ann.id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      <Badge variant={ann.type === 'highlight' ? 'default' : 'destructive'}>
                        Page {ann.pageIndex + 1}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="line-clamp-2 italic pt-2">
                      "{ann.content.text}"
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Add a comment..."
                      defaultValue={ann.comment}
                      onBlur={(e) => onUpdateComment(ann.id, e.target.value)}
                      className="w-full"
                    />
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center text-muted-foreground pt-10">
                <p>No annotations with text content yet.</p>
                <p className="text-sm">Highlight some text to get started.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default CommentsSidebar;
