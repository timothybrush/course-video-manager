import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckIcon,
  ChevronDown,
  CopyIcon,
  DownloadIcon,
  FilmIcon,
  FolderOpen,
  PencilLineIcon,
  ScrollTextIcon,
  SendIcon,
} from "lucide-react";

export const StudioActionsDropdown = (props: {
  allClipsHaveSilenceDetected: boolean;
  allClipsHaveText: boolean;
  onExport: () => void;
  onRenderVertical?: () => void;
  videoId: string;
  isCopied: boolean;
  copyTranscriptToClipboard: () => void;
  youtubeChapters: { timestamp: string; name: string }[];
  isChaptersCopied: boolean;
  copyYoutubeChaptersToClipboard: () => void;
  onRenameVideoClick: () => void;
  onRevealInFileSystem?: () => void;
  isLogPathCopied: boolean;
  copyLogPathToClipboard: () => void;
}) => {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                disabled={!props.allClipsHaveSilenceDetected}
              >
                Actions
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        {!props.allClipsHaveSilenceDetected && (
          <TooltipContent>
            <p>Waiting for silence detection to complete</p>
          </TooltipContent>
        )}
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        {props.onRenderVertical && (
          <DropdownMenuItem onSelect={props.onRenderVertical}>
            <FilmIcon className="w-4 h-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">Render Vertical</span>
              <span className="text-xs text-muted-foreground">
                Render captioned 9:16 video
              </span>
            </div>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem disabled>
          <SendIcon className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span className="font-medium">Post TikTok</span>
            <span className="text-xs text-muted-foreground">
              Post to TikTok via Buffer
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <SendIcon className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span className="font-medium">Post Shorts</span>
            <span className="text-xs text-muted-foreground">
              Upload as a YouTube Short
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CopyIcon className="w-4 h-4 mr-2" />
            Copy
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenuItem
                    disabled={!props.allClipsHaveText}
                    onSelect={props.copyTranscriptToClipboard}
                  >
                    {props.isCopied ? (
                      <CheckIcon className="w-4 h-4 mr-2" />
                    ) : (
                      <CopyIcon className="w-4 h-4 mr-2" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium">Copy Transcript</span>
                      <span className="text-xs text-muted-foreground">
                        Copy all transcript to clipboard
                      </span>
                    </div>
                  </DropdownMenuItem>
                </div>
              </TooltipTrigger>
              {!props.allClipsHaveText && (
                <TooltipContent side="left">
                  <p>Waiting for transcription to complete</p>
                </TooltipContent>
              )}
            </Tooltip>

            {props.youtubeChapters.length > 0 && (
              <DropdownMenuItem onSelect={props.copyYoutubeChaptersToClipboard}>
                {props.isChaptersCopied ? (
                  <CheckIcon className="w-4 h-4 mr-2" />
                ) : (
                  <CopyIcon className="w-4 h-4 mr-2" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium">Copy YouTube Chapters</span>
                  <span className="text-xs text-muted-foreground">
                    Copy chapter timestamps to clipboard
                  </span>
                </div>
              </DropdownMenuItem>
            )}

            <DropdownMenuItem onSelect={props.copyLogPathToClipboard}>
              {props.isLogPathCopied ? (
                <CheckIcon className="w-4 h-4 mr-2" />
              ) : (
                <ScrollTextIcon className="w-4 h-4 mr-2" />
              )}
              <div className="flex flex-col">
                <span className="font-medium">Copy Log Path</span>
                <span className="text-xs text-muted-foreground">
                  Copy operation log file path
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onSelect={props.onExport}>
          <DownloadIcon className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span className="font-medium">Export</span>
            <span className="text-xs text-muted-foreground">
              Export video clips to file
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={props.onRenameVideoClick}>
          <PencilLineIcon className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span className="font-medium">Rename Video</span>
            <span className="text-xs text-muted-foreground">
              Change the video name
            </span>
          </div>
        </DropdownMenuItem>

        {props.onRevealInFileSystem && (
          <DropdownMenuItem onSelect={props.onRevealInFileSystem}>
            <FolderOpen className="w-4 h-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">Reveal in File System</span>
              <span className="text-xs text-muted-foreground">
                Open in Windows Explorer
              </span>
            </div>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
