"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Dispute {
  id: string;
  projectTitle: string;
  reason: string;
  status: "open" | "in-review" | "resolved";
  createdDate: string;
  evidence: string[];
}

export function DisputeDetailsDialog({
  dispute,
  open,
  onOpenChange,
}: {
  dispute: Dispute | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!dispute) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl space-y-4">
        <DialogHeader>
          <DialogTitle>{dispute.projectTitle}</DialogTitle>
        </DialogHeader>

        {/* Reason */}
        <div>
          <p className="text-sm text-muted-foreground mb-1">Reason</p>
          <p>{dispute.reason}</p>
        </div>

        {/* Evidence Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dispute.evidence.length > 0 ? (
              dispute.evidence.map((file, i) => {
                const isImage = file.match(/\.(jpg|jpeg|png|gif)$/i);
                return (
                  <div key={i} className="border rounded p-2">
                    {isImage ? (
                      <img
                        src={`/uploads/${file}`}
                        alt={file}
                        className="max-h-40 rounded"
                      />
                    ) : (
                      <p className="text-sm">📄 {file}</p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm">No evidence provided</p>
            )}
          </CardContent>
        </Card>

        {/* DAO Voting Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle>DAO Voting</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Dispute resolution voting will be handled by DAO governance.
            </p>
            <Badge variant="outline" className="mt-2">
              Coming Soon
            </Badge>
          </CardContent>
        </Card>

        {/* Resolution */}
        <Card>
          <CardHeader>
            <CardTitle>Resolution Outcome</CardTitle>
          </CardHeader>
          <CardContent>
            {dispute.status === "resolved" ? (
              <>
                <p className="font-semibold text-green-500">Resolved</p>
                <p className="text-sm text-muted-foreground">
                  Final decision has been made.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Resolution pending review.
              </p>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}