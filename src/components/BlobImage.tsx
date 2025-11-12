"use client";

import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface BlobImageProps {
  dbId: string; // server database id
  table: string;
  column: string;
  rowid: number;
  inlinePreviewHeight?: number; // px height cap for inline preview
}

export function BlobImage({ dbId, table, column, rowid, inlinePreviewHeight = 160 }: BlobImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const src = `/api/databases/${encodeURIComponent(dbId)}/blob?table=${encodeURIComponent(table)}&column=${encodeURIComponent(column)}&rowid=${rowid}`;

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={() => setLoaded(true)}>Load image</Button>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    );
  }

  return (
    <>
      {/* Inline preview fits inside column width and stays contained */}
      <div className="mt-1 w-full overflow-hidden" onClick={() => setOpen(true)}>
        <div className="cursor-zoom-in">
          <Image
            src={src}
            alt="BLOB preview"
            width={600}
            height={800}
            onError={() => setError('Failed to load image')}
            style={{ width: '100%', height: 'auto', maxHeight: inlinePreviewHeight, objectFit: 'contain', display: 'block' }}
          />
        </div>
      </div>

      {/* Modal for full-size */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] p-2">
          <DialogHeader>
            <DialogTitle>Image preview</DialogTitle>
          </DialogHeader>
          <div className="relative mx-auto w-[90vw] max-w-[1200px] h-[80vh]">
            <Image
              src={src}
              alt="Full image"
              fill
              sizes="(max-width: 1200px) 90vw, 1200px"
              style={{ objectFit: 'contain' }}
            />
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-muted-foreground">Click outside to close</span>
            <a className="text-xs underline" href={src} target="_blank" rel="noopener noreferrer">Open original</a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
