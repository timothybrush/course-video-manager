import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getVideoPath } from "@/lib/video-helpers";
import { Loader2 } from "lucide-react";
import { useFetcher } from "react-router";

export function AddVideoModal(props: {
  lessonId?: string;
  videoCount: number;
  hasExplainerFolder: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addVideoFetcher = useFetcher();

  if (!props.open) return null;

  const isPending = !props.lessonId;
  const isSubmitting = addVideoFetcher.state !== "idle";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Video</DialogTitle>
        </DialogHeader>
        <addVideoFetcher.Form
          method="post"
          action={
            props.lessonId
              ? `/api/lessons/${props.lessonId}/add-video`
              : undefined
          }
          onSubmit={(e) => {
            if (isPending) e.preventDefault();
          }}
          className="space-y-4 py-4"
        >
          <div className="space-y-2">
            <Label htmlFor="video-path">Video Name</Label>
            <Input
              id="video-path"
              placeholder="Problem, Solution, Explainer..."
              defaultValue={getVideoPath({
                videoCount: props.videoCount,
                hasExplainerFolder: props.hasExplainerFolder,
              })}
              name="path"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => props.onOpenChange(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Lesson…
                </>
              ) : (
                "Add Video"
              )}
            </Button>
          </div>
        </addVideoFetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
