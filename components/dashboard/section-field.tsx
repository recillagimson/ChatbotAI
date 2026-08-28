"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload } from "lucide-react";

const ACCEPT = ".pdf,.docx,.txt,.md,.csv";

/**
 * A labeled textarea for a prompt section, with an "Upload file → convert to
 * text" button. The file is sent to POST /api/documents/extract (stateless,
 * server-side PDF/DOCX/TXT/MD/CSV → text) and the result is APPENDED to the
 * current value so the user can combine an upload with typed notes, then edit.
 *
 * Shared by the client prompts form (Personality) and the admin client-detail
 * editor (all three sections).
 */
export function SectionField({
  id,
  label,
  value,
  onChange,
  placeholder,
  helper,
  rows = 8,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  helper?: string;
  rows?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    setUploadError(null);
    setNotice(null);
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Could not read this file.");
        return;
      }
      onChange(value.trim() ? `${value.trim()}\n\n${data.text}` : data.text);
      // A cut should never be silent (the old 20k limit dropped rules mid-section).
      if (data.truncated) {
        setNotice("This file was very long and was trimmed to fit. Review the section and edit if anything important was cut.");
      }
    } catch {
      setUploadError("Could not read this file. Please try again.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={extracting}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {extracting ? "Reading…" : "Upload file"}
          </Button>
        </div>
      </div>
      <Textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {notice && <p className="text-xs text-amber-600">{notice}</p>}
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}
