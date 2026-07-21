import { VideoFileManagementModal } from "@/components/video-file-management-modal";
import { VideoFilePasteModal } from "@/components/video-file-paste-modal";
import { DeleteVideoFileModal } from "@/components/delete-video-file-modal";
import { FilePreviewModal } from "@/components/file-preview-modal";
import { BannedPhrasesModal } from "@/components/banned-phrases-modal";
import { AddLinkModal } from "@/components/add-link-modal";
import { AddVideoToNextLessonModal } from "@/components/add-video-to-next-lesson-modal";
import type { BannedPhrase } from "./lint-rules";

export interface WriteModalsProps {
  videoId: string;
  files: Array<{ path: string; size: number; defaultEnabled: boolean }>;

  // File modals
  selectedFilePath: string;
  selectedFileContent: string;
  isFileModalOpen: boolean;
  onFileModalClose: (open: boolean) => void;
  isPasteModalOpen: boolean;
  onPasteModalClose: (open: boolean) => void;
  onFileCreated: (path: string) => void;
  isDeleteModalOpen: boolean;
  fileToDelete: string;
  onDeleteModalClose: (open: boolean) => void;

  // File preview modal
  isPreviewModalOpen: boolean;
  previewFilePath: string;
  onPreviewModalClose: () => void;

  // Banned phrases modal
  isBannedPhrasesModalOpen: boolean;
  onBannedPhrasesModalOpenChange: (open: boolean) => void;
  bannedPhrases: BannedPhrase[];
  onAddBannedPhrase: (
    pattern: string,
    readable: string,
    caseSensitive: boolean
  ) => void;
  onRemoveBannedPhrase: (index: number) => void;
  onUpdateBannedPhrase: (index: number, updated: Partial<BannedPhrase>) => void;
  onResetBannedPhrases: () => void;

  // Default filename for the paste modal
  defaultTextFilename?: string;

  // Add link modal
  isAddLinkModalOpen: boolean;
  onAddLinkModalOpenChange: (open: boolean) => void;

  // Add video to next lesson modal
  nextLessonWithoutVideo: {
    lessonId: string;
    lessonPath: string;
    sectionPath: string;
    hasExplainerFolder: boolean;
  } | null;
  isAddVideoToNextLessonModalOpen: boolean;
  onAddVideoToNextLessonModalOpenChange: (open: boolean) => void;
}

export function WriteModals(props: WriteModalsProps) {
  const {
    videoId,
    files,
    selectedFilePath,
    selectedFileContent,
    isFileModalOpen,
    onFileModalClose,
    isPasteModalOpen,
    onPasteModalClose,
    onFileCreated,
    isDeleteModalOpen,
    fileToDelete,
    onDeleteModalClose,
    isPreviewModalOpen,
    previewFilePath,
    onPreviewModalClose,
    isBannedPhrasesModalOpen,
    onBannedPhrasesModalOpenChange,
    bannedPhrases,
    onAddBannedPhrase,
    onRemoveBannedPhrase,
    onUpdateBannedPhrase,
    onResetBannedPhrases,
    defaultTextFilename,
    isAddLinkModalOpen,
    onAddLinkModalOpenChange,
    nextLessonWithoutVideo,
    isAddVideoToNextLessonModalOpen,
    onAddVideoToNextLessonModalOpenChange,
  } = props;

  return (
    <>
      {/* File modals */}
      <VideoFileManagementModal
        videoId={videoId}
        path={selectedFilePath}
        content={selectedFileContent}
        open={isFileModalOpen}
        onOpenChange={onFileModalClose}
      />
      <VideoFilePasteModal
        videoId={videoId}
        open={isPasteModalOpen}
        onOpenChange={onPasteModalClose}
        existingFiles={files}
        onFileCreated={onFileCreated}
        defaultTextFilename={defaultTextFilename}
      />
      <DeleteVideoFileModal
        videoId={videoId}
        path={fileToDelete}
        open={isDeleteModalOpen}
        onOpenChange={onDeleteModalClose}
      />
      {/* File preview modal */}
      <FilePreviewModal
        isOpen={isPreviewModalOpen}
        onClose={onPreviewModalClose}
        videoId={videoId}
        filePath={previewFilePath}
      />
      {/* Banned phrases management modal */}
      <BannedPhrasesModal
        open={isBannedPhrasesModalOpen}
        onOpenChange={onBannedPhrasesModalOpenChange}
        phrases={bannedPhrases}
        onAddPhrase={onAddBannedPhrase}
        onRemovePhrase={onRemoveBannedPhrase}
        onUpdatePhrase={onUpdateBannedPhrase}
        onResetToDefaults={onResetBannedPhrases}
      />
      {/* Add link modal */}
      <AddLinkModal
        open={isAddLinkModalOpen}
        onOpenChange={onAddLinkModalOpenChange}
      />
      {/* Add video to next lesson modal */}
      {nextLessonWithoutVideo && (
        <AddVideoToNextLessonModal
          lessonId={nextLessonWithoutVideo.lessonId}
          lessonPath={nextLessonWithoutVideo.lessonPath}
          sectionPath={nextLessonWithoutVideo.sectionPath}
          hasExplainerFolder={nextLessonWithoutVideo.hasExplainerFolder}
          open={isAddVideoToNextLessonModalOpen}
          onOpenChange={onAddVideoToNextLessonModalOpenChange}
        />
      )}
    </>
  );
}
