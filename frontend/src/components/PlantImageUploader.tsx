import { useState, useCallback, useRef } from 'react';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadImage } from '@/lib/api';

interface PlantImageUploaderProps {
  value?: string;
  onChange: (url: string | undefined) => void;
}

export function PlantImageUploader({ value, onChange }: PlantImageUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      setUploading(true);
      try {
        const { url } = await uploadImage(file);
        onChange(url);
      } catch (err) {
        console.error('Upload failed:', err);
      } finally {
        setUploading(false);
      }
    },
    [onChange],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  if (value) {
    return (
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl">
        <img src={value} alt="Pflanzenfoto" className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        'relative flex aspect-[16/10] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-all duration-200',
        dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/50',
        uploading && 'opacity-50 pointer-events-none',
      )}
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <span className="text-sm text-muted-foreground">Wird hochgeladen...</span>
        </div>
      ) : (
        <>
          <ImageIcon className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              Foto hierher ziehen
            </span>
            <span className="text-xs text-muted-foreground/70">oder</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-light sm:hidden"
            >
              <Camera className="h-4 w-4" />
              Foto aufnehmen
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              <Upload className="h-4 w-4" />
              <span className="sm:hidden">Galerie</span>
              <span className="hidden sm:inline">Datei auswählen</span>
            </button>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
