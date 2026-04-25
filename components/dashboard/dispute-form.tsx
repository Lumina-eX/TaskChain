// "use client";

// import { useState } from "react";
// import { AlertCircle, Upload, X } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogDescription,
//   DialogFooter,
// } from "@/components/ui/dialog";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Textarea } from "@/components/ui/textarea";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";

// interface DisputeFormProps {
//   open: boolean;
//   onOpenChange: (open: boolean) => void;
// }

// export function DisputeForm({ open, onOpenChange }: DisputeFormProps) {
//   const [isLoading, setIsLoading] = useState(false);
// const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
//   const [formData, setFormData] = useState({
//     project: "",
//     reason: "",
//     description: "",
//     evidence: "",
//   });

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsLoading(true);

//     // Simulate API call
//     setTimeout(() => {
//       setIsLoading(false);
//       onOpenChange(false);
//       setFormData({
//         project: "",
//         reason: "",
//         description: "",
//         evidence: "",
//       });
//       setAttachedFiles([]);
//     }, 1500);
//   };

// const MAX_FILE_SIZE = 5 * 1024 * 1024;
// const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf"];

// const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
//   const files = e.target.files;
//   if (!files) return;

//   const validFiles: File[] = [];

//   Array.from(files).forEach((file) => {
//     if (!ALLOWED_TYPES.includes(file.type)) {
//       alert(`${file.name} not supported`);
//       return;
//     }

//     if (file.size > MAX_FILE_SIZE) {
//       alert(`${file.name} exceeds 5MB`);
//       return;
//     }

//     validFiles.push(file);
//   });

//   setAttachedFiles((prev) => [...prev, ...validFiles]);
// };

//   return (
//     <Dialog open={open} onOpenChange={onOpenChange}>
//       <DialogContent className="sm:max-w-md">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <AlertCircle className="h-5 w-5 text-amber-500" />
//             Raise a Dispute
//           </DialogTitle>
//           <DialogDescription>
//             Document the issue and provide evidence for fair resolution
//           </DialogDescription>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="space-y-4 py-4">
//           {/* Project Selection */}
//           <div className="space-y-2">
//             <Label htmlFor="project" className="text-sm font-semibold">
//               Select Project
//             </Label>
//             <Select
//               value={formData.project}
//               onValueChange={(value) =>
//                 setFormData({ ...formData, project: value })
//               }
//             >
//               <SelectTrigger className="border-border/40">
//                 <SelectValue placeholder="Choose a project..." />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="website">Website Redesign</SelectItem>
//                 <SelectItem value="mobile">Mobile App Development</SelectItem>
//                 <SelectItem value="logo">Logo Design</SelectItem>
//               </SelectContent>
//             </Select>
//           </div>

//           {/* Reason */}
//           <div className="space-y-2">
//             <Label htmlFor="reason" className="text-sm font-semibold">
//               Reason for Dispute
//             </Label>
//             <Select
//               value={formData.reason}
//               onValueChange={(value) =>
//                 setFormData({ ...formData, reason: value })
//               }
//             >
//               <SelectTrigger className="border-border/40">
//                 <SelectValue placeholder="Select reason..." />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="quality">Quality Issues</SelectItem>
//                 <SelectItem value="incomplete">Incomplete Work</SelectItem>
//                 <SelectItem value="specs">
//                   Doesn&apos;t Meet Specifications
//                 </SelectItem>
//                 <SelectItem value="late">Late Delivery</SelectItem>
//                 <SelectItem value="other">Other</SelectItem>
//               </SelectContent>
//             </Select>
//           </div>

//           {/* Description */}
//           <div className="space-y-2">
//             <Label htmlFor="description" className="text-sm font-semibold">
//               Detailed Description
//             </Label>
//             <Textarea
//               id="description"
//               placeholder="Explain what went wrong and what you expected..."
//               value={formData.description}
//               onChange={(e) =>
//                 setFormData({ ...formData, description: e.target.value })
//               }
//               required
//               className="border-border/40 resize-none"
//               rows={4}
//             />
//           </div>

//           {/* File Upload */}
//           <div className="space-y-2">
//             <Label htmlFor="evidence" className="text-sm font-semibold">
//               Supporting Evidence
//             </Label>
//             <div className="relative">
//               <Input
//                 id="evidence"
//                 type="file"
//                 multiple
//                 onChange={handleFileUpload}
//                 className="sr-only"
//               />
//               <Button
//                 type="button"
//                 variant="outline"
//                 className="w-full justify-start text-muted-foreground hover:text-foreground"
//                 onClick={() => document.getElementById("evidence")?.click()}
//               >
//                 <Upload className="mr-2 h-4 w-4" />
//                 Attach Files
//               </Button>
//             </div>

//             {/* Attached Files */}
//             {attachedFiles.length > 0 && (
//               <div className="space-y-2 mt-3">
//                 {attachedFiles.map((file, idx) => (
//                   <div
//                     key={idx}
//                     className="flex items-center justify-between p-2 rounded bg-card/50 border border-border/40"
//                   >
//                     <span className="text-sm">📎 {file}</span>
//                     <button
//                       type="button"
//                       onClick={() =>
//                         setAttachedFiles(
//                           attachedFiles.filter((_, i) => i !== idx),
//                         )
//                       }
//                       className="text-muted-foreground hover:text-foreground"
//                     >
//                       <X className="h-4 w-4" />
//                     </button>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>

//           {/* Info Box */}
//           <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-muted-foreground">
//             <p className="font-semibold text-foreground mb-1">⚠️ Important:</p>
//             <p>
//               Disputes are reviewed by our team within 24 hours. Provide clear
//               evidence to support your claim.
//             </p>
//           </div>

//           <DialogFooter className="gap-2 pt-4">
//             <Button
//               type="button"
//               variant="outline"
//               onClick={() => onOpenChange(false)}
//               disabled={isLoading}
//             >
//               Cancel
//             </Button>
//             <Button
//               type="submit"
//               disabled={
//                 !formData.project ||
//                 !formData.reason ||
//                 !formData.description ||
//                 isLoading
//               }
//               className="group"
//             >
//               {isLoading ? (
//                 <>Submitting...</>
//               ) : (
//                 <>
//                   <AlertCircle className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
//                   Submit Dispute
//                 </>
//               )}
//             </Button>
//           </DialogFooter>
//         </form>
//       </DialogContent>
//     </Dialog>
//   );
// }
"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { AlertCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DisputeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DisputeForm({ open, onOpenChange }: DisputeFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  const [formData, setFormData] = useState({
    project: "",
    reason: "",
    description: "",
  });

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf"];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      onOpenChange(false);

      setFormData({
        project: "",
        reason: "",
        description: "",
      });

      setAttachedFiles([]);
    }, 1500);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const validFiles: File[] = [];

    Array.from(files).forEach((file: File) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        alert(`${file.name} not supported`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} exceeds 5MB`);
        return;
      }

      validFiles.push(file);
    });

    setAttachedFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Raise a Dispute
          </DialogTitle>
          <DialogDescription>
            Document the issue and provide evidence for fair resolution
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Project */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Select Project</Label>
            <Select
              value={formData.project}
              onValueChange={(value) =>
                setFormData({ ...formData, project: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a project..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="website">Website Redesign</SelectItem>
                <SelectItem value="mobile">Mobile App</SelectItem>
                <SelectItem value="logo">Logo Design</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Reason</Label>
            <Select
              value={formData.reason}
              onValueChange={(value) =>
                setFormData({ ...formData, reason: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quality">Quality Issues</SelectItem>
                <SelectItem value="incomplete">Incomplete Work</SelectItem>
                <SelectItem value="specs">Doesn't Meet Specs</SelectItem>
                <SelectItem value="late">Late Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Description</Label>
            <Textarea
              placeholder="Explain the issue..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
            />
          </div>

          {/* Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Evidence</Label>

            <Input
              id="file-upload"
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                document.getElementById("file-upload")?.click()
              }
              className="w-full"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </Button>

            {/* Preview */}
            {attachedFiles.length > 0 && (
              <div className="space-y-3 mt-3">
                {attachedFiles.map((file: File, idx: number) => {
                  const isImage = file.type.startsWith("image/");

                  return (
                    <div key={idx} className="border rounded p-2 space-y-2">
                      {isImage && (
                        <img
                          src={URL.createObjectURL(file)}
                          className="h-20 rounded"
                        />
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-sm">{file.name}</span>

                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={
                !formData.project ||
                !formData.reason ||
                !formData.description ||
                isLoading
              }
            >
              {isLoading ? "Submitting..." : "Submit Dispute"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}